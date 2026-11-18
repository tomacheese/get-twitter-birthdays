import { google } from 'googleapis'
import http from 'node:http'
import { performLoopbackAuth } from './google-auth'

const TOKENS = { access_token: 'access', refresh_token: 'refresh' }

interface HttpResult {
  status: number
  body: string
}

/**
 * Sends a request to the loopback server.
 * @param path Request path and query
 * @param method HTTP method
 * @returns Response status and body
 */
async function send(path: string, method = 'GET'): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port: 3000, path, method, agent: false },
      (response) => {
        let body = ''
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, body })
        })
      }
    )
    request.on('error', reject)
    request.end()
  })
}

/**
 * Polls until the condition holds.
 * @param condition Condition to wait for
 */
async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('performLoopbackAuth', () => {
  type Settled = { ok: true; value: unknown } | { ok: false; error: Error }

  let logSpy: jest.SpyInstance<void, unknown[]>
  let getToken: jest.Mock
  let client: InstanceType<typeof google.auth.OAuth2>

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockReturnValue()
    jest.spyOn(console, 'warn').mockReturnValue()
    getToken = jest.fn().mockResolvedValue({ tokens: TOKENS })
    client = new google.auth.OAuth2(
      'client-id',
      'client-secret',
      'http://localhost:3000/callback'
    )
    ;(client as unknown as { getToken: jest.Mock }).getToken = getToken
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  /**
   * Starts the flow and waits until the server is listening.
   * @returns The settled-result promise, the issued state and the auth URL
   */
  async function start(): Promise<{
    settled: Promise<Settled>
    state: string
    authUrl: URL
  }> {
    const settled = performLoopbackAuth(client).then(
      (value): Settled => ({ ok: true, value }),
      (error: unknown): Settled => ({
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    )
    await waitFor(() =>
      logSpy.mock.calls.some((call) =>
        String(call[0]).startsWith('✅ Loopback server started')
      )
    )
    const printed = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.startsWith('https://'))
    const authUrl = new URL(printed ?? '')
    return { settled, state: authUrl.searchParams.get('state') ?? '', authUrl }
  }

  it('resolves with the tokens for a callback with the issued state and exchanges the code with the verifier', async () => {
    const { settled, state, authUrl } = await start()

    const result = await send(`/callback?state=${state}&code=abc`)

    expect(result).toEqual({
      status: 200,
      body: 'Authentication completed. You can close this window.',
    })
    expect(await settled).toEqual({ ok: true, value: TOKENS })
    expect(getToken).toHaveBeenCalledTimes(1)
    const [options] = getToken.mock.calls[0] as [
      { code: string; codeVerifier: string },
    ]
    expect(options.code).toBe('abc')
    expect(options.codeVerifier).toMatch(/^[\w.~-]{43,128}$/)
    expect(authUrl.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/)
  })

  it('puts state and an S256 code challenge in the auth URL', async () => {
    const { settled, state, authUrl } = await start()

    expect(state).toMatch(/^[\da-f]{64}$/)
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
    await send(`/callback?state=${state}&code=abc`)
    await settled
  })

  it.each([
    ['a wrong state', '/callback?state=wrong&code=abc'],
    ['no state', '/callback?code=abc'],
  ])('rejects %s with 400 and keeps waiting', async (_, path) => {
    const { settled, state } = await start()

    expect(await send(path)).toEqual({ status: 400, body: 'Invalid state' })
    expect(getToken).not.toHaveBeenCalled()

    await send(`/callback?state=${state}&code=abc`)
    expect(await settled).toEqual({ ok: true, value: TOKENS })
  })

  it('rejects a non-GET request with 405 and keeps waiting', async () => {
    const { settled, state } = await start()

    expect(await send(`/callback?state=${state}&code=abc`, 'POST')).toEqual({
      status: 405,
      body: 'Method not allowed',
    })
    expect(getToken).not.toHaveBeenCalled()

    await send(`/callback?state=${state}&code=abc`)
    await settled
  })

  it('answers 400 to a malformed request target and keeps waiting', async () => {
    const { settled, state } = await start()

    expect(await send('//')).toEqual({ status: 400, body: 'Invalid request' })

    await send(`/callback?state=${state}&code=abc`)
    await settled
  })

  it('rejects another path with 404 and keeps waiting', async () => {
    const { settled, state } = await start()

    expect(await send(`/other?state=${state}&code=abc`)).toEqual({
      status: 404,
      body: 'Not found',
    })
    expect(getToken).not.toHaveBeenCalled()

    await send(`/callback?state=${state}&code=abc`)
    await settled
  })

  it('rejects a second valid callback with 409 while the exchange is in flight', async () => {
    const exchange = Promise.withResolvers<unknown>()
    getToken.mockReturnValue(exchange.promise)
    const { settled, state } = await start()

    const first = send(`/callback?state=${state}&code=first`)
    await waitFor(() => getToken.mock.calls.length === 1)

    expect(await send(`/callback?state=${state}&code=second`)).toEqual({
      status: 409,
      body: 'Callback already handled',
    })

    exchange.resolve({ tokens: TOKENS })
    const firstResult = await first
    expect(firstResult.status).toBe(200)
    expect(await settled).toEqual({ ok: true, value: TOKENS })
    expect(getToken).toHaveBeenCalledTimes(1)
  })

  it('rejects and answers 500 when the token exchange fails', async () => {
    getToken.mockRejectedValue(new Error('invalid_grant'))
    const { settled, state } = await start()

    const result = await send(`/callback?state=${state}&code=abc`)

    expect(result).toEqual({
      status: 500,
      body: 'Authentication failed. See the terminal for details.',
    })
    expect(await settled).toEqual({
      ok: false,
      error: new Error('invalid_grant'),
    })
  })

  it('rejects when no access token is returned', async () => {
    getToken.mockResolvedValue({ tokens: {} })
    const { settled, state } = await start()

    const result = await send(`/callback?state=${state}&code=abc`)
    expect(result.status).toBe(500)
    expect(await settled).toEqual({
      ok: false,
      error: new Error('❌ Failed to obtain an access token'),
    })
  })

  it('rejects with the escaped error for an error callback with the issued state', async () => {
    const { settled, state } = await start()

    const result = await send(`/callback?state=${state}&error=%3Cb%3E`)

    expect(result).toEqual({
      status: 200,
      body: 'Authentication error: &lt;b&gt;',
    })
    expect(await settled).toEqual({
      ok: false,
      error: new Error('❌ Authentication error: <b>'),
    })
  })

  it('answers 400 to a callback with neither code nor error and keeps waiting', async () => {
    const { settled, state } = await start()

    expect(await send(`/callback?state=${state}`)).toEqual({
      status: 400,
      body: 'Invalid callback',
    })

    await send(`/callback?state=${state}&code=abc`)
    await settled
  })

  it('listens on the configured bind host and port 3000', async () => {
    const listenSpy = jest.spyOn(http.Server.prototype, 'listen')
    const { settled, state } = await start()

    expect(listenSpy.mock.calls[0].slice(0, 2)).toEqual([3000, '127.0.0.1'])

    await send(`/callback?state=${state}&code=abc`)
    await settled
  })
})
