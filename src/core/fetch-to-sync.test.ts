import type { Auth } from 'googleapis'
import type { ApiUser, CalendarEventsStorage } from '../shared/types'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  resolveCalendarId,
  updateCalendarEvent,
} from '../infra/calendar-client'
import { loadCalendarEvents } from '../infra/storage'
import { fetchFollowingUsers } from './following'
import type { TwitterClient } from './following'
import { syncToGoogleCalendar } from './calendar-sync'

jest.mock('../shared/config', () => ({
  ...jest.requireActual<typeof import('../shared/config')>('../shared/config'),
  SYNC_CALENDAR_RECONCILE: true,
  SYNC_CALENDAR_RECONCILE_MAX_DELETIONS: 10,
}))

jest.mock('../infra/calendar-client', () => ({
  resolveCalendarId: jest.fn(),
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
}))

jest.mock('../infra/storage', () => ({
  loadProgress: jest.fn().mockReturnValue(null),
  saveProgress: jest.fn(),
  saveOutput: jest.fn(),
  loadCalendarEvents: jest.fn(),
  saveCalendarEvents: jest.fn(),
}))

const birthdate = {
  day: 1,
  month: 2,
  visibility: 'Public',
  yearVisibility: 'Self',
} as const

/**
 * Creates an API user for tests.
 * @param id User ID
 * @param withBirthdate Whether the user has a birthdate
 * @returns API user
 */
function makeUser(id: string, withBirthdate: boolean): ApiUser {
  return {
    restId: id,
    legacy: { screenName: `user${id}`, name: `User ${id}` },
    legacyExtendedProfile: withBirthdate ? { birthdate } : undefined,
  }
}

/**
 * Creates recorded calendar events for the given user IDs.
 * @param ids User IDs
 * @returns Event records
 */
function makeEvents(ids: string[]): CalendarEventsStorage {
  const events: CalendarEventsStorage = {}
  for (const id of ids) {
    events[id] = {
      eventId: `event-${id}`,
      userId: id,
      name: `User ${id}`,
      screenName: `user${id}`,
      birthdate,
      profileUrl: `https://twitter.com/user${id}`,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
  }
  return events
}

describe('fetch to calendar sync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(resolveCalendarId).mockResolvedValue('cal-A')
    jest.mocked(createCalendarEvent).mockResolvedValue('created-event')
    jest.mocked(updateCalendarEvent).mockResolvedValue()
    jest.mocked(deleteCalendarEvent).mockResolvedValue()
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not delete the event of a user whose detail could not be resolved', async () => {
    const client = {
      getUserListApi: () => ({
        getFollowing: () =>
          Promise.resolve({
            data: {
              data: [
                { user: makeUser('1', true) },
                { user: makeUser('2', false) },
              ],
              cursor: { bottom: undefined },
            },
          }),
      }),
      getUserApi: () => ({
        getUserByScreenName: () => Promise.resolve({ data: { user: null } }),
      }),
    } as unknown as TwitterClient
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['1', '2']))

    const result = await fetchFollowingUsers(
      client,
      'self',
      'source',
      'output.json',
      'progress.json'
    )
    await syncToGoogleCalendar({} as Auth.OAuth2Client, result.output, {
      followingComplete: result.complete,
    })

    expect(result.complete).toBe(false)
    expect(result.output.totalWithBirthdate).toBe(1)
    expect(deleteCalendarEvent).not.toHaveBeenCalled()
  })
})
