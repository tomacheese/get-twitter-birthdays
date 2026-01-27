/** 設定ファイルの構造を表す。 */
export interface Config {
  twitter?: {
    username?: string
    password?: string
    emailAddress?: string
  }
}

/** 認証に必要な資格情報を表す。 */
export interface Credentials {
  username: string
  password: string
  emailAddress?: string
  twoFactorSecret?: string
}

/** ローカルに保存するCookieキャッシュの形式を表す。 */
export interface CachedCookies {
  auth_token: string
  ct0: string
  savedAt: number
}

/** 誕生日情報の構造を表す。 */
export interface BirthdateInfo {
  day: number
  month: number
  year?: number
  visibility: string
  yearVisibility: string
}

/** 誕生日一覧の1件分の出力構造を表す。 */
export interface BirthdayEntry {
  id: string
  screenName: string
  name: string
  birthdate: BirthdateInfo
  birthdateText: string
  profileUrl: string
}

/** 出力JSON全体の構造を表す。 */
export interface BirthdaysOutput {
  generatedAt: string
  sourceUser: string
  totalFollowing: number
  totalWithBirthdate: number
  birthdays: BirthdayEntry[]
}

/** 進捗ファイルに保存するユーザー情報を表す。 */
export interface ResumeUserEntry {
  id: string
  screenName: string
  name: string
  birthdate?: BirthdateInfo
}

/** 進捗保存の状態構造を表す。 */
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

/** APIレスポンス由来の誕生日情報を表す。 */
export interface ApiBirthdate {
  day: number
  month: number
  year?: number
  visibility: string
  yearVisibility: string
}

/** APIレスポンス由来のユーザー情報を表す。 */
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
 * Headers互換の最小インターフェースを表す。
 * undici の _Headers クラスや標準の Headers クラスに対応。
 */
export interface HeadersLike {
  entries?: () => IterableIterator<[string, string]>
  [Symbol.iterator]?: () => Iterator<[string, string]>
}

/** Google OAuth 2.0 認証情報の構造を表す。 */
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

/** Google OAuth 2.0 トークンの構造を表す。 */
export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  scope: string
  token_type: string
  expiry_date?: number
}

/** カレンダーイベント記録の1件分の構造を表す。 */
export interface CalendarEventRecord {
  eventId: string
  userId: string
  name: string
  screenName: string
  birthdate: BirthdateInfo
  profileUrl: string
  updatedAt: string
}

/** カレンダーイベント記録全体の構造を表す（Record型）。 */
export type CalendarEventsStorage = Record<string, CalendarEventRecord>;
