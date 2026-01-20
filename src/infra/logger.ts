import fs from 'node:fs'
import path from 'node:path'
import { RESPONSES_DIR, RESPONSES_LOG_ENABLED } from '../shared/config'

let responseLogDir: string | null = null
let responseLogCounter = 0

/** レスポンスログ保存用のディレクトリを用意する。 */
function ensureResponseLogDir(): string | null {
  if (!RESPONSES_LOG_ENABLED) {
    return null
  }
  if (responseLogDir) {
    return responseLogDir
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
  responseLogDir = path.join(RESPONSES_DIR, timestamp)
  fs.mkdirSync(responseLogDir, { recursive: true })
  return responseLogDir
}

/** HTTPレスポンスをファイルに保存する。 */
export function writeResponseLog(params: {
  url: string
  method: string
  status: number
  headers: Record<string, string | string[]>
  body: string
}): void {
  try {
    const dir = ensureResponseLogDir()
    if (!dir) {
      return
    }
    responseLogCounter += 1
    const index = String(responseLogCounter).padStart(6, '0')
    const safeUrl = params.url.replaceAll(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
    const baseName = `${index}_${params.method}_${safeUrl || 'response'}`
    const metaPath = path.join(dir, `${baseName}.json`)
    const bodyPath = path.join(dir, `${baseName}.body`)
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          url: params.url,
          method: params.method,
          status: params.status,
          headers: params.headers,
          bodyFile: path.basename(bodyPath),
          recordedAt: new Date().toISOString(),
        },
        null,
        2
      )
    )
    fs.writeFileSync(bodyPath, params.body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`Failed to write response log: ${message}`)
  }
}
