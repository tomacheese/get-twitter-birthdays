import { runGoogleAuth } from './infra/google-auth'

/**
 * Google OAuth 2.0 認証専用のエントリポイント。
 */
async function main(): Promise<number> {
  try {
    await runGoogleAuth()
    return 0
  } catch (err) {
    console.error('❌ 認証処理中にエラーが発生しました:', err)
    return 1
  }
}

// eslint-disable-next-line no-void
void main().then(
  (exitCode) => {
    process.exitCode = exitCode
  },
  (err: unknown) => {
    console.error('Fatal error occurred', err)
    process.exitCode = 1
  }
)
