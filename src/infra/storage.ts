import fs from 'node:fs'
import path from 'node:path'
import {
  CALENDAR_EVENTS_LEGACY_CALENDAR_ID,
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
  CalendarEventsFile,
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
 * Normalizes a username for comparison: trims, strips one leading `@`, lowercases.
 * @param value Username as configured or cached
 * @returns Normalized username
 */
function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase()
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
    typeof obj.savedAt === 'number' &&
    typeof obj.username === 'string'
  )
}

/**
 * Loads the cookie cache.
 * @param username Configured username; compared after normalization
 * @returns Cached cookies, or null if missing, invalid (including a legacy cache without a username), older than `COOKIE_EXPIRY_DAYS`, or issued for a different account
 */
export function loadCachedCookies(username: string): CachedCookies | null {
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
    if (Date.now() - data.savedAt > expiryMs) {
      return null
    }
    if (normalizeUsername(data.username) !== normalizeUsername(username)) {
      console.log(
        'Cookie cache belongs to a different account; logging in again'
      )
      return null
    }
    return data
  } catch (error) {
    console.warn('Failed to load cached cookies', error)
    return null
  }
}

/**
 * Saves the cookie cache.
 * @param authToken `auth_token` cookie value
 * @param ct0 `ct0` (CSRF token) cookie value
 * @param username Username the cookies were issued for; stored normalized
 */
export function saveCookies(
  authToken: string,
  ct0: string,
  username: string
): void {
  const dir = path.dirname(COOKIE_CACHE_FILE)
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const data: CachedCookies = {
    auth_token: authToken,
    ct0,
    savedAt: Date.now(),
    username: normalizeUsername(username),
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

function writeCalendarEventsFile(file: CalendarEventsFile): void {
  ensureOutputDir(CALENDAR_EVENTS_PATH)
  fs.writeFileSync(CALENDAR_EVENTS_PATH, JSON.stringify(file, null, 2))
}

/**
 * Reads the calendar event records file of every calendar.
 *
 * A legacy file (a flat map without calendar info) is migrated only when `CALENDAR_EVENTS_LEGACY_CALENDAR_ID` names the calendar it belongs to.
 *
 * @returns Records of every calendar (empty if the file is missing)
 * @throws If the file is unreadable, unsupported, or a non-empty legacy file has no confirmed calendar
 */
function readCalendarEventsFile(): CalendarEventsFile {
  if (!fs.existsSync(CALENDAR_EVENTS_PATH)) {
    return { version: 2, calendars: {} }
  }

  const unsupported = (cause?: unknown): Error =>
    new Error(
      `❌ ${CALENDAR_EVENTS_PATH} is not a supported calendar event records file`,
      { cause }
    )

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(CALENDAR_EVENTS_PATH, 'utf8'))
  } catch (error) {
    throw unsupported(error)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw unsupported()
  }

  const record = parsed as Record<string, unknown>
  if ('version' in record) {
    if (record.version !== 2) {
      throw unsupported()
    }
    const { calendars } = record
    if (
      calendars === null ||
      typeof calendars !== 'object' ||
      Array.isArray(calendars)
    ) {
      throw unsupported()
    }
    return record as unknown as CalendarEventsFile
  }

  const legacy = record as CalendarEventsStorage
  if (Object.keys(legacy).length === 0) {
    return { version: 2, calendars: {} }
  }
  if (!CALENDAR_EVENTS_LEGACY_CALENDAR_ID) {
    throw new Error(
      `❌ ${CALENDAR_EVENTS_PATH} has no calendar recorded. Set CALENDAR_EVENTS_LEGACY_CALENDAR_ID to the calendar ID the records were created in, or delete the file`
    )
  }

  const migrated: CalendarEventsFile = {
    version: 2,
    calendars: { [CALENDAR_EVENTS_LEGACY_CALENDAR_ID]: legacy },
  }
  writeCalendarEventsFile(migrated)
  console.log('ℹ️ Migrated legacy calendar event records')
  return migrated
}

/**
 * Loads the event records of one calendar.
 * @param calendarId Resolved calendar ID the records belong to
 * @returns Event records keyed by user ID (empty if none are recorded for the calendar)
 * @throws If the file is unreadable, unsupported, or an unconfirmed legacy file (see {@link readCalendarEventsFile})
 */
export function loadCalendarEvents(calendarId: string): CalendarEventsStorage {
  return readCalendarEventsFile().calendars[calendarId] ?? {}
}

/**
 * Saves the event records of one calendar, leaving the other calendars' records unchanged.
 * @param calendarId Resolved calendar ID the records belong to
 * @param events Event records keyed by user ID
 * @throws If the existing file is unreadable or unsupported
 */
export function saveCalendarEvents(
  calendarId: string,
  events: CalendarEventsStorage
): void {
  const file = readCalendarEventsFile()
  file.calendars[calendarId] = events
  writeCalendarEventsFile(file)
}
