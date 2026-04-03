import type { Auth } from 'googleapis'
import type {
  BirthdayEntry,
  BirthdaysOutput,
  CalendarEventRecord,
  CalendarEventsStorage,
} from '../shared/types'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../infra/calendar-client'
import { loadCalendarEvents, saveCalendarEvents } from '../infra/storage'
import { SYNC_CALENDAR_RECONCILE } from '../shared/config'

type OAuth2Client = Auth.OAuth2Client

/**
 * イベント記録からユーザーを削除した新しいオブジェクトを返す。
 *
 * @param events イベント記録
 * @param userId 削除するユーザー ID
 * @returns 新しいイベント記録
 */
function removeEventByUserId(
  events: CalendarEventsStorage,
  userId: string
): CalendarEventsStorage {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [userId]: _removed, ...rest } = events
  return rest
}

/**
 * イベント記録が変更されたかどうかを判定する。
 *
 * @param record 既存のイベント記録
 * @param entry 誕生日エントリ
 * @returns 変更があった場合は true
 */
function hasEventChanged(
  record: CalendarEventRecord,
  entry: BirthdayEntry
): boolean {
  return (
    record.name !== entry.name ||
    record.screenName !== entry.screenName ||
    record.birthdate.day !== entry.birthdate.day ||
    record.birthdate.month !== entry.birthdate.month ||
    record.birthdate.year !== entry.birthdate.year ||
    record.profileUrl !== entry.profileUrl
  )
}

/**
 * 誕生日情報を Google Calendar に同期する。
 *
 * エラーが発生した場合でも、可能な限り他のユーザーの処理を継続します。
 * また、各イベントの作成・更新後にストレージを保存することで、途中でクラッシュしても
 * 既に作成されたイベントは記録されます。
 *
 * @param oauth2Client 認証済みの OAuth2Client
 * @param birthdaysOutput 誕生日情報
 */
export async function syncToGoogleCalendar(
  oauth2Client: OAuth2Client,
  birthdaysOutput: BirthdaysOutput
): Promise<void> {
  console.log('📅 Google Calendar への同期を開始します...')

  let events = loadCalendarEvents()
  const currentUserIds = new Set(birthdaysOutput.birthdays.map((b) => b.id))
  let created = 0
  let updated = 0
  let skipped = 0
  let deleted = 0
  const errors: { user: string; error: unknown }[] = []

  // 新規作成 or 更新
  for (const entry of birthdaysOutput.birthdays) {
    const existingEvent = events[entry.id]

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!existingEvent) {
      // 新規作成
      try {
        const eventId = await createCalendarEvent(
          oauth2Client,
          entry.id,
          entry.name,
          entry.screenName,
          entry.birthdate,
          entry.profileUrl
        )

        events[entry.id] = {
          eventId,
          userId: entry.id,
          name: entry.name,
          screenName: entry.screenName,
          birthdate: entry.birthdate,
          profileUrl: entry.profileUrl,
          updatedAt: new Date().toISOString(),
        }

        // イベント作成後すぐにストレージを保存（クラッシュ時の重複防止）
        saveCalendarEvents(events)

        console.log(`  ✅ 作成: ${entry.name}(@${entry.screenName})`)
        created++
      } catch (err) {
        console.error(`  ❌ 作成失敗: ${entry.name}(@${entry.screenName})`, err)
        errors.push({
          user: `${entry.name}(@${entry.screenName})`,
          error: err,
        })
        // エラーを記録して次のユーザーの処理を継続
      }
    } else if (hasEventChanged(existingEvent, entry)) {
      // 更新
      try {
        await updateCalendarEvent(
          oauth2Client,
          existingEvent.eventId,
          entry.id,
          entry.name,
          entry.screenName,
          entry.birthdate,
          entry.profileUrl
        )

        events[entry.id] = {
          ...existingEvent,
          name: entry.name,
          screenName: entry.screenName,
          birthdate: entry.birthdate,
          profileUrl: entry.profileUrl,
          updatedAt: new Date().toISOString(),
        }

        // イベント更新後すぐにストレージを保存（クラッシュ時の重複防止）
        saveCalendarEvents(events)

        console.log(`  🔄 更新: ${entry.name}(@${entry.screenName})`)
        updated++
      } catch (err) {
        console.error(`  ❌ 更新失敗: ${entry.name}(@${entry.screenName})`, err)
        errors.push({
          user: `${entry.name}(@${entry.screenName})`,
          error: err,
        })
        // エラーを記録して次のユーザーの処理を継続
      }
    } else {
      // 変更なし
      skipped++
    }
  }

  // Reconcile: カレンダーから削除されたユーザーを検出して削除
  if (SYNC_CALENDAR_RECONCILE) {
    const removedUserIds = Object.keys(events).filter(
      (userId) => !currentUserIds.has(userId)
    )

    for (const userId of removedUserIds) {
      const record = events[userId]
      try {
        await deleteCalendarEvent(oauth2Client, record.eventId)
        events = removeEventByUserId(events, userId)

        // イベント削除後すぐにストレージを保存
        saveCalendarEvents(events)

        console.log(`  🗑️  削除: ${record.name}(@${record.screenName})`)
        deleted++
      } catch (err) {
        console.error(
          `  ❌ 削除失敗: ${record.name}(@${record.screenName})`,
          err
        )
        errors.push({
          user: `${record.name}(@${record.screenName})`,
          error: err,
        })
        // 削除失敗は続行
      }
    }
  }

  // 最終的にもう一度保存（念のため）
  saveCalendarEvents(events)

  console.log()
  console.log('✅ 同期が完了しました')
  console.log(
    `  📊 作成: ${created}, 更新: ${updated}, スキップ: ${skipped}, 削除: ${deleted}`
  )

  // エラーがあった場合は集計して報告
  if (errors.length > 0) {
    console.log()
    console.log(`⚠️ ${errors.length} 件のエラーが発生しました:`)
    for (const { user, error } of errors) {
      console.log(
        `  - ${user}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    throw new Error(`❌ ${errors.length} 件のユーザーで同期に失敗しました`)
  }
}
