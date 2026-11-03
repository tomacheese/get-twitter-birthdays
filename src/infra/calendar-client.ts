import { google } from 'googleapis'
// eslint-disable-next-line camelcase
import type { calendar_v3, Auth } from 'googleapis'
import type { BirthdateInfo } from '../shared/types'
import { GOOGLE_CALENDAR_ID } from '../shared/config'
import { withGoogleRetry } from '../shared/google-retry'

// eslint-disable-next-line camelcase
type CalendarEvent = calendar_v3.Schema$Event
type OAuth2Client = Auth.OAuth2Client

// Use a fixed leap year so Feb 29 with an unknown year is always a valid date
const UNKNOWN_YEAR_BASE = 2000

/**
 * Builds the start and end dates of an all-day event from a birthdate (year 2000 when the year is unknown).
 * The Google Calendar API treats an all-day event's `end.date` as exclusive, so the end date is the next day.
 * Dates are built as strings rather than via Date objects to avoid time zone shifts.
 *
 * @param birthdate Birthdate info
 * @returns Start and end dates in YYYY-MM-DD format
 */
export function formatBirthdateAsDateRange(birthdate: BirthdateInfo): {
  startDate: string
  endDate: string
} {
  const year = birthdate.year ?? UNKNOWN_YEAR_BASE
  const month = String(birthdate.month).padStart(2, '0')
  const day = String(birthdate.day).padStart(2, '0')

  const startDate = `${year}-${month}-${day}`

  // End date is the next day, rolling over month and year boundaries
  let endYear = year
  let endMonth = birthdate.month
  let endDay = birthdate.day + 1

  const daysInMonth = new Date(year, birthdate.month, 0).getDate()
  if (endDay > daysInMonth) {
    endDay = 1
    endMonth++

    if (endMonth > 12) {
      endMonth = 1
      endYear++
    }
  }

  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`

  return {
    startDate,
    endDate,
  }
}

/**
 * Creates a yearly recurring all-day birthday event.
 * The Twitter user ID is stored in the private extended property `twitterUserId`.
 * The title is intentionally Japanese (`<name>(@<screenName>)の誕生日`) and is part of the user-visible calendar output.
 *
 * @param oauth2Client Authenticated OAuth2Client
 * @param userId Twitter user ID
 * @param name Display name
 * @param screenName Screen name
 * @param birthdate Birthdate info
 * @param profileUrl Profile URL
 * @returns Created event ID
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
    throw new Error('❌ Failed to get the event ID')
  }

  return response.data.id
}

/**
 * Replaces an existing birthday event with the current user info.
 *
 * @param oauth2Client Authenticated OAuth2Client
 * @param eventId Event ID
 * @param userId Twitter user ID
 * @param name Display name
 * @param screenName Screen name
 * @param birthdate Birthdate info
 * @param profileUrl Profile URL
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
 * Deletes a calendar event.
 *
 * @param oauth2Client Authenticated OAuth2Client
 * @param eventId Event ID
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
 * Finds the event whose `twitterUserId` extended property matches the user.
 *
 * Currently unused. May be used in the future for manual recovery.
 *
 * @param oauth2Client Authenticated OAuth2Client
 * @param userId Twitter user ID
 * @returns Event ID, or null if not found
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
