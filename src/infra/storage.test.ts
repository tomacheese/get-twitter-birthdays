import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCachedCookies, saveCookies } from './storage'

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookie-cache-'))
const mockCacheFile = path.join(mockDir, 'twitter-cookies.json')

jest.mock('../shared/config', () => ({
  CALENDAR_EVENTS_PATH: 'unused',
  CONFIG_PATH: 'unused',
  get COOKIE_CACHE_FILE() {
    return mockCacheFile
  },
  COOKIE_EXPIRY_DAYS: 7,
  GOOGLE_CREDENTIALS_PATH: 'unused',
  GOOGLE_TOKEN_CACHE_PATH: 'unused',
}))

const DAY_MS = 24 * 60 * 60 * 1000

describe('cookie cache bound to an account', () => {
  beforeEach(() => {
    fs.rmSync(mockCacheFile, { force: true })
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    fs.rmSync(mockDir, { recursive: true, force: true })
  })

  it('returns the cache for the same account, normalized', () => {
    saveCookies('t', 'c', 'UserA')

    expect(loadCachedCookies('usera')).toMatchObject({
      auth_token: 't',
      ct0: 'c',
      username: 'usera',
    })
  })

  it('returns null for a different account', () => {
    saveCookies('t', 'c', 'userA')

    expect(loadCachedCookies('userB')).toBeNull()
  })

  it.each(['@userA', ' userA ', 'USERA'])(
    'treats %j as the same account',
    (username) => {
      saveCookies('t', 'c', 'userA')

      expect(loadCachedCookies(username)).not.toBeNull()
    }
  )

  it('returns null for a legacy cache without a username', () => {
    fs.writeFileSync(
      mockCacheFile,
      JSON.stringify({ auth_token: 't', ct0: 'c', savedAt: Date.now() })
    )

    expect(loadCachedCookies('userA')).toBeNull()
  })

  it('returns null for an expired cache of the same account', () => {
    fs.writeFileSync(
      mockCacheFile,
      JSON.stringify({
        auth_token: 't',
        ct0: 'c',
        savedAt: Date.now() - 8 * DAY_MS,
        username: 'usera',
      })
    )

    expect(loadCachedCookies('userA')).toBeNull()
  })
})
