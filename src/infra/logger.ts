import fs from 'node:fs'
import path from 'node:path'
import { IS_RESPONSES_LOG_ENABLED, RESPONSES_DIR } from '../shared/config'

const responseLogState: { directory: string | null; counter: number } = {
  directory: null,
  counter: 0,
}

/**
 * レスポンスログ保存用のディレクトリを用意する。
 * @returns ディレクトリパス
 */
function ensureResponseLogDirectory(): string | null {
  if (!IS_RESPONSES_LOG_ENABLED) {
    return null
  }
  if (responseLogState.directory) {
    return responseLogState.directory
  }
  const now = new Date()
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(
    2,
    '0'
  )}${String(now.getMinutes()).padStart(2, '0')}${String(
    now.getSeconds()
  ).padStart(2, '0')}`
  responseLogState.directory = path.join(RESPONSES_DIR, timestamp)
  fs.mkdirSync(responseLogState.directory, { recursive: true })
  return responseLogState.directory
}

/**
 * HTTPレスポンスをファイルに保存する。
 * @param parameters 保存対象の情報
 */
export function writeResponseLog(parameters: {
  url: string
  method: string
  status: number
  headers: Record<string, string | string[]>
  body: string
}): void {
  try {
    const directory = ensureResponseLogDirectory()
    if (!directory) {
      return
    }
    responseLogState.counter += 1
    const index = String(responseLogState.counter).padStart(6, '0')
    const safeUrl = parameters.url
      .replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80)
    const baseName = `${index}_${parameters.method}_${safeUrl || 'response'}`
    const metaPath = path.join(directory, `${baseName}.json`)
    const bodyPath = path.join(directory, `${baseName}.body`)
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          url: parameters.url,
          method: parameters.method,
          status: parameters.status,
          headers: parameters.headers,
          bodyFile: path.basename(bodyPath),
          recordedAt: new Date().toISOString(),
        },
        null,
        2
      )
    )
    fs.writeFileSync(bodyPath, parameters.body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`Failed to write response log: ${message}`)
  }
}
