# get-twitter-birthdays

Twitter/X でフォローしているユーザーの誕生日を取得し、`data/birthdays.json` に保存するツールです。

- `twitter-openapi-typescript` + `@the-convocation/twitter-scraper` + `cycletls` を使用
- Cookie をキャッシュしてログイン頻度を削減
- 進捗ファイルでリジューム対応

## 使い方

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 認証情報を用意

`data/config.json` を作成します（既にある場合は編集）。

```json
{
  "twitter": {
    "username": "YOUR_SCREEN_NAME",
    "password": "YOUR_PASSWORD",
    "emailAddress": "YOUR_EMAIL_ADDRESS"
  }
}
```

環境変数で上書き可能です（詳細は後述）。

### 3. 実行

```bash
pnpm start
```

成功すると `data/birthdays.json` に結果が出力されます。

## Docker で実行

### ビルド

```bash
docker build -t get-twitter-birthdays .
```

### 実行

`data` をボリュームとしてマウントして、`config.json` や出力を永続化します。

```bash
docker run --rm \\
  -v \"${PWD}/data:/data\" \\
  -e TWITTER_USERNAME=YOUR_SCREEN_NAME \\
  -e TWITTER_PASSWORD=YOUR_PASSWORD \\
  -e TWITTER_EMAIL_ADDRESS=YOUR_EMAIL_ADDRESS \\
  get-twitter-birthdays
```

`data/config.json` を使う場合は、ホスト側に作成しておけば自動で読み込まれます。

## 出力形式

`data/birthdays.json` は以下の形式です。

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

## Google Calendar 統合（オプション）

取得した誕生日情報を Google Calendar に年次繰り返しイベントとして自動登録できます。

### セットアップ手順

#### 1. Google Cloud Console で OAuth 2.0 クライアント ID を作成

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Google Calendar API を有効化
3. OAuth 2.0 クライアント ID を作成（デスクトップアプリ）
4. リダイレクト URI に `http://localhost:3000/callback` を設定
5. 認証情報を `data/google-credentials.json` に保存

#### 2. Google OAuth 2.0 認証を実行

```bash
pnpm auth:google
```

ブラウザで認証 URL にアクセスし、認証を完了してください。トークンは `data/google-tokens.json` にキャッシュされます。

#### 3. 実行

```bash
pnpm start
```

`data/google-credentials.json` が存在する場合、自動的に Google Calendar への同期が実行されます。

### Docker で使用する場合

認証時にポートマッピングが必要です。

```bash
# 認証
docker run -it --rm -p 3000:3000 -v "${PWD}/data:/data" get-twitter-birthdays pnpm auth:google

# 実行（自動でカレンダー同期）
docker run --rm -v "${PWD}/data:/data" get-twitter-birthdays
```

### イベント形式

- **タイトル**: `名前(@screenname)の誕生日`（例: "田中太郎(@taro)の誕生日"）
- **終日イベント**: 当日のみ
- **年次繰り返し**: `RRULE:FREQ=YEARLY`
- **説明**: Twitter プロフィール URL
- **年不明の誕生日**: 現在年を使用

### 変更検出と更新

名前、スクリーンネーム、誕生日、URL の変更を自動検出してイベントを更新します。重複作成はされません。

## 環境変数

### 必須

- `TWITTER_USERNAME`
- `TWITTER_PASSWORD`

### 任意

- `TWITTER_EMAIL_ADDRESS`
- `TWITTER_AUTH_CODE_SECRET`
- `COOKIE_CACHE_PATH` (既定: `./data/twitter-cookies.json`)
- `PROXY_SERVER` / `PROXY_USERNAME` / `PROXY_PASSWORD`
- `CONFIG_PATH` (既定: `./data/config.json`)
- `BIRTHDAYS_OUTPUT_PATH` (既定: `./data/birthdays.json`)
- `BIRTHDAYS_PROGRESS_PATH` (既定: `./data/birthdays-progress.json`)
- `RESPONSES_DIR` (既定: `./data/responses`)
- `RESPONSES_LOG_ENABLED=1` (設定した場合のみレスポンスログを保存)

### Google Calendar 関連

- `GOOGLE_CREDENTIALS_PATH` (既定: `./data/google-credentials.json`)
- `GOOGLE_TOKEN_CACHE_PATH` (既定: `./data/google-tokens.json`)
- `CALENDAR_EVENTS_PATH` (既定: `./data/calendar-events.json`)
- `GOOGLE_CALENDAR_ID` (既定: `primary`)
- `SYNC_CALENDAR_STRICT=1` (同期失敗時に終了コード 1)
- `SYNC_CALENDAR_RECONCILE=1` (削除されたユーザーのイベントも削除)

### 取得を調整するオプション

- `MAX_FOLLOWING_PAGES` : フォロー一覧の最大ページ数
- `MAX_FOLLOWING_USERS` : フォロー一覧の最大ユーザー数
- `MAX_EMPTY_PAGES` : 連続で追加ゼロのページが続いたら停止 (既定 3)
- `MAX_DETAIL_USERS` : 詳細取得の最大ユーザー数
- `FORCE_DETAIL_REFRESH=1` : 既存進捗があっても詳細取得をやり直す
- `FORCE_FOLLOWING_REFRESH=1` : 既存進捗を無視してフォロー一覧からやり直す
- `PER_USER_BIRTHDATE_LOOKUP=1` : 詳細取得後にユーザー単体 API で誕生日を再チェック
- `MAX_BIRTHDATE_LOOKUP` : 単体再チェックの最大数 (0 = 無制限)

## 仕組み

1. `twitter-scraper` でログインし Cookie を取得
2. `twitter-openapi-typescript` でフォロー一覧を取得
3. 取得したユーザーの `legacyExtendedProfile.birthdate` を抽出
4. 必要に応じてユーザー単体 API を追加で照会
5. 進捗を `data/birthdays-progress.json` に保存し、途中再開が可能

## 注意点

- 誕生日は **公開範囲が「相互フォロー」や「フォロワー」などに制限されている場合**、APIに返らないことがあります。
- レートリミット (429) が発生した場合は、ヘッダーの `x-rate-limit-reset` を元に待機します。
- `RESPONSES_LOG_ENABLED=1` を設定すると API レスポンスを保存します（個人情報を含む可能性があるため、取り扱いに注意してください）。

## 開発

```bash
pnpm dev
```

Lint / Format:

```bash
pnpm lint
pnpm fix
```

## ライセンス

MIT
