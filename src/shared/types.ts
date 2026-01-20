export interface Config {
  twitter?: {
    username?: string
    password?: string
    emailAddress?: string
  }
}

export interface Credentials {
  username: string
  password: string
  emailAddress?: string
  twoFactorSecret?: string
}

export interface CachedCookies {
  auth_token: string
  ct0: string
  savedAt: number
}

export interface BirthdateInfo {
  day: number
  month: number
  year?: number
  visibility: string
  yearVisibility: string
}

export interface BirthdayEntry {
  id: string
  screenName: string
  name: string
  birthdate: BirthdateInfo
  birthdateText: string
  profileUrl: string
}

export interface BirthdaysOutput {
  generatedAt: string
  sourceUser: string
  totalFollowing: number
  totalWithBirthdate: number
  birthdays: BirthdayEntry[]
}

export interface ResumeUserEntry {
  id: string
  screenName: string
  name: string
  birthdate?: BirthdateInfo
}

export interface ResumeState {
  sourceUser: string
  stage: 'following' | 'details' | 'done'
  cursor?: string
  seenCursors: string[]
  page: number
  processedUsers: number
  users: ResumeUserEntry[]
  missingBirthdateIds?: string[]
  detailBatchIndex?: number
}

export interface ApiBirthdate {
  day: number
  month: number
  year?: number
  visibility: string
  yearVisibility: string
}

export interface ApiUser {
  restId?: string
  id?: string
  legacy?: {
    screenName?: string
    name: string
  }
  legacyExtendedProfile?: {
    birthdate?: ApiBirthdate
  }
}

/**
 * Headers ライクなオブジェクトのインターフェース
 * undici の _Headers クラスや標準の Headers クラスに対応
 */
export interface HeadersLike {
  entries?: () => IterableIterator<[string, string]>
  [Symbol.iterator]?: () => Iterator<[string, string]>
}
