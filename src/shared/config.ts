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

// Google Calendar 関連の設定
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
 * 環境変数のフラグ(1/それ以外)を判定する。
 * @param name 参照する環境変数名
 * @returns true の場合は有効
 */
export function envFlag(name: string): boolean {
  return process.env[name] === '1'
}

/**
 * 環境変数の数値を取得し、無効なら既定値を返す。
 * @param name 参照する環境変数名
 * @param fallback 変換できない場合の既定値
 * @returns 解析済みの数値
 */
export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return fallback
  }
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? fallback : parsed
}
