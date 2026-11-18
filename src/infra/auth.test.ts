import { getAuthCookies } from './auth'
import { loadCachedCookies, saveCookies } from './storage'

const mockLogin = jest.fn()

jest.mock('./storage', () => ({
  loadCachedCookies: jest.fn(),
  saveCookies: jest.fn(),
}))

jest.mock('./cycletls', () => ({
  cycleTLSFetchWithProxy: jest.fn(),
}))

jest.mock('@the-convocation/twitter-scraper', () => ({
  Scraper: class {
    login = async (...args: unknown[]): Promise<void> => {
      await mockLogin(...args)
    }
    isLoggedIn = () => Promise.resolve(true)
    getCookies = () =>
      Promise.resolve([
        { key: 'auth_token', value: 'tok' },
        { key: 'ct0', value: 'csrf' },
      ])
  },
}))

const credentials = { username: 'userA', password: 'pw' }

describe('getAuthCookies', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockLogin.mockResolvedValue(undefined)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('looks up the cache by the configured username and skips login on a hit', async () => {
    jest.mocked(loadCachedCookies).mockReturnValue({
      auth_token: 'cached-tok',
      ct0: 'cached-csrf',
      savedAt: Date.now(),
      username: 'usera',
    })

    await expect(getAuthCookies(credentials)).resolves.toEqual({
      authToken: 'cached-tok',
      ct0: 'cached-csrf',
    })
    expect(loadCachedCookies).toHaveBeenCalledWith('userA')
    expect(mockLogin).not.toHaveBeenCalled()
    expect(saveCookies).not.toHaveBeenCalled()
  })

  it('logs in and saves the cache for the configured username on a miss', async () => {
    jest.mocked(loadCachedCookies).mockReturnValue(null)

    await expect(getAuthCookies(credentials)).resolves.toEqual({
      authToken: 'tok',
      ct0: 'csrf',
    })
    expect(loadCachedCookies).toHaveBeenCalledWith('userA')
    expect(mockLogin).toHaveBeenCalledTimes(1)
    expect(saveCookies).toHaveBeenCalledWith('tok', 'csrf', 'userA')
  })
})
