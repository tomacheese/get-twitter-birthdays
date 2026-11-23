import { withGoogleRetry } from './google-retry'

describe('withGoogleRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it.each([
    { code: 429 },
    { code: 503 },
    { status: 429 },
    { response: { status: 503 } },
    { code: 'ECONNRESET' },
  ])('retries retryable errors: %j', async (properties) => {
    const error = Object.assign(new Error('failed'), properties)
    const operation = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')
    const result = withGoogleRetry(operation)

    await jest.advanceTimersByTimeAsync(1000)

    await expect(result).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it.each([new Headers({ 'retry-after': '60' }), { 'retry-after': '60' }])(
    'honors Retry-After in headers: %j',
    async (headers) => {
      const error = Object.assign(new Error('rate limited'), {
        code: 429,
        response: { status: 429, headers },
      })
      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('ok')
      const result = withGoogleRetry(operation)

      await jest.advanceTimersByTimeAsync(59_999)
      expect(operation).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(1)

      await expect(result).resolves.toBe('ok')
      expect(operation).toHaveBeenCalledTimes(2)
    }
  )

  it('does not retry a non-retryable HTTP error', async () => {
    const error = Object.assign(new Error('bad request'), { code: 400 })
    const operation = jest.fn().mockRejectedValue(error)

    await expect(withGoogleRetry(operation)).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
