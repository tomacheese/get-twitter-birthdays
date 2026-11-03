const ENV_NAME = 'SYNC_CALENDAR_RECONCILE_MAX_DELETIONS'

/**
 * Sets the environment variable, reloads config.ts, and returns the resolved deletion limit.
 * @param value Value to set (unset when undefined)
 * @returns Resolved deletion limit
 */
function loadMaxDeletions(value: string | undefined): number {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, ENV_NAME)
  } else {
    process.env[ENV_NAME] = value
  }
  let result = -1
  jest.isolateModules(() => {
    const config = jest.requireActual<typeof import('./config')>('./config')
    result = config.SYNC_CALENDAR_RECONCILE_MAX_DELETIONS
  })
  return result
}

describe('SYNC_CALENDAR_RECONCILE_MAX_DELETIONS', () => {
  const original = process.env[ENV_NAME]

  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(process.env, ENV_NAME)
    } else {
      process.env[ENV_NAME] = original
    }
  })

  it.each([
    ['unset', undefined, 10],
    ['an empty string', '', 10],
    ['a non-numeric string', 'abc', 10],
    ['a negative number', '-1', 10],
    ['Infinity', 'Infinity', 10],
    ['0 (unlimited)', '0', 0],
    ['a positive integer', '5', 5],
  ])(
    'resolves to the default or the given value when %s',
    (_, value, expected) => {
      expect(loadMaxDeletions(value)).toBe(expected)
    }
  )
})
