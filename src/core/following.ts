import { TwitterOpenApi } from 'twitter-openapi-typescript'
import {
  BATCH_SIZE,
  DEFAULT_MAX_EMPTY_PAGES,
  FOLLOWING_PAGE_SIZE,
  getEnvironmentNumber,
  isEnvironmentFlagSet,
} from '../shared/config'
import type {
  ApiBirthdate,
  ApiUser,
  BirthdateInfo,
  BirthdaysOutput,
  ResumeState,
  ResumeUserEntry,
} from '../shared/types'
import { buildOutput, formatBirthdate } from './output'
import { loadProgress, saveOutput, saveProgress } from '../infra/storage'
import { getResponseStatus, withRetry } from '../shared/retry'

export type TwitterClient = Awaited<
  ReturnType<TwitterOpenApi['getClientFromCookies']>
>

/**
 * 配列を指定サイズで分割する。
 * @param items 元の配列
 * @param size 1チャンクあたりの件数
 * @returns 分割後の配列
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/**
 * APIの誕生日情報を出力用の型に正規化する。
 * @param birthdate APIの誕生日情報
 * @returns 正規化した誕生日情報
 */
function normalizeBirthdate(
  birthdate?: ApiBirthdate | null
): BirthdateInfo | undefined {
  if (!birthdate) {
    return undefined
  }
  return {
    day: birthdate.day,
    month: birthdate.month,
    year: birthdate.year,
    visibility: birthdate.visibility,
    yearVisibility: birthdate.yearVisibility,
  }
}

/**
 * APIユーザー情報を進捗保存用の形式に変換する。
 * @param user APIユーザー情報
 * @returns 進捗保存用のユーザー情報
 */
function toResumeUserEntry(user: ApiUser): ResumeUserEntry | null {
  const legacy = user.legacy
  if (!legacy?.screenName) {
    return null
  }
  const restId = user.restId ?? user.id
  if (!restId) {
    return null
  }
  return {
    id: restId,
    screenName: legacy.screenName,
    name: legacy.name,
    birthdate: normalizeBirthdate(user.legacyExtendedProfile?.birthdate),
  }
}

/**
 * フォロー一覧と詳細情報を取得して誕生日出力を作成する。
 * @param client Twitter APIクライアント
 * @param userId 対象ユーザーID
 * @param sourceUser 対象ユーザー名
 * @param outputPath 出力ファイルのパス
 * @param progressPath 進捗ファイルのパス
 * @returns 誕生日出力
 */
export async function fetchFollowingUsers(
  client: TwitterClient,
  userId: string,
  sourceUser: string,
  outputPath: string,
  progressPath: string
): Promise<BirthdaysOutput> {
  const usersById = new Map<string, ResumeUserEntry>()

  const progress = loadProgress(progressPath)
  let stage: ResumeState['stage'] = 'following'
  let cursor: string | undefined
  let seenCursors = new Set<string>()
  let page = 0
  let processedUsers = 0
  let missingBirthdateIds: string[] | undefined
  let detailBatchIndex = 0
  let birthdateLookupCount = 0
  const isBirthdateLookupEnabled = isEnvironmentFlagSet(
    'PER_USER_BIRTHDATE_LOOKUP'
  )
  const maxBirthdateLookup = getEnvironmentNumber('MAX_BIRTHDATE_LOOKUP', 0)

  if (progress?.sourceUser === sourceUser) {
    stage = progress.stage
    cursor = progress.cursor
    seenCursors = new Set(progress.seenCursors)
    page = progress.page
    processedUsers = progress.processedUsers
    missingBirthdateIds = progress.missingBirthdateIds
    detailBatchIndex = progress.detailBatchIndex ?? 0
    for (const user of progress.users) {
      usersById.set(user.id, user)
    }
    console.log(
      `Resuming from progress file. Stage=${stage}, page=${page}, processed=${processedUsers}.`
    )
    if (isEnvironmentFlagSet('FORCE_DETAIL_REFRESH')) {
      stage = 'details'
      missingBirthdateIds = usersById
        .values()
        .filter((user) => !user.birthdate)
        .map((user) => user.id)
        .toArray()
      detailBatchIndex = 0
      console.log('FORCE_DETAIL_REFRESH=1: recalculated missing birthdates.')
    }
    if (isEnvironmentFlagSet('FORCE_FOLLOWING_REFRESH')) {
      stage = 'following'
      cursor = undefined
      seenCursors = new Set()
      page = 0
      processedUsers = 0
      missingBirthdateIds = undefined
      detailBatchIndex = 0
      usersById.clear()
      console.log('FORCE_FOLLOWING_REFRESH=1: restarting following fetch.')
    }
  }

  const maxPages = getEnvironmentNumber('MAX_FOLLOWING_PAGES', 0)

  /**
   * 進捗保存用の状態オブジェクトを構築する。
   * @param stageValue 処理ステージ
   * @param detailIndex 詳細取得のバッチ番号
   * @returns 進捗状態
   */
  const buildProgressState = (
    stageValue: ResumeState['stage'],
    detailIndex?: number
  ): ResumeState => ({
    sourceUser,
    stage: stageValue,
    cursor,
    seenCursors: [...seenCursors],
    page,
    processedUsers,
    users: usersById.values().toArray(),
    missingBirthdateIds,
    detailBatchIndex: detailIndex,
  })

  /**
   * 進捗ファイルを保存する。
   * @param stageValue 処理ステージ
   * @param detailIndex 詳細取得のバッチ番号
   */
  const persistProgress = (
    stageValue: ResumeState['stage'],
    detailIndex?: number
  ): void => {
    saveProgress(progressPath, buildProgressState(stageValue, detailIndex))
  }

  /**
   * 出力と進捗をまとめて保存する。
   * @param stageValue 処理ステージ
   * @param detailIndex 詳細取得のバッチ番号
   */
  const persistState = (
    stageValue: ResumeState['stage'],
    detailIndex?: number
  ): void => {
    saveOutput(outputPath, buildOutput(usersById, sourceUser))
    persistProgress(stageValue, detailIndex)
  }

  /**
   * 追加の誕生日照会を実行可能か判定する。
   * @returns 実行可能なら true
   */
  const canLookupBirthdate = (): boolean =>
    isBirthdateLookupEnabled &&
    (maxBirthdateLookup === 0 || birthdateLookupCount < maxBirthdateLookup)

  /**
   * ユーザー単体APIで誕生日を再照会する。
   * @param screenName 対象のスクリーンネーム
   * @returns 誕生日情報
   */
  const lookupBirthdate = async (
    screenName: string
  ): Promise<BirthdateInfo | undefined> => {
    const lookup = await withRetry(
      () =>
        client.getUserApi().getUserByScreenName({
          screenName,
        }),
      {
        maxRetries: 2,
        baseDelayMs: 2000,
        operationName: `Lookup birthdate ${screenName}`,
      }
    )
    birthdateLookupCount += 1
    return normalizeBirthdate(
      lookup.data.user?.legacyExtendedProfile?.birthdate
    )
  }

  /**
   * フォロー一覧1ページ分のエントリをMapに反映する。
   * @param entries フォロー一覧のエントリ一覧
   * @returns 新規追加したユーザー数
   */
  const processFollowingPageEntries = (
    entries: Awaited<
      ReturnType<ReturnType<TwitterClient['getUserListApi']>['getFollowing']>
    >['data']['data']
  ): number => {
    let added = 0
    for (const entry of entries) {
      const user = entry.user
      if (!user) {
        continue
      }
      const userEntry = toResumeUserEntry(user)
      if (!userEntry || usersById.has(userEntry.id)) {
        continue
      }
      usersById.set(userEntry.id, userEntry)
      added += 1
      processedUsers += 1
      console.log(
        `Processed ${processedUsers} users. Birthdays found: ${
          usersById
            .values()
            .filter((item) => item.birthdate)
            .toArray().length
        }`
      )
      persistState('following')
    }
    return added
  }

  /**
   * 取得したユーザー情報を既存Mapに反映する。
   * @param user APIユーザー情報
   * @param isExistingRequired 既存エントリが必須かどうか
   * @returns 更新後のユーザー情報
   */
  const upsertUser = (
    user: ApiUser,
    isExistingRequired = false
  ): ResumeUserEntry | null => {
    const entry = toResumeUserEntry(user)
    if (!entry) {
      return null
    }
    const current = usersById.get(entry.id)
    if (isExistingRequired && !current) {
      return null
    }
    if (!entry.birthdate && current?.birthdate) {
      entry.birthdate = current.birthdate
    }
    usersById.set(entry.id, entry)
    return entry
  }

  /**
   * ユーザー詳細1件をMapに反映し、必要なら誕生日を再照会する。
   * @param user APIユーザー情報
   * @param batchIndex 現在処理中のバッチ番号(進捗保存用)
   */
  const applyUserDetail = async (
    user: ApiUser,
    batchIndex: number
  ): Promise<void> => {
    const entry = upsertUser(user, true)
    if (!entry) {
      return
    }
    if (!entry.birthdate && canLookupBirthdate()) {
      const lookupResult = await lookupBirthdate(entry.screenName)
      if (lookupResult) {
        entry.birthdate = lookupResult
        usersById.set(entry.id, entry)
      }
    }
    const birthdateText = entry.birthdate
      ? formatBirthdate(entry.birthdate)
      : 'none'
    console.log(
      `Updated user ${entry.id} (${entry.screenName}). Birthdate: ${birthdateText}`
    )
    persistState('details', batchIndex)
  }

  /**
   * 一括取得APIのレスポンスに含まれるユーザー詳細をすべて反映する。
   * @param detailResponse 一括取得APIのレスポンス
   * @param batchIndex 現在処理中のバッチ番号(進捗保存用)
   */
  const processDetailResponseBatch = async (
    detailResponse: Awaited<
      ReturnType<ReturnType<TwitterClient['getUsersApi']>['getUsersByRestIds']>
    >,
    batchIndex: number
  ): Promise<void> => {
    for (const detail of detailResponse.data) {
      const user = detail.user
      if (!user) {
        continue
      }
      await applyUserDetail(user, batchIndex)
    }
  }

  /**
   * 一括取得APIが利用できない場合に、ユーザー単体APIで詳細を反映する。
   * @param restIds 対象ユーザーIDの一覧
   * @param batchIndex 現在処理中のバッチ番号(進捗保存用)
   */
  const processDetailFallbackBatch = async (
    restIds: string[],
    batchIndex: number
  ): Promise<void> => {
    for (const restId of restIds) {
      const current = usersById.get(restId)
      if (!current) {
        continue
      }
      const detail = await withRetry(
        () => client.getUserApi().getUserByRestId({ userId: restId }),
        {
          maxRetries: 3,
          baseDelayMs: 2000,
          operationName: `Fetch user ${restId}`,
        }
      )
      const user = detail.data.user
      if (!user) {
        continue
      }
      await applyUserDetail(user, batchIndex)
    }
  }

  if (stage === 'following') {
    const maxUsers = getEnvironmentNumber('MAX_FOLLOWING_USERS', 0)
    const maxEmptyPages = getEnvironmentNumber(
      'MAX_EMPTY_PAGES',
      DEFAULT_MAX_EMPTY_PAGES
    )
    let emptyPages = 0
    if (maxUsers > 0 && processedUsers >= maxUsers) {
      console.warn(
        `Already processed ${processedUsers} users (>= MAX_FOLLOWING_USERS=${maxUsers}). Skipping following fetch.`
      )
    } else {
      while (true) {
        page += 1
        if (maxPages > 0 && page > maxPages) {
          console.warn(`Reached MAX_FOLLOWING_PAGES=${maxPages}, stopping.`)
          break
        }
        console.log(`Fetching following list page ${page}...`)

        const following = await withRetry(
          () =>
            client.getUserListApi().getFollowing({
              userId,
              cursor,
              count: FOLLOWING_PAGE_SIZE,
            }),
          {
            maxRetries: 3,
            baseDelayMs: 2000,
            operationName: 'Fetch following list',
          }
        )

        const addedThisPage = processFollowingPageEntries(following.data.data)

        console.log(
          `Page ${page} done. Added ${addedThisPage} users. Total: ${usersById.size}.`
        )
        if (maxUsers > 0 && processedUsers >= maxUsers) {
          console.warn(`Reached MAX_FOLLOWING_USERS=${maxUsers}, stopping.`)
          break
        }
        if (addedThisPage === 0) {
          emptyPages += 1
          if (emptyPages >= maxEmptyPages) {
            console.warn(
              `No new users for ${emptyPages} consecutive pages. Stopping following fetch.`
            )
            break
          }
        } else {
          emptyPages = 0
        }
        const nextCursor = following.data.cursor.bottom?.value
        if (!nextCursor || seenCursors.has(nextCursor)) {
          break
        }
        seenCursors.add(nextCursor)
        cursor = nextCursor
        persistProgress('following')
      }
    }

    stage = 'details'
    missingBirthdateIds = usersById
      .values()
      .filter((user) => !user.birthdate)
      .map((user) => user.id)
      .toArray()
    const maxDetailUsers = getEnvironmentNumber('MAX_DETAIL_USERS', 0)
    if (maxDetailUsers > 0 && missingBirthdateIds.length > maxDetailUsers) {
      missingBirthdateIds = missingBirthdateIds.slice(0, maxDetailUsers)
    }
    detailBatchIndex = 0
    persistProgress(stage, detailBatchIndex)
  }

  if (stage === 'details') {
    missingBirthdateIds ??= usersById
      .values()
      .filter((user) => !user.birthdate)
      .map((user) => user.id)
      .toArray()
    const maxDetailUsers = getEnvironmentNumber('MAX_DETAIL_USERS', 0)
    if (maxDetailUsers > 0 && missingBirthdateIds.length > maxDetailUsers) {
      missingBirthdateIds = missingBirthdateIds.slice(0, maxDetailUsers)
    }

    if (missingBirthdateIds.length > 0) {
      const batches = chunkArray(missingBirthdateIds, BATCH_SIZE)
      let batchIndex = detailBatchIndex
      for (; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex]
        console.log(
          `Fetching user details batch ${batchIndex + 1}/${batches.length} (${batch.length} users)...`
        )
        let detailResponse: Awaited<
          ReturnType<
            ReturnType<TwitterClient['getUsersApi']>['getUsersByRestIds']
          >
        > | null = null
        try {
          detailResponse = await withRetry(
            () =>
              client.getUsersApi().getUsersByRestIds({
                userIds: batch,
                extraParam: { withSafetyModeUserFields: true },
              }),
            {
              maxRetries: 3,
              baseDelayMs: 2000,
              operationName: 'Fetch user details',
            }
          )
        } catch (error) {
          const status = getResponseStatus(error)
          if (status === 403) {
            console.warn(
              'UsersByRestIds returned 403. Falling back to per-user fetch.'
            )
          } else {
            throw error
          }
        }

        await (detailResponse
          ? processDetailResponseBatch(detailResponse, batchIndex)
          : processDetailFallbackBatch(batch, batchIndex))
      }
    }
    stage = 'done'
    persistProgress(stage, chunkArray(missingBirthdateIds, BATCH_SIZE).length)
  }

  return buildOutput(usersById, sourceUser)
}
