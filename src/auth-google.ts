import { runGoogleAuth } from './infra/google-auth'

/**
 * Google OAuth 2.0 認証専用のエントリポイント。
 */
async function main(): Promise<number> {
  try {
    await runGoogleAuth()
    return 0
  } catch (error) {
    console.error('❌ 認証処理中にエラーが発生しました:', error)
    return 1
  }
}

// eslint-disable-next-line no-void
void main().then(
  (exitCode) => {
    process.exitCode = exitCode
  },
  (error: unknown) => {
    console.error('Fatal error occurred', error)
    process.exitCode = 1
  }
)
