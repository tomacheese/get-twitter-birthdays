import { runGoogleAuth } from './infra/google-auth'

/**
 * Entry point for `pnpm auth:google`: runs the Google OAuth 2.0 flow only.
 * @returns Process exit code
 */
async function main(): Promise<number> {
  try {
    await runGoogleAuth()
    return 0
  } catch (error) {
    console.error('❌ An error occurred during authentication:', error)
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
