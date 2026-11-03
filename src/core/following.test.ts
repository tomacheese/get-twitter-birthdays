import type { ApiUser, ResumeState } from '../shared/types'
import { loadProgress, saveProgress } from '../infra/storage'
import { fetchFollowingUsers } from './following'
import type { TwitterClient } from './following'

jest.mock('../infra/storage', () => ({
  loadProgress: jest.fn(),
  saveProgress: jest.fn(),
  saveOutput: jest.fn(),
}))

const OUTPUT_PATH = 'output.json'
const PROGRESS_PATH = 'progress.json'
const ENV_NAMES = [
  'MAX_FOLLOWING_PAGES',
  'MAX_FOLLOWING_USERS',
  'MAX_EMPTY_PAGES',
  'MAX_DETAIL_USERS',
  'FORCE_FOLLOWING_REFRESH',
  'FORCE_DETAIL_REFRESH',
]

interface PageSpec {
  users: string[]
  nextCursor?: string
}

/**
 * Creates an API user for tests.
 * @param id User ID
 * @param withBirthdate Whether the user has a birthdate
 * @returns API user
 */
function makeUser(id: string, withBirthdate: boolean): ApiUser {
  return {
    restId: id,
    legacy: { screenName: `user${id}`, name: `User ${id}` },
    legacyExtendedProfile: withBirthdate
      ? {
          birthdate: {
            day: 1,
            month: 1,
            visibility: 'Public',
            yearVisibility: 'Self',
          },
        }
      : undefined,
  }
}

/**
 * Creates a mock Twitter client from page specs.
 * After the specs are exhausted, it keeps returning empty pages that still carry a cursor.
 * @param pages Page specs
 * @param withBirthdate Whether users have a birthdate
 * @returns The client and the `getFollowing` mock
 */
function makeClient(pages: PageSpec[], withBirthdate = true) {
  let index = 0
  const getFollowing = jest.fn(() => {
    const spec = pages[index] ?? { users: [], nextCursor: `auto-${index}` }
    index += 1
    return Promise.resolve({
      data: {
        data: spec.users.map((id) => ({ user: makeUser(id, withBirthdate) })),
        cursor: {
          bottom: spec.nextCursor ? { value: spec.nextCursor } : undefined,
        },
      },
    })
  })
  const client = {
    getUserListApi: () => ({ getFollowing }),
    getUserApi: () => ({
      getUserByScreenName: () => Promise.resolve({ data: {} }),
    }),
  } as unknown as TwitterClient
  return { client, getFollowing }
}

/**
 * Creates a progress state for tests.
 * @param overrides Fields to override
 * @returns Progress state
 */
function makeProgress(overrides: Partial<ResumeState>): ResumeState {
  return {
    sourceUser: 'source',
    stage: 'details',
    seenCursors: [],
    page: 1,
    processedUsers: 0,
    users: [],
    missingBirthdateIds: [],
    ...overrides,
  }
}

/**
 * Runs `fetchFollowingUsers` against the mock client.
 * @param client Twitter client
 * @returns Fetch result
 */
function run(client: TwitterClient) {
  return fetchFollowingUsers(
    client,
    'self',
    'source',
    OUTPUT_PATH,
    PROGRESS_PATH
  )
}

describe('fetchFollowingUsers complete', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const name of ENV_NAMES) {
      originalEnv[name] = process.env[name]
      Reflect.deleteProperty(process.env, name)
    }
    jest.clearAllMocks()
    jest.mocked(loadProgress).mockReturnValue(null)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    for (const name of ENV_NAMES) {
      const value = originalEnv[name]
      if (value === undefined) {
        Reflect.deleteProperty(process.env, name)
      } else {
        process.env[name] = value
      }
    }
    jest.restoreAllMocks()
  })

  it('is complete when the last page returns no next cursor', async () => {
    const { client } = makeClient([
      { users: ['1', '2'], nextCursor: 'c1' },
      { users: ['3'] },
    ])

    const result = await run(client)

    expect(result.complete).toBe(true)
    expect(result.output.totalFollowing).toBe(3)
  })

  it('is incomplete when stopped by MAX_FOLLOWING_PAGES', async () => {
    process.env.MAX_FOLLOWING_PAGES = '1'
    const { client, getFollowing } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['2'] },
    ])

    const result = await run(client)

    expect(getFollowing).toHaveBeenCalledTimes(1)
    expect(result.complete).toBe(false)
    expect(result.output.totalFollowing).toBe(1)
  })

  it('is incomplete when stopped by MAX_FOLLOWING_USERS', async () => {
    process.env.MAX_FOLLOWING_USERS = '2'
    const { client } = makeClient([
      { users: ['1', '2'], nextCursor: 'c1' },
      { users: ['3'] },
    ])

    const result = await run(client)

    expect(result.complete).toBe(false)
    expect(result.output.totalFollowing).toBe(2)
  })

  it('is incomplete when the last page (no next cursor) also reaches MAX_FOLLOWING_USERS', async () => {
    process.env.MAX_FOLLOWING_USERS = '2'
    const { client } = makeClient([{ users: ['1', '2'] }])

    const result = await run(client)

    expect(result.complete).toBe(false)
  })

  it('is complete when it stops after consecutive pages that are empty in the API too', async () => {
    const { client, getFollowing } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
    ])

    const result = await run(client)

    expect(getFollowing).toHaveBeenCalledTimes(4)
    expect(result.complete).toBe(true)
  })

  it('is incomplete when it stops after consecutive pages that add nothing because they only contain seen users', async () => {
    const { client, getFollowing } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['1'], nextCursor: 'c2' },
      { users: ['1'], nextCursor: 'c3' },
      { users: ['1'], nextCursor: 'c4' },
    ])

    const result = await run(client)

    expect(getFollowing).toHaveBeenCalledTimes(4)
    expect(result.complete).toBe(false)
  })

  it('is incomplete when a page of seen users interrupts a streak of empty pages', async () => {
    process.env.MAX_EMPTY_PAGES = '2'
    const { client } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['1'], nextCursor: 'c2' },
      { users: [], nextCursor: 'c3' },
    ])

    const result = await run(client)

    expect(result.complete).toBe(false)
  })

  it('is incomplete when the cursor loops', async () => {
    const { client, getFollowing } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['2'], nextCursor: 'c1' },
    ])

    const result = await run(client)

    expect(getFollowing).toHaveBeenCalledTimes(2)
    expect(result.complete).toBe(false)
  })

  it('is incomplete when MAX_DETAIL_USERS truncates the detail fetch', async () => {
    process.env.MAX_DETAIL_USERS = '1'
    const { client } = makeClient([{ users: ['1', '2', '3'] }], false)

    const result = await run(client)

    expect(result.complete).toBe(false)
  })

  it('stays complete when MAX_DETAIL_USERS does not truncate', async () => {
    process.env.MAX_DETAIL_USERS = '5'
    const { client } = makeClient([{ users: ['1', '2', '3'] }], false)

    const result = await run(client)

    expect(result.complete).toBe(true)
  })

  it.each([
    ['true', true, true],
    ['false', false, false],
    ['undefined', undefined, false],
    ['not a boolean', 'yes' as unknown as boolean, false],
  ])(
    'carries over completeness when resuming at details with snapshotComplete %s',
    async (_, saved, expected) => {
      jest
        .mocked(loadProgress)
        .mockReturnValue(makeProgress({ snapshotComplete: saved }))
      const { client, getFollowing } = makeClient([])

      const result = await run(client)

      expect(getFollowing).not.toHaveBeenCalled()
      expect(result.complete).toBe(expected)
    }
  )

  it('ignores the saved completeness and judges by the new fetch with FORCE_FOLLOWING_REFRESH=1', async () => {
    process.env.FORCE_FOLLOWING_REFRESH = '1'
    process.env.MAX_FOLLOWING_PAGES = '1'
    jest.mocked(loadProgress).mockReturnValue(
      makeProgress({
        stage: 'done',
        snapshotComplete: true,
        users: [],
      })
    )
    const { client } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['2'] },
    ])

    const result = await run(client)

    expect(result.complete).toBe(false)
  })

  it('saves snapshotComplete in the progress file, true after a complete fetch', async () => {
    const { client } = makeClient([
      { users: ['1'], nextCursor: 'c1' },
      { users: ['2'] },
    ])

    await run(client)

    const saved = jest
      .mocked(saveProgress)
      .mock.calls.map(([, state]) => state.snapshotComplete)
    expect(saved[0]).toBe(false)
    expect(saved.at(-1)).toBe(true)
  })
})
