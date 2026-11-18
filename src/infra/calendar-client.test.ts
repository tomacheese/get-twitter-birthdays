import type { Auth } from 'googleapis'
import type { BirthdateInfo } from '../shared/types'
import {
  formatBirthdateAsDateRange,
  resolveCalendarId,
} from './calendar-client'

const mockCalendarsGet = jest.fn()

jest.mock('googleapis', () => ({
  google: {
    calendar: () => ({
      calendars: { get: mockCalendarsGet },
    }),
  },
}))

jest.mock('../shared/config', () => ({
  GOOGLE_CALENDAR_ID: 'primary',
}))

jest.mock('../shared/google-retry', () => ({
  withGoogleRetry: async <T>(fn: () => Promise<T>): Promise<T> => await fn(),
}))

const oauth2Client = {} as Auth.OAuth2Client

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
