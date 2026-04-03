/**
 * GaxiosError 互換のエラー型を表す。
 */
interface GaxiosErrorLike extends Error {
  code?: string
  response?: {
    status?: number
    headers?: Record<string, string | string[]>
  }
}

/**
 * Google API のエラーがリトライ可能かどうかを判定する。
 *
 * @param error エラーオブジェクト
 * @returns リトライ可能な場合は true
 */
function isRetryableGoogleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  // GaxiosError の場合
  if ('code' in error && typeof error.code === 'string') {
    const gaxiosError = error as GaxiosErrorLike
    const status = gaxiosError.response?.status

    // レートリミットまたはサーバーエラー
    if (status === 429 || (status && status >= 500)) {
      return true
    }

    // ネットワークエラー
    if (
      gaxiosError.code === 'ECONNRESET' ||
      gaxiosError.code === 'ETIMEDOUT' ||
      gaxiosError.code === 'ENOTFOUND'
    ) {
      return true
    }
  }

  return false
}

/**
 * Google API のエラーから待機時間を計算する。
 *
 * @param error エラーオブジェクト
 * @param attempt 試行回数（0始まり）
 * @returns 待機時間（ミリ秒）
 */
function getRetryDelay(error: unknown, attempt: number): number {
  // Retry-After ヘッダーを確認
  if (error instanceof Error && 'response' in error) {
    const gaxiosError = error as GaxiosErrorLike
    const retryAfter = gaxiosError.response?.headers?.['retry-after']

    if (retryAfter) {
      const retryAfterValue = Array.isArray(retryAfter)
        ? retryAfter[0]
        : retryAfter

      // 秒数で指定されている場合
      const seconds = Number.parseInt(retryAfterValue, 10)
      if (!Number.isNaN(seconds)) {
        return seconds * 1000
      }

      // 日付で指定されている場合
      const retryDate = new Date(retryAfterValue)
      if (!Number.isNaN(retryDate.getTime())) {
        return Math.max(0, retryDate.getTime() - Date.now())
      }
    }
  }

  // 指数バックオフ: 1秒 → 2秒 → 4秒 → 8秒
  return Math.min(1000 * 2 ** attempt, 8000)
}

/**
 * Google API の呼び出しをリトライ処理でラップする。
 *
 * @param fn 実行する非同期関数
 * @param maxRetries 最大リトライ回数（デフォルト: 3）
 * @returns 関数の実行結果
 */
export async function withGoogleRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      // 最終試行またはリトライ不可能なエラーの場合は例外をスロー
      if (attempt === maxRetries || !isRetryableGoogleError(err)) {
        throw err
      }

      // 待機してリトライ
      const delay = getRetryDelay(err, attempt)
      console.warn(
        `🔄 Google API エラー (試行 ${attempt + 1}/${maxRetries + 1}): ${
          err instanceof Error ? err.message : String(err)
        }. ${delay}ms 後にリトライします...`
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // 到達しないはずだが、型安全性のため
  throw lastError
}
