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
 * 出力先ディレクトリが存在することを保証する。
 * @param outputPath 出力ファイルのパス
 */
export function ensureOutputDir(outputPath: string): void {
  const outDir = path.dirname(outputPath)
  if (outDir && outDir !== '.' && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
}

/**
 * 誕生日の出力JSONを保存する。
 * @param outputPath 出力ファイルのパス
 * @param output 出力内容
 */
export function saveOutput(outputPath: string, output: BirthdaysOutput): void {
  ensureOutputDir(outputPath)
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
}

/**
 * 進捗ファイルを保存する。
 * @param progressPath 進捗ファイルのパス
 * @param state 進捗状態
 */
export function saveProgress(progressPath: string, state: ResumeState): void {
  ensureOutputDir(progressPath)
  fs.writeFileSync(progressPath, JSON.stringify(state, null, 2))
}

/**
 * 進捗ファイルを読み込む。
 * @param progressPath 進捗ファイルのパス
 * @returns 進捗状態
 */
export function loadProgress(progressPath: string): ResumeState | null {
  if (!fs.existsSync(progressPath)) {
    return null
  }
  try {
    const raw = fs.readFileSync(progressPath, 'utf8')
    return JSON.parse(raw) as ResumeState
  } catch (err) {
    console.warn('Failed to load progress file', err)
    return null
  }
}

/**
 * 設定ファイルを読み込む。
 * @returns 設定情報
 */
export function loadConfig(): Config | null {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw) as Config
}

/**
 * Cookieキャッシュの構造が正しいか判定する。
 * @param data 読み込んだデータ
 * @returns 正しい場合は true
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
 * Cookieキャッシュを読み込む。
 * @returns Cookieキャッシュ
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
    if (Date.now() - data.savedAt > expiryMs) {
      return null
    }
    return data
  } catch (err) {
    console.warn('Failed to load cached cookies', err)
    return null
  }
}

/**
 * Cookieキャッシュを保存する。
 * @param authToken 認証トークン
 * @param ct0 CSRFトークン
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
 * Google 認証情報ファイルを読み込む。
 * @returns Google 認証情報
 */
export function loadGoogleCredentials(): GoogleCredentials | null {
  if (!fs.existsSync(GOOGLE_CREDENTIALS_PATH)) {
    return null
  }
  try {
    const raw = fs.readFileSync(GOOGLE_CREDENTIALS_PATH, 'utf8')
    return JSON.parse(raw) as GoogleCredentials
  } catch (err) {
    console.warn('⚠️ Google 認証情報ファイルの読み込みに失敗しました', err)
    return null
  }
}

/**
 * Google トークンキャッシュを読み込む。
 * @returns Google トークン
 */
export function loadGoogleTokens(): GoogleTokens | null {
  if (!fs.existsSync(GOOGLE_TOKEN_CACHE_PATH)) {
    return null
  }
  try {
    const raw = fs.readFileSync(GOOGLE_TOKEN_CACHE_PATH, 'utf8')
    return JSON.parse(raw) as GoogleTokens
  } catch (err) {
    console.warn('⚠️ Google トークンキャッシュの読み込みに失敗しました', err)
    return null
  }
}

/**
 * Google トークンを保存する。
 * @param tokens Google トークン
 */
export function saveGoogleTokens(tokens: GoogleTokens): void {
  ensureOutputDir(GOOGLE_TOKEN_CACHE_PATH)
  fs.writeFileSync(GOOGLE_TOKEN_CACHE_PATH, JSON.stringify(tokens, null, 2))
}

/**
 * カレンダーイベント記録を読み込む。
 * @returns カレンダーイベント記録
 */
export function loadCalendarEvents(): CalendarEventsStorage {
  if (!fs.existsSync(CALENDAR_EVENTS_PATH)) {
    return {}
  }
  try {
    const raw = fs.readFileSync(CALENDAR_EVENTS_PATH, 'utf8')
    return JSON.parse(raw) as CalendarEventsStorage
  } catch (err) {
    console.warn('⚠️ カレンダーイベント記録の読み込みに失敗しました', err)
    return {}
  }
}

/**
 * カレンダーイベント記録を保存する。
 * @param events カレンダーイベント記録
 */
export function saveCalendarEvents(events: CalendarEventsStorage): void {
  ensureOutputDir(CALENDAR_EVENTS_PATH)
  fs.writeFileSync(CALENDAR_EVENTS_PATH, JSON.stringify(events, null, 2))
}
