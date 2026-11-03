import { Scraper } from '@the-convocation/twitter-scraper'
import { CONFIG_PATH } from '../shared/config'
import type { Config, Credentials } from '../shared/types'
import { cycleTLSFetchWithProxy } from './cycletls'
import { loadCachedCookies, saveCookies } from './storage'

/**
 * Logs in with exponential backoff.
 * Only 503 errors are retried; any other error is rethrown immediately.
 * @param scraper Scraper instance
 * @param username Twitter username
 * @param password Twitter password
 * @param email Email address (used when Twitter asks for it)
 * @param twoFactorSecret Two-factor authentication secret
 * @param maxRetries Maximum number of attempts
 */
async function loginWithRetry(
  scraper: Scraper,
  username: string,
  password: string,
  email?: string,
  twoFactorSecret?: string,
  maxRetries = 5
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      console.log(`Login attempt ${attempt}/${maxRetries}...`)
      await scraper.login(username, password, email, twoFactorSecret)
      return
    } catch (error: unknown) {
      const is503 =
        error instanceof Error &&
        (error.message.includes('503') ||
          error.message.includes('Service Unavailable'))

      if (is503 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30_000)
        console.warn(`503 error, retrying in ${delay / 1000}s...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
}

/**
 * Resolves credentials, preferring environment variables over the config file.
 * @param config Config file contents, or null if absent
 * @returns Credentials
 * @throws If the username or password is missing
 */
export function resolveCredentials(config: Config | null): Credentials {
  const username = process.env.TWITTER_USERNAME ?? config?.twitter?.username
  const password = process.env.TWITTER_PASSWORD ?? config?.twitter?.password

  if (!username || !password) {
    throw new Error(
      `Missing Twitter credentials. Set TWITTER_USERNAME/TWITTER_PASSWORD or provide them in ${CONFIG_PATH}.`
    )
  }

  const emailAddress =
    process.env.TWITTER_EMAIL_ADDRESS ?? config?.twitter?.emailAddress
  const twoFactorSecret = process.env.TWITTER_AUTH_CODE_SECRET

  return {
    username,
    password,
    emailAddress: emailAddress ?? undefined,
    twoFactorSecret: twoFactorSecret ?? undefined,
  }
}

/**
 * Returns the auth cookies, using the cookie cache when valid and logging in otherwise.
 * @param credentials Credentials
 * @returns `auth_token` and `ct0` cookie values
 */
export async function getAuthCookies(credentials: Credentials): Promise<{
  authToken: string
  ct0: string
}> {
  const cached = loadCachedCookies()
  if (cached) {
    console.log('Using cached cookies')
    return { authToken: cached.auth_token, ct0: cached.ct0 }
  }

  console.log('Logging in with twitter-scraper + CycleTLS...')
  const scraper = new Scraper({
    fetch: cycleTLSFetchWithProxy,
  })

  await loginWithRetry(
    scraper,
    credentials.username,
    credentials.password,
    credentials.emailAddress,
    credentials.twoFactorSecret
  )

  if (!(await scraper.isLoggedIn())) {
    throw new Error('Login failed')
  }

  const cookies = await scraper.getCookies()
  const authToken = cookies.find((c) => c.key === 'auth_token')?.value
  const ct0 = cookies.find((c) => c.key === 'ct0')?.value

  if (!authToken || !ct0) {
    throw new Error('Failed to get auth_token or ct0 from cookies')
  }

  saveCookies(authToken, ct0)
  console.log('Login successful, cookies saved')

  return { authToken, ct0 }
}
