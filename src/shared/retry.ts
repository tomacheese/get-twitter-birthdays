/**
 * 指定処理をリトライしながら実行する。
 * @param fn 実行する非同期処理
 * @param options リトライ設定
 * @returns 処理結果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
    operationName?: string
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    operationName = 'operation',
  } = options

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn()
    } catch (error: unknown) {
      const response = (error as { response?: Response }).response
      const status = response?.status
      if (status === 429 || status === 403) {
        const resetHeader = response?.headers.get('x-rate-limit-reset')
        const resetAt = resetHeader ? Number(resetHeader) * 1000 : Number.NaN
        if (!Number.isNaN(resetAt)) {
          const delay = Math.max(resetAt - Date.now() + 1000, 1000)
          const resetDate = new Date(resetAt)
          console.warn(
            `${operationName} rate limited (${status}). Reset at ${resetDate.toLocaleString()} (in ${Math.ceil(delay / 1000)}s). Waiting...`
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          attempt -= 1
          continue
        }
      }

      if (attempt >= maxRetries) {
        throw error
      }

      if (status === 403) {
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt - 1),
          maxDelayMs
        )
        console.warn(
          `${operationName} returned 403. Waiting ${Math.ceil(delay / 1000)}s before retrying...`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      console.warn(
        `${operationName} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay / 1000}s...`
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw new Error(`${operationName} failed after ${maxRetries} attempts.`)
}

/**
 * 例外オブジェクトからHTTPステータスを取り出す。
 * @param error 例外オブジェクト
 * @returns HTTPステータス
 */
export function getResponseStatus(error: unknown): number | undefined {
  return (error as { response?: Response }).response?.status
}
