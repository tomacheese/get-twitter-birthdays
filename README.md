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
