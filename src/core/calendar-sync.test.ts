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
 * テスト用の誕生日エントリを作る。
 * @param id ユーザー ID
 * @returns 誕生日エントリ
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
 * テスト用の誕生日出力を作る。
 * @param ids 誕生日を持つユーザー ID
 * @returns 誕生日出力
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
 * 記録済みイベントを作る。エントリと同じ内容のため更新は発生しない。
 * @param ids 記録するユーザー ID
 * @returns イベント記録
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
 * 連番のユーザー ID を作る。
 * @param prefix ID の接頭辞
 * @param count 件数
 * @returns ユーザー ID の配列
 */
function makeIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`)
}

/**
 * 最後に保存されたイベント記録を取得する。
 * @returns 最後の saveCalendarEvents の引数
 */
function lastSavedEvents(): CalendarEventsStorage {
  const lastCall = jest.mocked(saveCalendarEvents).mock.calls.at(-1)
  if (!lastCall) {
    throw new Error('saveCalendarEvents was not called')
  }
  return lastCall[0]
}

/**
 * 最後に保存されたイベント記録のユーザー ID を昇順で取得する。
 * @returns ソート済みのユーザー ID
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

  it('フォロー一覧が不完全なら削除候補があっても削除しない', async () => {
    const stale = makeIds('stale', 3)
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['a', ...stale]))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: false,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(lastSavedUserIds()).toEqual(['a', ...stale])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toBe(
      '  ⚠️ フォロー一覧を完全に取得できていないため、削除をスキップします (削除候補: 3 件)'
    )
  })

  it('削除候補がなければ不完全でも警告しない', async () => {
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['a']))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: false,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('完全かつ上限以内なら候補だけ削除する', async () => {
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

  it('候補数が上限を超えると 1 件も削除せず理由を警告する', async () => {
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
      '  ⚠️ 削除候補 3 件が上限 2 件を超えるため、削除をスキップします。問題なければ SYNC_CALENDAR_RECONCILE_MAX_DELETIONS を引き上げて再実行してください'
    )
  })

  it('候補数が上限ちょうどなら削除する', async () => {
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

  it('上限が 0 (無制限) なら上限超過でも削除する', async () => {
    mockConfig.maxDeletions = 0
    const stale = makeIds('stale', 25)
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['a', ...stale]))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).toHaveBeenCalledTimes(25)
    expect(Object.keys(lastSavedEvents())).toEqual(['a'])
  })

  it('取得した誕生日が空なら上限が 0 でも削除しない', async () => {
    mockConfig.maxDeletions = 0
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['x', 'y']))

    await syncToGoogleCalendar(oauth2Client, makeOutput([]), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(lastSavedUserIds()).toEqual(['x', 'y'])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toBe(
      '  ⚠️ 取得した誕生日が 0 件のため、削除をスキップします (削除候補: 2 件)'
    )
  })

  it('reconcile が無効なら完全でも削除しない', async () => {
    mockConfig.reconcile = false
    jest.mocked(loadCalendarEvents).mockReturnValue(makeEvents(['a', 'stale1']))

    await syncToGoogleCalendar(oauth2Client, makeOutput(['a']), {
      followingComplete: true,
    })

    expect(deleteCalendarEvent).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('削除をスキップしても作成と更新は実行する', async () => {
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
