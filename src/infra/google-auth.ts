import { google, Auth } from 'googleapis'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { GOOGLE_AUTH_BIND_HOST } from '../shared/config'
import type { GoogleCredentials, GoogleTokens } from '../shared/types'
import {
  loadGoogleCredentials,
  loadGoogleTokens,
  saveGoogleTokens,
} from './storage'
import { withGoogleRetry } from '../shared/google-retry'

type OAuth2Client = Auth.OAuth2Client

const SCOPES = ['https://www.googleapis.com/auth/calendar']
const AUTH_PORT = 3000
const CALLBACK_PATH = '/callback'
const REDIRECT_URI = `http://localhost:${AUTH_PORT}${CALLBACK_PATH}`
const AUTH_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

/**
 * Compares the callback `state` with the issued one in constant time.
 *
 * @param actual `state` query parameter (null when absent)
 * @param expected Issued state
 * @returns True when they are equal
 */
function isStateValid(actual: string | null, expected: string): boolean {
  if (actual === null) {
    return false
  }

  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

/**
 * Escapes HTML special characters.
 *
 * @param text Text to escape
 * @returns Escaped text
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;')
}

/**
 * Creates a Google OAuth 2.0 client.
 *
 * @param credentials Google credentials
 * @returns OAuth2Client
 */
function createOAuth2Client(credentials: GoogleCredentials): OAuth2Client {
  // eslint-disable-next-line camelcase
  const { client_id, client_secret } = credentials.installed
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI)
}

/**
 * Runs the loopback OAuth flow on port 3000 and returns the tokens.
 * Rejects when the user denies access or {@link AUTH_TIMEOUT_MS} elapses.
 *
 * @param oauth2Client OAuth2Client instance
 * @returns Obtained tokens
 */
export async function performLoopbackAuth(
  oauth2Client: OAuth2Client
): Promise<GoogleTokens> {
  const state = randomBytes(32).toString('hex')
  const { codeVerifier, codeChallenge } =
    await oauth2Client.generateCodeVerifierAsync()

  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null
    let handled = false

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Ensures a refresh_token is issued
      state,
      code_challenge: codeChallenge,
      code_challenge_method: Auth.CodeChallengeMethod.S256,
    })

    console.log('🔐 Open the following URL to authenticate:')
    console.log(authUrl)
    console.log()

    const cleanup = () => {
      if (!timeoutId) {
        return
      }

      clearTimeout(timeoutId)
      timeoutId = null
    }

    const server = http.createServer()

    const finish = () => {
      cleanup()
      server.close()
      server.closeIdleConnections()
    }

    const exchangeCode = async (
      code: string,
      response: http.ServerResponse
    ): Promise<void> => {
      try {
        const { tokens } = await oauth2Client.getToken({ code, codeVerifier })
        if (!tokens.access_token) {
          response.statusCode = 500
          response.end('Authentication failed. See the terminal for details.')
          finish()
          reject(new Error('❌ Failed to obtain an access token'))
          return
        }

        response.end('Authentication completed. You can close this window.')
        finish()
        resolve(tokens as GoogleTokens)
      } catch (error) {
        response.statusCode = 500
        response.end('Authentication failed. See the terminal for details.')
        finish()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }

    server.on('request', (request, response) => {
      if (request.method !== 'GET') {
        response.statusCode = 405
        response.setHeader('Allow', 'GET')
        response.end('Method not allowed')
        return
      }

      let requestUrl: URL
      try {
        requestUrl = new URL(request.url ?? '/', 'http://localhost')
      } catch {
        response.statusCode = 400
        response.end('Invalid request')
        return
      }
      if (requestUrl.pathname !== CALLBACK_PATH) {
        response.statusCode = 404
        response.end('Not found')
        return
      }

      if (!isStateValid(requestUrl.searchParams.get('state'), state)) {
        response.statusCode = 400
        response.end('Invalid state')
        return
      }

      if (handled) {
        response.statusCode = 409
        response.end('Callback already handled')
        return
      }

      const code = requestUrl.searchParams.get('code')
      const callbackError = requestUrl.searchParams.get('error')
      if (code) {
        handled = true
        void exchangeCode(code, response)
      } else if (callbackError) {
        handled = true
        response.end(`Authentication error: ${escapeHtml(callbackError)}`)
        finish()
        reject(new Error(`❌ Authentication error: ${callbackError}`))
      } else {
        response.statusCode = 400
        response.end('Invalid callback')
      }
    })

    // Docker needs GOOGLE_AUTH_BIND_HOST=0.0.0.0 so the published port is reachable
    server.listen(AUTH_PORT, GOOGLE_AUTH_BIND_HOST, () => {
      console.log(
        `✅ Loopback server started on ${GOOGLE_AUTH_BIND_HOST}:${AUTH_PORT}`
      )
      if (!LOOPBACK_HOSTS.has(GOOGLE_AUTH_BIND_HOST)) {
        console.warn(
          `⚠️ The callback port is reachable from the network (GOOGLE_AUTH_BIND_HOST=${GOOGLE_AUTH_BIND_HOST})`
        )
      }
      console.log(
        `⏱️ Authentication timeout: ${AUTH_TIMEOUT_MS / 1000 / 60} minutes`
      )
    })

    server.on('error', (error) => {
      cleanup()
      server.close()
      reject(error)
    })

    timeoutId = setTimeout(() => {
      cleanup()
      server.close()
      reject(
        new Error(
          `❌ Authentication timed out: complete authentication within ${AUTH_TIMEOUT_MS / 1000 / 60} minutes`
        )
      )
    }, AUTH_TIMEOUT_MS)
  })
}

/**
 * Authenticates with Google OAuth 2.0.
 * Uses the cached tokens if they are still valid; otherwise runs the loopback flow and caches the new tokens.
 *
 * @returns Authenticated OAuth2Client
 */
export async function authenticateGoogle(): Promise<OAuth2Client> {
  const credentials = loadGoogleCredentials()
  if (!credentials) {
    throw new Error(
      `❌ Google credentials file not found. Create an OAuth 2.0 client ID in the Google Cloud Console and save the credentials to GOOGLE_CREDENTIALS_PATH.`
    )
  }

  const oauth2Client = createOAuth2Client(credentials)

  const cachedTokens = loadGoogleTokens()
  if (cachedTokens) {
    oauth2Client.setCredentials(cachedTokens)

    // Verify the cached token is still usable
    try {
      await withGoogleRetry(async () => {
        await oauth2Client.getAccessToken()
      })
      console.log('✅ Using cached Google tokens')
      return oauth2Client
    } catch {
      console.warn('⚠️ Cached tokens are invalid. Re-authenticating...')
    }
  }

  const tokens = await performLoopbackAuth(oauth2Client)
  oauth2Client.setCredentials(tokens)

  saveGoogleTokens(tokens)
  console.log('✅ Google tokens cached')

  return oauth2Client
}

/**
 * Lists the calendars and prompts the user to pick one (Enter selects the primary calendar, or the first one if there is none).
 *
 * @param oauth2Client Authenticated OAuth2Client
 * @returns Selected calendar ID
 */
async function selectCalendar(oauth2Client: OAuth2Client): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  console.log()
  console.log('📅 Fetching the calendar list...')

  const response = await withGoogleRetry(async () => {
    return await calendar.calendarList.list()
  })

  const calendars = response.data.items ?? []
  if (calendars.length === 0) {
    throw new Error('❌ No calendars found')
  }

  console.log()
  console.log('📋 Available calendars:')
  for (const [index, cal] of calendars.entries()) {
    const isPrimary = cal.primary ? ' (primary)' : ''
    console.log(`  ${index + 1}. ${cal.summary ?? 'Untitled'}${isPrimary}`)
  }

  console.log()

  const primaryCalendar = calendars.find((cal) => cal.primary)
  const defaultIndex = primaryCalendar ? calendars.indexOf(primaryCalendar) : 0

  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question(
      `Select a calendar (1-${calendars.length}, default: ${defaultIndex + 1}): `
    )
    const selectedIndex =
      answer.trim() === '' ? defaultIndex : Number(answer) - 1

    if (
      Number.isNaN(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= calendars.length
    ) {
      throw new Error('❌ Invalid selection')
    }

    const selectedCalendar = calendars[selectedIndex]
    if (!selectedCalendar.id) {
      throw new Error('❌ Failed to get the calendar ID')
    }

    console.log()
    console.log(
      `✅ Selected calendar: ${selectedCalendar.summary ?? 'Untitled'}`
    )
    console.log(`   Calendar ID: ${selectedCalendar.id}`)

    return selectedCalendar.id
  } finally {
    rl.close()
  }
}

/**
 * Runs authentication, then lets the user pick a calendar and prints how to set it as `GOOGLE_CALENDAR_ID`.
 */
export async function runGoogleAuth(): Promise<void> {
  console.log('🔐 Starting Google OAuth 2.0 authentication...')
  console.log()

  try {
    const oauth2Client = await authenticateGoogle()
    console.log()
    console.log('✅ Authentication completed!')

    const calendarId = await selectCalendar(oauth2Client)

    console.log()
    console.log(
      '💡 To use this calendar, set the following environment variable:'
    )
    console.log()
    console.log(`  export GOOGLE_CALENDAR_ID="${calendarId}"`)
    console.log()
    console.log('Or add the following to your `.env` file:')
    console.log()
    console.log(`  GOOGLE_CALENDAR_ID="${calendarId}"`)
    console.log()
  } catch (error) {
    console.error('❌ Authentication failed:', error)
    throw error
  }
}
