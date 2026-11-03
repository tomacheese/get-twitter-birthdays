import fs from 'node:fs'
import path from 'node:path'
import {
  CALENDAR_EVENTS_PATH,
  CONFIG_PATH,
  COOKIE_CACHE_FILE,
  COOKIE_EXPIRY_DAYS,
  GOOGLE_CREDENTIALS_PATH,
  GOOGLE_TOKEN_CACHE_PATH,
} from '../shared/config'
import type {
  BirthdaysOutput,
  CachedCookies,
  CalendarEventsStorage,
  Config,
  GoogleCredentials,
  GoogleTokens,
  ResumeState,
} from '../shared/types'

/**
 * Creates the parent directory of a file path if it does not exist.
 * @param outputPath File path
 */
export function ensureOutputDir(outputPath: string): void {
  const outDir = path.dirname(outputPath)
  if (outDir && outDir !== '.' && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
}

/**
 * Saves the birthdays output JSON.
 * @param outputPath Output file path
 * @param output Output contents
 */
export function saveOutput(outputPath: string, output: BirthdaysOutput): void {
  ensureOutputDir(outputPath)
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
}

/**
 * Saves the progress file.
 * @param progressPath Progress file path
 * @param state Progress state
 */
export function saveProgress(progressPath: string, state: ResumeState): void {
  ensureOutputDir(progressPath)
  fs.writeFileSync(progressPath, JSON.stringify(state, null, 2))
}

/**
 * Loads the progress file.
 * @param progressPath Progress file path
 * @returns Progress state, or null if missing or unreadable
 */
export function loadProgress(progressPath: string): ResumeState | null {
  if (!fs.existsSync(progressPath)) {
    return null
  }
  try {
    const raw = fs.readFileSync(progressPath, 'utf8')
    return JSON.parse(raw) as ResumeState
  } catch (error) {
    console.warn('Failed to load progress file', error)
    return null
  }
}

/**
 * Loads the config file.
 * @returns Config, or null if the file does not exist
 */
export function loadConfig(): Config | null {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw) as Config
}

/**
 * Checks that parsed data has the cookie cache shape.
 * @param data Parsed data
 * @returns True if valid
 */
function isValidCachedCookies(data: unknown): data is CachedCookies {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  const obj = data as Record<string, unknown>
  return (
    typeof obj.auth_token === 'string' &&
    typeof obj.ct0 === 'string' &&
    typeof obj.savedAt === 'number'
  )
}

/**
 * Loads the cookie cache.
 * @returns Cached cookies, or null if missing, invalid, or older than `COOKIE_EXPIRY_DAYS`
 */
export function loadCachedCookies(): CachedCookies | null {
  try {
    if (!fs.existsSync(COOKIE_CACHE_FILE)) {
      return null
    }
    const data: unknown = JSON.parse(fs.readFileSync(COOKIE_CACHE_FILE, 'utf8'))
    if (!isValidCachedCookies(data)) {
      console.warn('Invalid cookie cache structure')
      return null
    }
    const expiryMs = COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    return Date.now() - data.savedAt > expiryMs ? null : data
  } catch (error) {
    console.warn('Failed to load cached cookies', error)
    return null
  }
}

/**
 * Saves the cookie cache.
 * @param authToken `auth_token` cookie value
 * @param ct0 `ct0` (CSRF token) cookie value
 */
export function saveCookies(authToken: string, ct0: string): void {
  const dir = path.dirname(COOKIE_CACHE_FILE)
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const data: CachedCookies = {
    auth_token: authToken,
    ct0,
    savedAt: Date.now(),
  }
  fs.writeFileSync(COOKIE_CACHE_FILE, JSON.stringify(data, null, 2))
}

/**
 * Loads the Google credentials file.
 * @returns Google credentials, or null if missing or unreadable
 */
export function loadGoogleCredentials(): GoogleCredentials | null {
  if (!fs.existsSync(GOOGLE_CREDENTIALS_PATH)) {
    return null
  }
  try {
    const raw = fs.readFileSync(GOOGLE_CREDENTIALS_PATH, 'utf8')
    return JSON.parse(raw) as GoogleCredentials
  } catch (error) {
    console.warn('⚠️ Failed to load the Google credentials file', error)
    return null
  }
}

/**
 * Loads the Google token cache.
 * @returns Google tokens, or null if missing or unreadable
 */
export function loadGoogleTokens(): GoogleTokens | null {
  if (!fs.existsSync(GOOGLE_TOKEN_CACHE_PATH)) {
    return null
  }
  try {
    const raw = fs.readFileSync(GOOGLE_TOKEN_CACHE_PATH, 'utf8')
    return JSON.parse(raw) as GoogleTokens
  } catch (error) {
    console.warn('⚠️ Failed to load the Google token cache', error)
    return null
  }
}

/**
 * Saves the Google tokens.
 * @param tokens Google tokens
 */
export function saveGoogleTokens(tokens: GoogleTokens): void {
  ensureOutputDir(GOOGLE_TOKEN_CACHE_PATH)
  fs.writeFileSync(GOOGLE_TOKEN_CACHE_PATH, JSON.stringify(tokens, null, 2))
}

/**
 * Loads the calendar event records.
 * @returns Event records keyed by user ID (empty if missing or unreadable)
 */
export function loadCalendarEvents(): CalendarEventsStorage {
  if (!fs.existsSync(CALENDAR_EVENTS_PATH)) {
    return {}
  }
  try {
    const raw = fs.readFileSync(CALENDAR_EVENTS_PATH, 'utf8')
    return JSON.parse(raw) as CalendarEventsStorage
  } catch (error) {
    console.warn('⚠️ Failed to load the calendar event records', error)
    return {}
  }
}

/**
 * Saves the calendar event records.
 * @param events Event records keyed by user ID
 */
export function saveCalendarEvents(events: CalendarEventsStorage): void {
  ensureOutputDir(CALENDAR_EVENTS_PATH)
  fs.writeFileSync(CALENDAR_EVENTS_PATH, JSON.stringify(events, null, 2))
}
