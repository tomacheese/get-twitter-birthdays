import type {
  BirthdateInfo,
  BirthdayEntry,
  BirthdaysOutput,
  ResumeUserEntry,
} from '../shared/types'

/**
 * Formats a birthdate as `YYYY-MM-DD`, or `MM-DD` when the year is unknown.
 * @param birthdate Birthdate info
 * @returns Formatted text
 */
export function formatBirthdate(birthdate: BirthdateInfo): string {
  const month = String(birthdate.month).padStart(2, '0')
  const day = String(birthdate.day).padStart(2, '0')
  return birthdate.year
    ? `${birthdate.year}-${month}-${day}`
    : `${month}-${day}`
}

/**
 * Builds the output JSON from the collected users.
 * Users without a birthdate are omitted from `birthdays`, which is sorted by month, day, then screen name.
 * @param usersById Collected users keyed by user ID
 * @param sourceUser Screen name of the account whose following list was fetched
 * @returns Output JSON
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
    return a.birthdate.day === b.birthdate.day
      ? a.screenName.localeCompare(b.screenName)
      : a.birthdate.day - b.birthdate.day
  })

  return {
    generatedAt: new Date().toISOString(),
    sourceUser,
    totalFollowing: usersById.size,
    totalWithBirthdate: birthdays.length,
    birthdays,
  }
}
