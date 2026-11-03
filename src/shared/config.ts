export const CONFIG_PATH = process.env.CONFIG_PATH ?? './data/config.json'
export const OUTPUT_PATH =
  process.env.BIRTHDAYS_OUTPUT_PATH ?? './data/birthdays.json'
export const PROGRESS_PATH =
  process.env.BIRTHDAYS_PROGRESS_PATH ?? './data/birthdays-progress.json'
export const COOKIE_CACHE_FILE =
  process.env.COOKIE_CACHE_PATH ?? './data/twitter-cookies.json'
export const COOKIE_EXPIRY_DAYS = 7
export const RESPONSES_DIR = process.env.RESPONSES_DIR ?? './data/responses'
export const RESPONSES_LOG_ENABLED = process.env.RESPONSES_LOG_ENABLED === '1'

// Google Calendar settings
export const GOOGLE_CREDENTIALS_PATH =
  process.env.GOOGLE_CREDENTIALS_PATH ?? './data/google-credentials.json'
export const GOOGLE_TOKEN_CACHE_PATH =
  process.env.GOOGLE_TOKEN_CACHE_PATH ?? './data/google-tokens.json'
export const CALENDAR_EVENTS_PATH =
  process.env.CALENDAR_EVENTS_PATH ?? './data/calendar-events.json'
export const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'primary'
export const SYNC_CALENDAR_STRICT = process.env.SYNC_CALENDAR_STRICT === '1'
export const SYNC_CALENDAR_RECONCILE =
  process.env.SYNC_CALENDAR_RECONCILE === '1'

export const BATCH_SIZE = 100
export const FOLLOWING_PAGE_SIZE = 200
export const DEFAULT_MAX_EMPTY_PAGES = 3

/**
 * Checks whether an environment variable flag is enabled (`1`; any other value is off).
 * @param name Environment variable name
 * @returns True if enabled
 */
export function envFlag(name: string): boolean {
  return process.env[name] === '1'
}

/**
 * Reads a numeric environment variable, falling back when unset, empty, or not a number.
 * @param name Environment variable name
 * @param fallback Value used when parsing fails
 * @returns Parsed number
 */
export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return fallback
  }
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? fallback : parsed
}

const DEFAULT_RECONCILE_MAX_DELETIONS = 10
const reconcileMaxDeletions = envNumber(
  'SYNC_CALENDAR_RECONCILE_MAX_DELETIONS',
  DEFAULT_RECONCILE_MAX_DELETIONS
)

/** Maximum number of events a single reconcile run may delete (0 = unlimited) */
export const SYNC_CALENDAR_RECONCILE_MAX_DELETIONS =
  Number.isFinite(reconcileMaxDeletions) && reconcileMaxDeletions >= 0
    ? reconcileMaxDeletions
    : DEFAULT_RECONCILE_MAX_DELETIONS
