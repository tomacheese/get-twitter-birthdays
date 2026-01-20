import fs from 'node:fs'
import path from 'node:path'
import {
  CONFIG_PATH,
  COOKIE_CACHE_FILE,
  COOKIE_EXPIRY_DAYS,
} from '../shared/config'
import type { CachedCookies, Config, ResumeState } from '../shared/types'
import type { BirthdaysOutput } from '../shared/types'

export function ensureOutputDir(outputPath: string): void {
  const outDir = path.dirname(outputPath)
  if (outDir && outDir !== '.' && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
}

export function saveOutput(outputPath: string, output: BirthdaysOutput): void {
  ensureOutputDir(outputPath)
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
}

export function saveProgress(progressPath: string, state: ResumeState): void {
  ensureOutputDir(progressPath)
  fs.writeFileSync(progressPath, JSON.stringify(state, null, 2))
}

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

export function loadConfig(): Config | null {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw) as Config
}

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
  } catch (error) {
    console.warn('Failed to load cached cookies', error)
    return null
  }
}

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
