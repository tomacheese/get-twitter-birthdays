/** Shape of the config file. */
export interface Config {
  twitter?: {
    username?: string
    password?: string
    emailAddress?: string
  }
}

/** Credentials required to log in. */
export interface Credentials {
  username: string
  password: string
  emailAddress?: string
  twoFactorSecret?: string
}

/** Shape of the locally cached cookies. */
export interface CachedCookies {
  auth_token: string
  ct0: string
  savedAt: number
}

/** Birthdate info. */
export interface BirthdateInfo {
  day: number
  month: number
  year?: number
  visibility: string
  yearVisibility: string
}

/** One entry of the birthdays output. */
export interface BirthdayEntry {
  id: string
  screenName: string
  name: string
  birthdate: BirthdateInfo
  birthdateText: string
  profileUrl: string
}

/** Shape of the whole output JSON. */
export interface BirthdaysOutput {
  generatedAt: string
  sourceUser: string
  totalFollowing: number
  totalWithBirthdate: number
  birthdays: BirthdayEntry[]
}

/** Result of fetching the following list. */
export interface FollowingFetchResult {
  output: BirthdaysOutput
  /** True if the following list was enumerated to its end and the detail fetch was not truncated */
  complete: boolean
}

/** User info stored in the progress file. */
export interface ResumeUserEntry {
  id: string
  screenName: string
  name: string
  birthdate?: BirthdateInfo
}

/** State stored in the progress file. */
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
  /** Whether the result is proven to be a complete snapshot */
  snapshotComplete?: boolean
}

/** Birthdate info as returned by the API. */
export interface ApiBirthdate {
  day: number
  month: number
  year?: number
  visibility: string
  yearVisibility: string
}

/** User info as returned by the API. */
export interface ApiUser {
  restId?: string
  id?: string
  legacy?: {
    screenName?: string
    name?: string
  }
  legacyExtendedProfile?: {
    birthdate?: ApiBirthdate
  }
}

/**
 * Minimal Headers-compatible interface.
 * Covers undici's `_Headers` and the standard `Headers`.
 */
export interface HeadersLike {
  entries?: () => IterableIterator<[string, string]>
  [Symbol.iterator]?: () => Iterator<[string, string]>
}

/** Shape of the Google OAuth 2.0 credentials file. */
export interface GoogleCredentials {
  installed: {
    client_id: string
    project_id: string
    auth_uri: string
    token_uri: string
    auth_provider_x509_cert_url: string
    client_secret: string
    redirect_uris: string[]
  }
}

/** Shape of the Google OAuth 2.0 tokens. */
export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  scope: string
  token_type: string
  expiry_date?: number
}

/** One calendar event record. */
export interface CalendarEventRecord {
  eventId: string
  userId: string
  name: string
  screenName: string
  birthdate: BirthdateInfo
  profileUrl: string
  updatedAt: string
}

/** All calendar event records, keyed by Twitter user ID. */
export type CalendarEventsStorage = Record<string, CalendarEventRecord>
