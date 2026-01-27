import { runGoogleAuth } from './infra/google-auth'

/**
 * Google OAuth 2.0 認証専用のエントリポイント。
 */
async function main(): Promise<void> {
  try {
    await runGoogleAuth()
    process.exit(0)
  } catch (error) {
    console.error('❌ 認証処理中にエラーが発生しました:', error)
    process.exit(1)
  }
}

main()
