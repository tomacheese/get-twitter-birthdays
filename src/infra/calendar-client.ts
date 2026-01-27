import { google } from 'googleapis'
// eslint-disable-next-line camelcase
import type { calendar_v3, Auth } from 'googleapis'
import type { BirthdateInfo } from '../shared/types'
import { GOOGLE_CALENDAR_ID } from '../shared/config'
import { withGoogleRetry } from '../shared/google-retry'

// eslint-disable-next-line camelcase
type CalendarEvent = calendar_v3.Schema$Event
type OAuth2Client = Auth.OAuth2Client

/**
 * 誕生日情報から日付文字列を生成する（年不明の場合は現在年を使用）。
 *
 * @param birthdate 誕生日情報
 * @returns YYYY-MM-DD 形式の日付文字列
 */
/**
 * 日付を YYYY-MM-DD 形式の文字列に変換する。
 *
 * @param date Date オブジェクト
 * @returns YYYY-MM-DD 形式の日付文字列
 */
function formatDateToString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 誕生日情報から開始日と終了日を生成する（年不明の場合は現在年を使用）。
 * Google Calendar API の終日イベントでは、end.date は排他的（翌日）を指定する。
 *
 * @param birthdate 誕生日情報
 * @returns 開始日と終了日の YYYY-MM-DD 形式の文字列
 */
function formatBirthdateAsDateRange(birthdate: BirthdateInfo): {
  startDate: string
  endDate: string
} {
  const year = birthdate.year ?? new Date().getFullYear()
  const startDate = new Date(year, birthdate.month - 1, birthdate.day)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 1)

  return {
    startDate: formatDateToString(startDate),
    endDate: formatDateToString(endDate),
  }
}

/**
 * カレンダーイベントを作成する。
 *
 * @param oauth2Client 認証済みの OAuth2Client
 * @param userId Twitter ユーザー ID
 * @param name 名前
 * @param screenName スクリーンネーム
 * @param birthdate 誕生日情報
 * @param profileUrl プロフィール URL
 * @returns 作成されたイベント ID
 */
export async function createCalendarEvent(
  oauth2Client: OAuth2Client,
  userId: string,
  name: string,
  screenName: string,
  birthdate: BirthdateInfo,
  profileUrl: string
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
  const { startDate, endDate } = formatBirthdateAsDateRange(birthdate)

  const event: CalendarEvent = {
    summary: `${name}(@${screenName})の誕生日`,
    description: profileUrl,
    start: {
      date: startDate,
    },
    end: {
      date: endDate,
    },
    recurrence: ['RRULE:FREQ=YEARLY'],
    extendedProperties: {
      private: {
        twitterUserId: userId,
      },
    },
  }

  const response = await withGoogleRetry(async () => {
    return await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      requestBody: event,
    })
  })

  if (!response.data.id) {
    throw new Error('❌ イベント ID が取得できませんでした')
  }

  return response.data.id
}

/**
 * カレンダーイベントを更新する。
 *
 * @param oauth2Client 認証済みの OAuth2Client
 * @param eventId イベント ID
 * @param userId Twitter ユーザー ID
 * @param name 名前
 * @param screenName スクリーンネーム
 * @param birthdate 誕生日情報
 * @param profileUrl プロフィール URL
 */
export async function updateCalendarEvent(
  oauth2Client: OAuth2Client,
  eventId: string,
  userId: string,
  name: string,
  screenName: string,
  birthdate: BirthdateInfo,
  profileUrl: string
): Promise<void> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
  const { startDate, endDate } = formatBirthdateAsDateRange(birthdate)

  const event: CalendarEvent = {
    summary: `${name}(@${screenName})の誕生日`,
    description: profileUrl,
    start: {
      date: startDate,
    },
    end: {
      date: endDate,
    },
    recurrence: ['RRULE:FREQ=YEARLY'],
    extendedProperties: {
      private: {
        twitterUserId: userId,
      },
    },
  }

  await withGoogleRetry(async () => {
    await calendar.events.update({
      calendarId: GOOGLE_CALENDAR_ID,
      eventId,
      requestBody: event,
    })
  })
}

/**
 * カレンダーイベントを削除する。
 *
 * @param oauth2Client 認証済みの OAuth2Client
 * @param eventId イベント ID
 */
export async function deleteCalendarEvent(
  oauth2Client: OAuth2Client,
  eventId: string
): Promise<void> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  await withGoogleRetry(async () => {
    await calendar.events.delete({
      calendarId: GOOGLE_CALENDAR_ID,
      eventId,
    })
  })
}

/**
 * カレンダーから特定の extendedProperties を持つイベントを検索する。
 *
 * @param oauth2Client 認証済みの OAuth2Client
 * @param userId Twitter ユーザー ID
 * @returns イベント ID（見つからない場合は null）
 */
export async function findEventByUserId(
  oauth2Client: OAuth2Client,
  userId: string
): Promise<string | null> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  const response = await withGoogleRetry(async () => {
    return await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      privateExtendedProperty: [`twitterUserId=${userId}`],
      maxResults: 1,
    })
  })

  const event = response.data.items?.[0]
  return event?.id ?? null
}
