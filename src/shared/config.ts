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

export const BATCH_SIZE = 100
export const FOLLOWING_PAGE_SIZE = 200
export const DEFAULT_MAX_EMPTY_PAGES = 3

export function envFlag(name: string): boolean {
  return process.env[name] === '1'
}

export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return fallback
  }
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? fallback : parsed
}
