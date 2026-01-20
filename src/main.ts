import { TwitterOpenApi } from 'twitter-openapi-typescript'
import { OUTPUT_PATH, PROGRESS_PATH } from './shared/config'
import { getAuthCookies, resolveCredentials } from './infra/auth'
import { cleanupCycleTLS, cycleTLSFetchWithProxy } from './infra/cycletls'
import { loadConfig, saveOutput } from './infra/storage'
import { fetchFollowingUsers } from './core/following'
import { withRetry } from './shared/retry'

/**
 * CLIのエントリポイント。
 * @returns 終了コード
 */
async function main(): Promise<number> {
  let exitCode = 0
  try {
    const config = loadConfig()
    const credentials = resolveCredentials(config)

    process.env.TWITTER_USERNAME ??= credentials.username

    const { authToken, ct0 } = await getAuthCookies(credentials)

    const api = new TwitterOpenApi()
    TwitterOpenApi.fetchApi = cycleTLSFetchWithProxy
    const client = await api.getClientFromCookies({
      auth_token: authToken,
      ct0,
    })
    const userResponse = await withRetry(
      () =>
        client.getUserApi().getUserByScreenName({
          screenName: credentials.username,
        }),
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        operationName: 'Fetch current user',
      }
    )

    const currentUser = userResponse.data.user
    const currentUserId = currentUser?.restId ?? currentUser?.id
    if (!currentUserId) {
      throw new Error('Failed to resolve current user id')
    }

    const output = await fetchFollowingUsers(
      client,
      currentUserId,
      credentials.username,
      OUTPUT_PATH,
      PROGRESS_PATH
    )
    saveOutput(OUTPUT_PATH, output)

    console.log(
      `Found ${output.totalWithBirthdate} birthdays out of ${output.totalFollowing} followed users.`
    )
    console.log(`Saved to ${OUTPUT_PATH}`)
  } catch (error) {
    console.error('Fatal error occurred', error)
    exitCode = 1
  } finally {
    await cleanupCycleTLS()
  }

  return exitCode
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode
  },
  (error: unknown) => {
    console.error('Fatal error occurred', error)
    process.exitCode = 1
  }
)
