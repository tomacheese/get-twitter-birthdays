import type { OAuth2Client } from 'google-auth-library'
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
 * @param oauth2Client 認証済みの OAuth2Client
 * @param birthdaysOutput 誕生日情報
 */
export async function syncToGoogleCalendar(
  oauth2Client: OAuth2Client,
  birthdaysOutput: BirthdaysOutput
): Promise<void> {
  console.log('📅 Google Calendar への同期を開始します...')

  const events = loadCalendarEvents()
  const currentUserIds = new Set(birthdaysOutput.birthdays.map((b) => b.id))
  let created = 0
  let updated = 0
  let skipped = 0
  let deleted = 0

  // 新規作成 or 更新
  for (const entry of birthdaysOutput.birthdays) {
    const existingEvent = events[entry.id]

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

        console.log(`  ✅ 作成: ${entry.name}(@${entry.screenName})`)
        created++
      } catch (error) {
        console.error(
          `  ❌ 作成失敗: ${entry.name}(@${entry.screenName})`,
          error
        )
        throw error
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

        console.log(`  🔄 更新: ${entry.name}(@${entry.screenName})`)
        updated++
      } catch (error) {
        console.error(
          `  ❌ 更新失敗: ${entry.name}(@${entry.screenName})`,
          error
        )
        throw error
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
        delete events[userId]
        console.log(`  🗑️  削除: ${record.name}(@${record.screenName})`)
        deleted++
      } catch (error) {
        console.error(
          `  ❌ 削除失敗: ${record.name}(@${record.screenName})`,
          error
        )
        // 削除失敗は続行
      }
    }
  }

  // イベント記録を保存
  saveCalendarEvents(events)

  console.log()
  console.log('✅ 同期が完了しました')
  console.log(
    `  📊 作成: ${created}, 更新: ${updated}, スキップ: ${skipped}, 削除: ${deleted}`
  )
}
