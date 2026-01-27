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
        response.end(`認証エラー: ${queryData.error}`)
        cleanup()
        server.close()
        reject(
          new Error(`❌ 認証エラー: ${String(queryData.error as unknown)}`)
        )
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
      reject(error)
    })

    // タイムアウト設定
    timeoutId = setTimeout(() => {
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
 * 認証専用のエントリポイント。
 * トークンキャッシュがあれば使用し、なければループバック認証を実行する。
 */
export async function runGoogleAuth(): Promise<void> {
  console.log('🔐 Google OAuth 2.0 認証を開始します...')
  console.log()

  try {
    await authenticateGoogle()
    console.log()
    console.log('✅ 認証が完了しました！')
  } catch (error) {
    console.error('❌ 認証に失敗しました:', error)
    throw error
  }
}
