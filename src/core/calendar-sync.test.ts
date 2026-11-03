import type { Auth } from 'googleapis'
import type {
  BirthdayEntry,
  BirthdaysOutput,
  CalendarEventsStorage,
} from '../shared/types'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../infra/calendar-client'
import { loadCalendarEvents, saveCalendarEvents } from '../infra/storage'
import { syncToGoogleCalendar } from './calendar-sync'

const mockConfig = {
  reconcile: true,
  maxDeletions: 10,
}

jest.mock('../shared/config', () => ({
  get SYNC_CALENDAR_RECONCILE() {
    return mockConfig.reconcile
  },
  get SYNC_CALENDAR_RECONCILE_MAX_DELETIONS() {
    return mockConfig.maxDeletions
  },
}))

jest.mock('../infra/calendar-client', () => ({
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
}))

jest.mock('../infra/storage', () => ({
  loadCalendarEvents: jest.fn(),
  saveCalendarEvents: jest.fn(),
}))

const oauth2Client = {} as Auth.OAuth2Client

/**
 * Creates a birthday entry for tests.
 * @param id User ID
 * @returns Birthday entry
 */
function makeEntry(id: string): BirthdayEntry {
  return {
    id,
    screenName: `user${id}`,
    name: `User ${id}`,
    birthdate: {
      day: 1,
      month: 2,
      visibility: 'Public',
      yearVisibility: 'Self',
    },
    birthdateText: '02-01',
    profileUrl: `https://twitter.com/user${id}`,
  }
}

/**
 * Creates a birthdays output for tests.
 * @param ids IDs of users with a birthday
 * @returns Birthdays output
 */
function makeOutput(ids: string[]): BirthdaysOutput {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    sourceUser: 'source',
    totalFollowing: ids.length,
    totalWithBirthdate: ids.length,
    birthdays: ids.map((id) => makeEntry(id)),
  }
}

/**
 * Creates recorded events identical to the entries from `makeEntry`, so no update is triggered.
 * @param ids User IDs to record
 * @returns Event records
 */
function makeEvents(ids: string[]): CalendarEventsStorage {
  const events: CalendarEventsStorage = {}
  for (const id of ids) {
    const entry = makeEntry(id)
    events[id] = {
      eventId: `event-${id}`,
      userId: id,
      name: entry.name,
      screenName: entry.screenName,
      birthdate: entry.birthdate,
      profileUrl: entry.profileUrl,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
  }
  return events
}

/**
 * Creates sequential user IDs.
 * @param prefix ID prefix
 * @param count Number of IDs
 * @returns User IDs
 */
function makeIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`)
}

/**
 * Returns the event records passed to the last `saveCalendarEvents` call.
 * @returns Event records
 */
function lastSavedEvents(): CalendarEventsStorage {
  const lastCall = jest.mocked(saveCalendarEvents).mock.calls.at(-1)
  if (!lastCall) {
    throw new Error('saveCalendarEvents was not called')
  }
  return lastCall[0]
}

/**
 * Returns the user IDs of the last saved event records, sorted ascending.
 * @returns Sorted user IDs
 */
function lastSavedUserIds(): string[] {
  return Object.keys(lastSavedEvents()).toSorted((a, b) => a.localeCompare(b))
}

describe('syncToGoogleCalendar reconcile', () => {
  let warnSpy: jest.SpiedFunction<typeof console.warn>

  beforeEach(() => {
    jest.clearAllMocks()
    mockConfig.reconcile = true
    mockConfig.maxDeletions = 10
    jest.mocked(createCalendarEvent).mockResolvedValue('created-event')
    jest.mocked(updateCalendarEvent).mockResolvedValue()
    jest.mocked(deleteCalendarEvent).mockResolvedValue()
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not delete when the following list is incomplete, even with deletion candidates', async () => {
    const stale = makeIds('stale', 3)
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['a', ...stale]))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: false,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(lastSavedUserIds()).toEqual(['a', ...stale])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toBe(
      '  ⚠️ Skipping deletions because the following list was not fetched completely (candidates: 3)'
    )
  })

  it('does not warn without deletion candidates, even when incomplete', async () => {
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['a']))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: false,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('deletes only the candidates when complete and within the limit', async () => {
    jest
      .mocked(loadCalendarEvents)
      .mockReturnValue(makeEvents(['a', 'stale1', 'stale2']))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).toHaveBeenCalledTimes(2)
    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      oauth2Client,
      'event-stale1'
    )
    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      oauth2Client,
      'event-stale2'
    )
    expect(Object.keys(lastSavedEvents())).toEqual(['a'])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('deletes nothing and warns when candidates exceed the limit', async () => {
    mockConfig.maxDeletions = 2
    jest
      .mocked(loadCalendarEvents)
      .mockReturnValue(makeEvents(['a', 'stale1', 'stale2', 'stale3']))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toBe(
      '  ⚠️ Skipping deletions because 3 candidates exceed the limit of 2. If this is expected, raise SYNC_CALENDAR_RECONCILE_MAX_DELETIONS and run again'
    )
  })

  it('deletes when candidates equal the limit', async () => {
    mockConfig.maxDeletions = 2
    jest
      .mocked(loadCalendarEvents)
      .mockReturnValue(makeEvents(['a', 'stale1', 'stale2']))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).toHaveBeenCalledTimes(2)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('deletes even beyond the usual limit when the limit is 0 (unlimited)', async () => {
    mockConfig.maxDeletions = 0
    const stale = makeIds('stale', 25)
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['a', ...stale]))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).toHaveBeenCalledTimes(25)
    expect(Object.keys(lastSavedEvents())).toEqual(['a'])
  })

  it('does not delete when no birthdays were fetched, even if the limit is 0', async () => {
    mockConfig.maxDeletions = 0
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['x', 'y']))

    await syncToGoogleCalendar(oauth2Client, makeOutput([]), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(lastSavedUserIds()).toEqual(['x', 'y'])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toBe(
      '  ⚠️ Skipping deletions because no birthdays were fetched (candidates: 2)'
    )
  })

  it('does not delete when reconcile is disabled, even if complete', async () => {
    mockConfig.reconcile = false
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['a', 'stale1']))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('still creates and updates when deletions are skipped', async () => {
    const events = makeEvents(['changed', 'stale1'])
    events.changed.name = 'Old Name'
    jest.mocked(loadCalendarEvents).mockReturnValue(events)

    await syncToGoogleCalendar(oauth2Client, makeOutput(['changed', 'new']), {
      followingComplete: false,
    })

    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
    expect(updateCalendarEvent).toHaveBeenCalledTimes(1)
    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(lastSavedUserIds()).toEqual(['changed', 'new', 'stale1'])
  })
})
