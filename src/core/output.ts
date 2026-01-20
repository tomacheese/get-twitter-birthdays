import type {
  BirthdateInfo,
  BirthdayEntry,
  BirthdaysOutput,
  ResumeUserEntry,
} from '../shared/types'

/**
 * 誕生日情報を表示用の文字列に整形する。
 * @param birthdate 誕生日情報
 * @returns 表示用文字列
 */
export function formatBirthdate(birthdate: BirthdateInfo): string {
  const month = String(birthdate.month).padStart(2, '0')
  const day = String(birthdate.day).padStart(2, '0')
  if (birthdate.year) {
    return `${birthdate.year}-${month}-${day}`
  }
  return `${month}-${day}`
}

/**
 * 取得済みユーザーから出力JSONを構築する。
 * @param usersById ユーザー情報のMap
 * @param sourceUser 取得元のユーザー名
 * @returns 出力JSON
 */
export function buildOutput(
  usersById: Map<string, ResumeUserEntry>,
  sourceUser: string
): BirthdaysOutput {
  const birthdays: BirthdayEntry[] = []
  for (const user of usersById.values()) {
    if (!user.birthdate) {
      continue
    }
    birthdays.push({
      id: user.id,
      screenName: user.screenName,
      name: user.name,
      birthdate: user.birthdate,
      birthdateText: formatBirthdate(user.birthdate),
      profileUrl: `https://twitter.com/${user.screenName}`,
    })
  }

  birthdays.sort((a, b) => {
    if (a.birthdate.month !== b.birthdate.month) {
      return a.birthdate.month - b.birthdate.month
    }
    if (a.birthdate.day !== b.birthdate.day) {
      return a.birthdate.day - b.birthdate.day
    }
    return a.screenName.localeCompare(b.screenName)
  })

  return {
    generatedAt: new Date().toISOString(),
    sourceUser,
    totalFollowing: usersById.size,
    totalWithBirthdate: birthdays.length,
    birthdays,
  }
}
