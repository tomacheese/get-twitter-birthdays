/**
 * Error shape compatible with GaxiosError.
 */
interface GaxiosErrorLike extends Error {
  code?: string
  response?: {
    status?: number
    headers?: Record<string, string | string[]>
  }
}

/**
 * Determines whether a Google API error is retryable (429, 5xx, or a network error).
 *
 * @param error Thrown value
 * @returns True if retryable
 */
function isRetryableGoogleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if ('code' in error && typeof error.code === 'string') {
    const gaxiosError = error as GaxiosErrorLike & { code: string }
    const status = gaxiosError.response?.status

    if (status === 429 || (status && status >= 500)) {
      return true
    }

    if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(gaxiosError.code)) {
      return true
    }
  }

  return false
}

/**
 * Computes the wait before the next retry, honoring `Retry-After` when present.
 *
 * @param error Thrown value
 * @param attempt Attempt number (0-based)
 * @returns Delay in milliseconds
 */
function getRetryDelay(error: unknown, attempt: number): number {
  if (error instanceof Error && 'response' in error) {
    const gaxiosError = error as GaxiosErrorLike
    const retryAfter = gaxiosError.response?.headers?.['retry-after']

    if (retryAfter) {
      const retryAfterValue = Array.isArray(retryAfter)
        ? retryAfter[0]
        : retryAfter

      // Delay in seconds
      const seconds = Number.parseInt(retryAfterValue, 10)
      if (!Number.isNaN(seconds)) {
        return seconds * 1000
      }

      // HTTP date
      const retryDate = new Date(retryAfterValue)
      if (!Number.isNaN(retryDate.getTime())) {
        return Math.max(0, retryDate.getTime() - Date.now())
      }
    }
  }

  // Exponential backoff capped at 8s: 1s, 2s, 4s, 8s
  return Math.min(1000 * 2 ** attempt, 8000)
}

/**
 * Runs a Google API call, retrying on retryable errors.
 *
 * @param fn Function to run
 * @param maxRetries Maximum number of retries (default: 3)
 * @returns Result of the function
 */
export async function withGoogleRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxRetries || !isRetryableGoogleError(error)) {
        throw error
      }

      const delay = getRetryDelay(error, attempt)
      console.warn(
        `🔄 Google API error (attempt ${attempt + 1}/${maxRetries + 1}): ${
          error instanceof Error ? error.message : String(error)
        }. Retrying in ${delay}ms...`
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // Unreachable; satisfies the type checker
  throw lastError
}
