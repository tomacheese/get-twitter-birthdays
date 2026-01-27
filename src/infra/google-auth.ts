import { google } from 'googleapis'
import type { Auth } from 'googleapis'
import http from 'node:http'
import type { GoogleCredentials, GoogleTokens } from '../shared/types'
import {
  loadGoogleCredentials,
  loadGoogleTokens,
  saveGoogleTokens,
} from './storage'
import { withGoogleRetry } from '../shared/google-retry'

type OAuth2Client = Auth.OAuth2Client

const SCOPES = ['https://www.googleapis.com/auth/calendar']
const REDIRECT_URI = 'http://localhost:3000/callback'
const AUTH_TIMEOUT_MS = 5 * 60 * 1000 // 5 分

/**
 * HTML エスケープを行う。
 *
 * @param text エスケープする文字列
 * @returns エスケープされた文字列
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;')
}

/**
 * Google OAuth 2.0 クライアントを作成する。
 *
 * @param credentials Google 認証情報
 * @returns OAuth2Client
 */
function createOAuth2Client(credentials: GoogleCredentials): OAuth2Client {
  // eslint-disable-next-line camelcase
  const { client_id, client_secret } = credentials.installed
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI)
}

/**
 * ループバック認証を実行し、トークンを取得する。
 *
 * @param oauth2Client OAuth2Client インスタンス
 * @returns 取得したトークン
 */
async function performLoopbackAuth(
  oauth2Client: OAuth2Client
): Promise<GoogleTokens> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null

    // 認証 URL を生成
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // refresh_token を確実に取得するため
    })

    console.log('🔐 以下の URL にアクセスして認証してください:')
    console.log(authUrl)
    console.log()

    // クリーンアップ関数
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    // ループバックサーバーを起動
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const server = http.createServer(async (request, response) => {
      if (!request.url) {
        response.end('Invalid request')
        return
      }

      const requestUrl = new URL(
        request.url,
        `http://${request.headers.host ?? 'localhost'}`
      )
      const queryData = Object.fromEntries(requestUrl.searchParams)

      // 認証コールバックを処理
      if (queryData.code) {
        response.end('認証が完了しました。このウィンドウを閉じてください。')
        cleanup()
        server.close()

        try {
          // 認証コードをトークンに交換
          const { tokens } = await oauth2Client.getToken(queryData.code)
          if (!tokens.access_token) {
            reject(new Error('❌ アクセストークンの取得に失敗しました'))
            return
          }

          resolve(tokens as GoogleTokens)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      } else if (queryData.error) {
        response.end(`認証エラー: ${escapeHtml(queryData.error)}`)
        cleanup()
        server.close()
        reject(new Error(`❌ 認証エラー: ${queryData.error}`))
      } else {
        response.end('Invalid callback')
      }
    })

    // 0.0.0.0 でリッスン（Docker でポートマッピング可能）
    server.listen(3000, '0.0.0.0', () => {
      console.log('✅ ループバックサーバーが 0.0.0.0:3000 で起動しました')
      console.log(`⏱️ 認証タイムアウト: ${AUTH_TIMEOUT_MS / 1000 / 60} 分`)
    })

    server.on('error', (error) => {
      cleanup()
      server.close()
      reject(error)
    })

    // タイムアウト設定
    timeoutId = setTimeout(() => {
      cleanup()
      server.close()
      reject(
        new Error(
          `❌ 認証タイムアウト: ${AUTH_TIMEOUT_MS / 1000 / 60} 分以内に認証を完了してください`
        )
      )
    }, AUTH_TIMEOUT_MS)
  })
}

/**
 * Google OAuth 2.0 認証を実行する。
 * トークンキャッシュがあれば使用し、なければループバック認証を実行する。
 *
 * @returns 認証済みの OAuth2Client
 */
export async function authenticateGoogle(): Promise<OAuth2Client> {
  const credentials = loadGoogleCredentials()
  if (!credentials) {
    throw new Error(
      `❌ Google 認証情報ファイルが見つかりません。Google Cloud Console で OAuth 2.0 クライアント ID を作成し、認証情報を保存してください。`
    )
  }

  const oauth2Client = createOAuth2Client(credentials)

  // トークンキャッシュを確認
  const cachedTokens = loadGoogleTokens()
  if (cachedTokens) {
    oauth2Client.setCredentials(cachedTokens)

    // トークンの有効性を確認
    try {
      await withGoogleRetry(async () => {
        await oauth2Client.getAccessToken()
      })
      console.log('✅ キャッシュされた Google トークンを使用します')
      return oauth2Client
    } catch {
      console.warn('⚠️ キャッシュされたトークンが無効です。再認証します...')
    }
  }

  // ループバック認証を実行
  const tokens = await performLoopbackAuth(oauth2Client)
  oauth2Client.setCredentials(tokens)

  // トークンを保存
  saveGoogleTokens(tokens)
  console.log('✅ Google トークンをキャッシュしました')

  return oauth2Client
}

/**
 * カレンダー一覧を取得し、ユーザーに選択させる。
 *
 * @param oauth2Client 認証済みの OAuth2Client
 * @returns 選択されたカレンダー ID
 */
async function selectCalendar(oauth2Client: OAuth2Client): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  console.log()
  console.log('📅 カレンダー一覧を取得しています...')

  const response = await withGoogleRetry(async () => {
    return await calendar.calendarList.list()
  })

  const calendars = response.data.items ?? []
  if (calendars.length === 0) {
    throw new Error('❌ カレンダーが見つかりませんでした')
  }

  console.log()
  console.log('📋 利用可能なカレンダー:')
  for (const [index, cal] of calendars.entries()) {
    const isPrimary = cal.primary ? ' (プライマリ)' : ''
    console.log(`  ${index + 1}. ${cal.summary ?? 'Untitled'}${isPrimary}`)
  }

  console.log()

  // プライマリカレンダーを探す
  const primaryCalendar = calendars.find((cal) => cal.primary)
  const defaultIndex = primaryCalendar ? calendars.indexOf(primaryCalendar) : 0

  // ユーザー入力を待つ
  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question(
      `カレンダーを選択してください (1-${calendars.length}, デフォルト: ${defaultIndex + 1}): `
    )
    const selectedIndex =
      answer.trim() === '' ? defaultIndex : Number(answer) - 1

    if (
      Number.isNaN(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= calendars.length
    ) {
      throw new Error('❌ 無効な選択です')
    }

    const selectedCalendar = calendars[selectedIndex]
    if (!selectedCalendar.id) {
      throw new Error('❌ カレンダー ID が取得できませんでした')
    }

    console.log()
    console.log(
      `✅ 選択されたカレンダー: ${selectedCalendar.summary ?? 'Untitled'}`
    )
    console.log(`   カレンダー ID: ${selectedCalendar.id}`)

    return selectedCalendar.id
  } finally {
    rl.close()
  }
}

/**
 * 認証専用のエントリポイント。
 * トークンキャッシュがあれば使用し、なければループバック認証を実行する。
 * 認証後、カレンダーを選択して環境変数として設定する方法を表示する。
 */
export async function runGoogleAuth(): Promise<void> {
  console.log('🔐 Google OAuth 2.0 認証を開始します...')
  console.log()

  try {
    const oauth2Client = await authenticateGoogle()
    console.log()
    console.log('✅ 認証が完了しました！')

    // カレンダーを選択
    const calendarId = await selectCalendar(oauth2Client)

    console.log()
    console.log(
      '💡 カレンダーを使用するには、以下の環境変数を設定してください:'
    )
    console.log()
    console.log(`  export GOOGLE_CALENDAR_ID="${calendarId}"`)
    console.log()
    console.log('または、`.env` ファイルに以下を追加してください:')
    console.log()
    console.log(`  GOOGLE_CALENDAR_ID="${calendarId}"`)
    console.log()
  } catch (error) {
    console.error('❌ 認証に失敗しました:', error)
    throw error
  }
}
