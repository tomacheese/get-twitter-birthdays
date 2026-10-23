const ENV_NAME = 'SYNC_CALENDAR_RECONCILE_MAX_DELETIONS'

/**
 * 環境変数を設定して config.ts を読み込み直し、削除上限を取得する。
 * @param value 設定する環境変数の値 (undefined の場合は未設定)
 * @returns 解決された削除上限
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
    ['未設定', undefined, 10],
    ['空文字', '', 10],
    ['数値でない文字列', 'abc', 10],
    ['負数', '-1', 10],
    ['Infinity', 'Infinity', 10],
    ['0 (無制限)', '0', 0],
    ['正の整数', '5', 5],
  ])('%s のとき既定値または指定値に解決される', (_, value, expected) => {
    expect(loadMaxDeletions(value)).toBe(expected)
  })
})
