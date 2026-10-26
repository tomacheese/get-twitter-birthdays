import type { BirthdateInfo } from '../shared/types'
import { formatBirthdateAsDateRange } from './calendar-client'

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
