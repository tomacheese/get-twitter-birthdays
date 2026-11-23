import type { Auth } from 'googleapis'
import type { BirthdateInfo } from '../shared/types'
import {
  formatBirthdateAsDateRange,
  resolveCalendarId,
  createCalendarEvent,
} from './calendar-client'

const mockCalendarsGet = jest.fn()
const mockEventsInsert = jest.fn()
const mockEventsGet = jest.fn()
const mockEventsUpdate = jest.fn()

jest.mock('googleapis', () => ({
  google: {
    calendar: () => ({
      calendars: { get: mockCalendarsGet },
      events: {
        insert: mockEventsInsert,
        get: mockEventsGet,
        update: mockEventsUpdate,
      },
    }),
  },
}))

jest.mock('../shared/config', () => ({
  GOOGLE_CALENDAR_ID: 'primary',
}))

const oauth2Client = {} as Auth.OAuth2Client

function makeBirthdate(
  month: number,
  day: number,
  year?: number
): BirthdateInfo {
  return {
    month,
    day,
    year,
    visibility: 'Public',
    yearVisibility: 'Self',
  }
}

describe('createCalendarEvent', () => {
  const create = (userId = '123') =>
    createCalendarEvent(
      oauth2Client,
      userId,
      'Name',
      'screen',
      makeBirthdate(1, 2),
      'https://example.com'
    )

  beforeEach(() => {
    jest.clearAllMocks()
    mockEventsInsert.mockReset()
    mockEventsGet.mockReset()
    mockEventsUpdate.mockReset()
  })

  it('uses a stable valid event ID and distinct IDs for different users', async () => {
    mockEventsInsert.mockImplementation(
      ({ requestBody }: { requestBody: { id: string } }) =>
        Promise.resolve({
          data: requestBody,
        })
    )
    const first = await create()
    expect(await create()).toBe(first)
    expect(await create('456')).not.toBe(first)
    expect(first).toMatch(/^[0-9a-v]{5,1024}$/)
  })

  it('recovers a lost insert response without creating a second event', async () => {
    const events = new Map<string, Record<string, unknown>>()
    mockEventsInsert.mockImplementation(
      ({ requestBody }: { requestBody: { id: string } }) => {
        if (events.has(requestBody.id)) {
          return Promise.reject(
            Object.assign(new Error('duplicate'), {
              response: { status: 409 },
            })
          )
        }
        events.set(requestBody.id, requestBody)
        return Promise.reject(
          Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })
        )
      }
    )
    mockEventsGet.mockImplementation(({ eventId }: { eventId: string }) =>
      Promise.resolve({
        data: events.get(eventId),
      })
    )
    mockEventsUpdate.mockImplementation(
      ({
        eventId,
        requestBody,
      }: {
        eventId: string
        requestBody: Record<string, unknown>
      }) => {
        events.set(eventId, requestBody)
        return Promise.resolve({ data: requestBody })
      }
    )
    const warning = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    try {
      const id = await create()
      expect(events.size).toBe(1)
      expect(events.has(id)).toBe(true)
      expect(mockEventsInsert).toHaveBeenCalledTimes(2)
      expect(mockEventsUpdate).toHaveBeenCalledTimes(1)
    } finally {
      warning.mockRestore()
    }
  })

  it('does not adopt an event belonging to another user', async () => {
    mockEventsInsert.mockRejectedValue(
      Object.assign(new Error('duplicate'), { response: { status: 409 } })
    )
    mockEventsGet.mockImplementation(({ eventId }: { eventId: string }) =>
      Promise.resolve({
        data: {
          id: eventId,
          extendedProperties: { private: { twitterUserId: 'other' } },
        },
      })
    )
    await expect(create()).rejects.toThrow(
      'Conflicting calendar event does not match the user'
    )
    expect(mockEventsUpdate).not.toHaveBeenCalled()
  })

  it('propagates non-conflict errors', async () => {
    const error = new Error('forbidden')
    mockEventsInsert.mockRejectedValue(error)
    await expect(create()).rejects.toBe(error)
    expect(mockEventsGet).not.toHaveBeenCalled()
  })
})

describe('resolveCalendarId', () => {
  beforeEach(() => {
    mockCalendarsGet.mockReset()
  })

  it('returns the real calendar ID that the configured ID resolves to', async () => {
    mockCalendarsGet.mockResolvedValue({ data: { id: 'user@example.com' } })

    await expect(resolveCalendarId(oauth2Client)).resolves.toBe(
      'user@example.com'
    )
    expect(mockCalendarsGet).toHaveBeenCalledWith({ calendarId: 'primary' })
  })

  it('throws when the response has no calendar ID', async () => {
    mockCalendarsGet.mockResolvedValue({ data: {} })

    await expect(resolveCalendarId(oauth2Client)).rejects.toThrow(
      '❌ Failed to resolve the calendar ID for "primary"'
    )
  })
})

describe('formatBirthdateAsDateRange', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('uses a leap year for Feb 29 when the birth year is unknown, even in a non-leap year', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-01T00:00:00Z'))

    expect(formatBirthdateAsDateRange(makeBirthdate(2, 29))).toEqual({
      startDate: '2000-02-29',
      endDate: '2000-03-01',
    })
  })

  it('keeps Feb 29 as is when the birth year is a leap year', () => {
    expect(formatBirthdateAsDateRange(makeBirthdate(2, 29, 2000))).toEqual({
      startDate: '2000-02-29',
      endDate: '2000-03-01',
    })
  })

  it('rolls Feb 28 of a non-leap year over to Mar 1', () => {
    expect(formatBirthdateAsDateRange(makeBirthdate(2, 28, 2026))).toEqual({
      startDate: '2026-02-28',
      endDate: '2026-03-01',
    })
  })

  it('rolls Dec 31 over to Jan 1 of the next year', () => {
    expect(formatBirthdateAsDateRange(makeBirthdate(12, 31, 2026))).toEqual({
      startDate: '2026-12-31',
      endDate: '2027-01-01',
    })
  })

  it('rolls Dec 31 over to Jan 1 of the next year when the birth year is unknown', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-01T00:00:00Z'))

    expect(formatBirthdateAsDateRange(makeBirthdate(12, 31))).toEqual({
      startDate: '2000-12-31',
      endDate: '2001-01-01',
    })
  })
})
