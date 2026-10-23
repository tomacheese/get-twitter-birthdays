import type { ApiUser, ResumeState } from '../shared/types'
import { loadProgress, saveProgress } from '../infra/storage'
import { fetchFollowingUsers } from './following'
import type { TwitterClient } from './following'

jest.mock('../infra/storage', () => ({
  loadProgress: jest.fn(),
  saveProgress: jest.fn(),
  saveOutput: jest.fn(),
}))

const OUTPUT_PATH = 'output.json'
const PROGRESS_PATH = 'progress.json'
const ENV_NAMES = [
  'MAX_FOLLOWING_PAGES',
  'MAX_FOLLOWING_USERS',
  'MAX_EMPTY_PAGES',
  'MAX_DETAIL_USERS',
  'FORCE_FOLLOWING_REFRESH',
  'FORCE_DETAIL_REFRESH',
]

interface PageSpec {
  users: string[]
  nextCursor?: string
}

/**
 * テスト用の API ユーザーを作る。
 * @param id ユーザー ID
 * @param withBirthdate 誕生日を持たせるか
 * @returns API ユーザー
 */
function makeUser(id: string, withBirthdate: boolean): ApiUser {
  return {
    restId: id,
    legacy: { screenName: `user${id}`, name: `User ${id}` },
    legacyExtendedProfile: withBirthdate
      ? {
          birthdate: {
            day: 1,
            month: 1,
            visibility: 'Public',
            yearVisibility: 'Self',
          },
        }
      : undefined,
  }
}

/**
 * ページ定義から Twitter クライアントのモックを作る。
 * 定義を使い切った後は、カーソル付きの空ページを返し続ける。
 * @param pages ページ定義
 * @param withBirthdate ユーザーに誕生日を持たせるか
 * @returns クライアントと getFollowing のモック
 */
function makeClient(pages: PageSpec[], withBirthdate = true) {
  let index = 0
  const getFollowing = jest.fn(() => {
    const spec = pages[index] ?? { users: [], nextCursor: `auto-${index}` }
    index += 1
    return Promise.resolve({
      data: {
        data: spec.users.map((id) => ({ user: makeUser(id, withBirthdate) })),
        cursor: {
          bottom: spec.nextCursor ? { value: spec.nextCursor } : undefined,
        },
      },
    })
  })
  const client = {
    getUserListApi: () => ({ getFollowing }),
    getUsersApi: () => ({
      getUsersByRestIds: () => Promise.resolve({ data: [] }),
    }),
  } as unknown as TwitterClient
  return { client, getFollowing }
}

/**
 * テスト用の進捗状態を作る。
 * @param overrides 上書きする項目
 * @returns 進捗状態
 */
function makeProgress(overrides: Partial<ResumeState>): ResumeState {
  return {
    sourceUser: 'source',
    stage: 'details',
    seenCursors: [],
    page: 1,
    processedUsers: 0,
    users: [],
    missingBirthdateIds: [],
    ...overrides,
  }
}

/**
 * フォロー一覧を取得する。
 * @param client Twitter クライアント
 * @returns 取得結果
 */
function run(client: TwitterClient) {
  return fetchFollowingUsers(
    client,
    'self',
    'source',
    OUTPUT_PATH,
    PROGRESS_PATH
  )
}

describe('fetchFollowingUsers complete', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const name of ENV_NAMES) {
      originalEnv[name] = process.env[name]
      Reflect.deleteProperty(process.env, name)
    }
    jest.clearAllMocks()
    jest.mocked(loadProgress).mockReturnValue(null)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    for (const name of ENV_NAMES) {
      const value = originalEnv[name]
      if (value === undefined) {
        Reflect.deleteProperty(process.env, name)
      } else {
        process.env[name] = value
      }
    }
    jest.restoreAllMocks()
  })

  it('最終ページで次カーソルが返らなければ完全', async () => {
    const { client } = makeClient([
      { users: ['1', '2'], nextCursor: 'c1' },
      { users: ['3'] },
    ])

    const result = await run(client)

    expect(result.complete).toBe(true)
    expect(result.output.totalFollowing).toBe(3)
  })

  it('MAX_FOLLOWING_PAGES で打ち切ると不完全', async () => {
    process.env.MAX_FOLLOWING_PAGES = '1'
    const { client, getFollowing } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['2'] },
    ])

    const result = await run(client)

    expect(getFollowing).toHaveBeenCalledTimes(1)
    expect(result.complete).toBe(false)
    expect(result.output.totalFollowing).toBe(1)
  })

  it('MAX_FOLLOWING_USERS で打ち切ると不完全', async () => {
    process.env.MAX_FOLLOWING_USERS = '2'
    const { client } = makeClient([
      { users: ['1', '2'], nextCursor: 'c1' },
      { users: ['3'] },
    ])

    const result = await run(client)

    expect(result.complete).toBe(false)
    expect(result.output.totalFollowing).toBe(2)
  })

  it('最終ページ (次カーソルなし) で MAX_FOLLOWING_USERS にも達すると不完全', async () => {
    process.env.MAX_FOLLOWING_USERS = '2'
    const { client } = makeClient([{ users: ['1', '2'] }])

    const result = await run(client)

    expect(result.complete).toBe(false)
  })

  it('追加ゼロかつ API 上も空のページが連続して終了すると完全', async () => {
    const { client, getFollowing } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
    ])

    const result = await run(client)

    expect(getFollowing).toHaveBeenCalledTimes(4)
    expect(result.complete).toBe(true)
  })

  it('既出ユーザーだけで追加ゼロのページが連続して終了すると不完全', async () => {
    const { client, getFollowing } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['1'], nextCursor: 'c2' },
      { users: ['1'], nextCursor: 'c3' },
      { users: ['1'], nextCursor: 'c4' },
    ])

    const result = await run(client)

    expect(getFollowing).toHaveBeenCalledTimes(4)
    expect(result.complete).toBe(false)
  })

  it('空ページ連続の途中に既出ユーザーのページが挟まると不完全', async () => {
    process.env.MAX_EMPTY_PAGES = '2'
    const { client } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['1'], nextCursor: 'c2' },
      { users: [], nextCursor: 'c3' },
    ])

    const result = await run(client)

    expect(result.complete).toBe(false)
  })

  it('カーソルが循環すると不完全', async () => {
    const { client, getFollowing } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['2'], nextCursor: 'c1' },
    ])

    const result = await run(client)

    expect(getFollowing).toHaveBeenCalledTimes(2)
    expect(result.complete).toBe(false)
  })

  it('MAX_DETAIL_USERS による切り詰めが発生すると不完全', async () => {
    process.env.MAX_DETAIL_USERS = '1'
    const { client } = makeClient([{ users: ['1', '2', '3'] }], false)

    const result = await run(client)

    expect(result.complete).toBe(false)
  })

  it('MAX_DETAIL_USERS 以内で切り詰めが発生しなければ完全のまま', async () => {
    process.env.MAX_DETAIL_USERS = '5'
    const { client } = makeClient([{ users: ['1', '2', '3'] }], false)

    const result = await run(client)

    expect(result.complete).toBe(true)
  })

  it.each([
    ['true', true, true],
    ['false', false, false],
    ['未定義', undefined, false],
    ['boolean 以外', 'yes' as unknown as boolean, false],
  ])(
    '進捗の snapshotComplete が %s のとき details 再開で complete=%s を引き継ぐ',
    async (_, saved, expected) => {
      jest
        .mocked(loadProgress)
        .mockReturnValue(makeProgress({ snapshotComplete: saved }))
      const { client, getFollowing } = makeClient([])

      const result = await run(client)

      expect(getFollowing).not.toHaveBeenCalled()
      expect(result.complete).toBe(expected)
    }
  )

  it('FORCE_FOLLOWING_REFRESH=1 では進捗の完全性を引き継がず取得結果で判定する', async () => {
    process.env.FORCE_FOLLOWING_REFRESH = '1'
    process.env.MAX_FOLLOWING_PAGES = '1'
    jest.mocked(loadProgress).mockReturnValue(
      makeProgress({
        stage: 'done',
        snapshotComplete: true,
        users: [],
      })
    )
    const { client } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['2'] },
    ])

    const result = await run(client)

    expect(result.complete).toBe(false)
  })

  it('進捗保存に snapshotComplete が含まれ、完全取得後は true になる', async () => {
    const { client } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['2'] },
    ])

    await run(client)

    const saved = jest
      .mocked(saveProgress)
      .mock.calls.map(([, state]) => state.snapshotComplete)
    expect(saved[0]).toBe(false)
    expect(saved.at(-1)).toBe(true)
  })
})
