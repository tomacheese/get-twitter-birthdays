import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  CalendarEventRecord,
  CalendarEventsStorage,
} from '../shared/types'
import { loadCalendarEvents, saveCalendarEvents } from './storage'

const mockConfig = {
  eventsPath: '',
  legacyCalendarId: '',
}

jest.mock('../shared/config', () => ({
  get CALENDAR_EVENTS_PATH() {
    return mockConfig.eventsPath
  },
  get CALENDAR_EVENTS_LEGACY_CALENDAR_ID() {
    return mockConfig.legacyCalendarId
  },
}))

/**
 * Creates an event record for tests.
 * @param userId User ID
 * @returns Event record
 */
function makeRecord(userId: string): CalendarEventRecord {
  return {
    eventId: `event-${userId}`,
    userId,
    name: `User ${userId}`,
    screenName: `user${userId}`,
    birthdate: {
      day: 1,
      month: 2,
      visibility: 'Public',
      yearVisibility: 'Self',
    },
    profileUrl: `https://twitter.com/user${userId}`,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('calendar event records storage', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-events-'))
    mockConfig.eventsPath = path.join(tmpDir, 'calendar-events.json')
    mockConfig.legacyCalendarId = ''
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const writeRaw = (content: string): void => {
    fs.writeFileSync(mockConfig.eventsPath, content)
  }
  const readRaw = (): string => fs.readFileSync(mockConfig.eventsPath, 'utf8')

  it('returns empty records when the file is missing', () => {
    expect(loadCalendarEvents('cal-A')).toEqual({})
  })

  it('keeps records per calendar and preserves other calendars on save', () => {
    const recordsA: CalendarEventsStorage = { '1': makeRecord('1') }
    const recordsB: CalendarEventsStorage = { '2': makeRecord('2') }

    saveCalendarEvents('cal-A', recordsA)
    expect(loadCalendarEvents('cal-B')).toEqual({})

    saveCalendarEvents('cal-B', recordsB)

    expect(loadCalendarEvents('cal-A')).toEqual(recordsA)
    expect(loadCalendarEvents('cal-B')).toEqual(recordsB)
    expect(JSON.parse(readRaw())).toEqual({
      version: 2,
      calendars: { 'cal-A': recordsA, 'cal-B': recordsB },
    })
  })

  it('throws on a non-empty legacy file without a legacy calendar ID and leaves the file unchanged', () => {
    const legacy = JSON.stringify({ '1': makeRecord('1') })
    writeRaw(legacy)

    expect(() => loadCalendarEvents('cal-A')).toThrow(
      `❌ ${mockConfig.eventsPath} has no calendar recorded. Set CALENDAR_EVENTS_LEGACY_CALENDAR_ID to the calendar ID the records were created in, or delete the file`
    )
    expect(readRaw()).toBe(legacy)
  })

  it('migrates a legacy file under the given calendar ID and loads it for that calendar', () => {
    const legacy: CalendarEventsStorage = { '1': makeRecord('1') }
    writeRaw(JSON.stringify(legacy))
    mockConfig.legacyCalendarId = 'cal-A'

    expect(loadCalendarEvents('cal-A')).toEqual(legacy)
    expect(JSON.parse(readRaw())).toEqual({
      version: 2,
      calendars: { 'cal-A': legacy },
    })
  })

  it('migrates a legacy file for a different calendar without applying it to the current one', () => {
    const legacy: CalendarEventsStorage = { '1': makeRecord('1') }
    const recordsB: CalendarEventsStorage = { '2': makeRecord('2') }
    writeRaw(JSON.stringify(legacy))
    mockConfig.legacyCalendarId = 'cal-A'

    expect(loadCalendarEvents('cal-B')).toEqual({})
    saveCalendarEvents('cal-B', recordsB)

    expect(loadCalendarEvents('cal-A')).toEqual(legacy)
    expect(loadCalendarEvents('cal-B')).toEqual(recordsB)
  })

  it('loads an empty legacy file as empty records', () => {
    writeRaw('{}')

    expect(loadCalendarEvents('cal-A')).toEqual({})
  })

  it.each([
    ['invalid JSON', '{not json'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a primitive', '42'],
    ['an unsupported version', '{"version":3,"calendars":{}}'],
    ['version 2 without calendars', '{"version":2}'],
    ['version 2 with null calendars', '{"version":2,"calendars":null}'],
    ['version 2 with array calendars', '{"version":2,"calendars":[]}'],
  ])('throws on %s and leaves the file unchanged', (_label, content) => {
    writeRaw(content)

    expect(() => loadCalendarEvents('cal-A')).toThrow(
      `❌ ${mockConfig.eventsPath} is not a supported calendar event records file`
    )
    expect(() => {
      saveCalendarEvents('cal-A', {})
    }).toThrow(
      `❌ ${mockConfig.eventsPath} is not a supported calendar event records file`
    )
    expect(readRaw()).toBe(content)
  })
})
