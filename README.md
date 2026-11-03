# get-twitter-birthdays

A CLI tool that fetches the birthdays of the Twitter/X users you follow and saves them to `data/birthdays.json`. Optionally, it syncs them to Google Calendar as yearly recurring events.

- Uses `twitter-openapi-typescript`, `@the-convocation/twitter-scraper` and `cycletls`
- Caches login cookies to reduce how often it logs in
- Resumes an interrupted run from a progress file

## Usage

### 1. Install dependencies

```bash
pnpm install
```

### 2. Provide credentials

Create `data/config.json` (edit it if it already exists).

```json
{
  "twitter": {
    "username": "YOUR_SCREEN_NAME",
    "password": "YOUR_PASSWORD",
    "emailAddress": "YOUR_EMAIL_ADDRESS"
  }
}
```

Environment variables take precedence over the file (see [Environment variables](#environment-variables)).

### 3. Run

```bash
pnpm start
```

On success, the result is written to `data/birthdays.json`.

## Run with Docker

### Build

```bash
docker build -t get-twitter-birthdays .
```

### Run

Mount `data` as a volume to persist `config.json`, the output, the progress file and the cookie cache.

```bash
docker run --rm \
  -v "${PWD}/data:/data" \
  -e TWITTER_USERNAME=YOUR_SCREEN_NAME \
  -e TWITTER_PASSWORD=YOUR_PASSWORD \
  -e TWITTER_EMAIL_ADDRESS=YOUR_EMAIL_ADDRESS \
  get-twitter-birthdays
```

If `config.json` exists on the host in `data`, it is loaded automatically. The image sets `CONFIG_PATH`, `BIRTHDAYS_OUTPUT_PATH`, `BIRTHDAYS_PROGRESS_PATH`, `COOKIE_CACHE_PATH` and `RESPONSES_DIR` to paths under `/data`.

A `compose.yaml` is also provided. It reads `TWITTER_USERNAME`, `TWITTER_PASSWORD` and `TWITTER_EMAIL_ADDRESS` from the environment or an `.env` file.

## Output format

`data/birthdays.json` has the following format.

```json
{
  "generatedAt": "2026-01-20T20:19:29.471Z",
  "sourceUser": "example_user",
  "totalFollowing": 50,
  "totalWithBirthdate": 3,
  "birthdays": [
    {
      "id": "123456789",
      "screenName": "example_handle",
      "name": "Example User",
      "birthdate": {
        "day": 10,
        "month": 3,
        "visibility": "MutualFollow",
        "yearVisibility": "Self"
      },
      "birthdateText": "03-10",
      "profileUrl": "https://twitter.com/example_handle"
    }
  ]
}
```

`birthdate.year` is present only when the year is visible, and `birthdateText` is then `YYYY-MM-DD` instead of `MM-DD`. Entries are sorted by month, day, then screen name.

## Google Calendar integration (optional)

Registers the fetched birthdays in Google Calendar as yearly recurring events.

### Setup

#### 1. Create an OAuth 2.0 client ID in the Google Cloud Console

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Google Calendar API
3. Create an OAuth 2.0 client ID (desktop app)
4. Set `http://localhost:3000/callback` as a redirect URI
5. Save the credentials to `data/google-credentials.json`

#### 2. Run the OAuth 2.0 flow

```bash
pnpm auth:google
```

Open the printed URL in a browser and complete the authentication. The tokens are cached in `data/google-tokens.json`. After authentication, you are asked to pick a calendar, and the matching `GOOGLE_CALENDAR_ID` setting is printed.

#### 3. Run

```bash
pnpm start
```

If `data/google-credentials.json` exists, the sync to Google Calendar runs automatically after the birthdays are fetched.

### With Docker

The Docker image only moves the Twitter-related paths to `/data`, so point the Google-related paths there too. Port 3000 must be published during authentication.

```bash
# Authenticate
docker run -it --rm --entrypoint pnpm -p 3000:3000 -v "${PWD}/data:/data" \
  -e GOOGLE_CREDENTIALS_PATH=/data/google-credentials.json \
  -e GOOGLE_TOKEN_CACHE_PATH=/data/google-tokens.json \
  get-twitter-birthdays auth:google

# Run (syncs the calendar automatically)
docker run --rm -v "${PWD}/data:/data" \
  -e GOOGLE_CREDENTIALS_PATH=/data/google-credentials.json \
  -e GOOGLE_TOKEN_CACHE_PATH=/data/google-tokens.json \
  -e CALENDAR_EVENTS_PATH=/data/calendar-events.json \
  get-twitter-birthdays
```

### Event format

- **Title**: `<name>(@<screenName>)の誕生日` (for example, `田中太郎(@taro)の誕生日`). The title is intentionally Japanese and is not configurable.
- **All-day event**: that day only
- **Yearly recurrence**: `RRULE:FREQ=YEARLY`
- **Description**: the Twitter profile URL
- **Unknown birth year**: the year 2000 is used as the start date (a leap year, so Feb 29 is valid)

### Change detection and updates

Changes to the name, screen name, birthdate or profile URL are detected and the event is updated. Events are tracked in `data/calendar-events.json`, so duplicates are not created.

## Environment variables

### Required

- `TWITTER_USERNAME`
- `TWITTER_PASSWORD`

Either can instead be set in `data/config.json`.

### Optional

- `TWITTER_EMAIL_ADDRESS`
- `TWITTER_AUTH_CODE_SECRET`: two-factor authentication secret
- `COOKIE_CACHE_PATH` (default: `./data/twitter-cookies.json`)
- `PROXY_SERVER` / `PROXY_USERNAME` / `PROXY_PASSWORD`
- `CONFIG_PATH` (default: `./data/config.json`)
- `BIRTHDAYS_OUTPUT_PATH` (default: `./data/birthdays.json`)
- `BIRTHDAYS_PROGRESS_PATH` (default: `./data/birthdays-progress.json`)
- `RESPONSES_DIR` (default: `./data/responses`)
- `RESPONSES_LOG_ENABLED=1`: save API responses (only when set)

### Google Calendar

- `GOOGLE_CREDENTIALS_PATH` (default: `./data/google-credentials.json`)
- `GOOGLE_TOKEN_CACHE_PATH` (default: `./data/google-tokens.json`)
- `CALENDAR_EVENTS_PATH` (default: `./data/calendar-events.json`)
- `GOOGLE_CALENDAR_ID` (default: `primary`)
- `SYNC_CALENDAR_STRICT=1`: exit with code 1 when the sync fails
- `SYNC_CALENDAR_RECONCILE=1`: also delete the events of users who are no longer in the birthdays
  - No events are deleted if the following list was not fetched completely (for example, it was cut off by `MAX_FOLLOWING_PAGES`, `MAX_FOLLOWING_USERS` or `MAX_DETAIL_USERS`), if no birthdays were fetched, or if the number of deletion candidates exceeds the limit below.
- `SYNC_CALENDAR_RECONCILE_MAX_DELETIONS` (default: `10`): maximum number of deletions allowed in one reconcile run. If the candidates exceed it, nothing is deleted. `0` means unlimited.

### Fetch tuning

- `MAX_FOLLOWING_PAGES`: maximum number of following-list pages
- `MAX_FOLLOWING_USERS`: maximum number of following users
- `MAX_EMPTY_PAGES`: stop after this many consecutive pages that add no new users (default: 3)
- `MAX_DETAIL_USERS`: maximum number of users whose details are fetched
- `FORCE_DETAIL_REFRESH=1`: redo the detail fetch even if a progress file exists
- `FORCE_FOLLOWING_REFRESH=1`: ignore the progress file and restart from the following list
- `PER_USER_BIRTHDATE_LOOKUP=1`: look up each user's birthdate again through the single-user API after the detail fetch
- `MAX_BIRTHDATE_LOOKUP`: maximum number of such lookups (0 = unlimited)

## How it works

1. Log in with `twitter-scraper` and obtain cookies (cached for 7 days)
2. Fetch the following list with `twitter-openapi-typescript`
3. Extract `legacyExtendedProfile.birthdate` from each user
4. Fetch the details of users without a birthdate and, if enabled, query the single-user API again
5. Save progress to `data/birthdays-progress.json`, so an interrupted run can resume

## Notes

- A birthdate may not be returned by the API when its **visibility is restricted** (for example, to mutual follows or followers).
- On a rate limit (429), the tool waits based on the `x-rate-limit-reset` header.
- Setting `RESPONSES_LOG_ENABLED=1` saves API responses, which may contain personal information. Handle them with care.

## Development

```bash
pnpm dev     # run src/main.ts with tsx watch
pnpm test    # run the Jest tests
```

Lint and format:

```bash
pnpm lint    # prettier --check, eslint and tsc
pnpm fix     # prettier --write and eslint --fix
```

See [AGENTS.md](AGENTS.md) for contribution rules.

## License

MIT
