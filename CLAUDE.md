# CLAUDE.md

## プロジェクト概要

- 目的: Twitter/X でフォロー中のユーザーの誕生日を取得し `data/birthdays.json` に保存する CLI ツール
- 取得した誕生日を Google Calendar に年次繰り返しイベントとして同期する機能もある(オプション)
- 中核: `@the-convocation/twitter-scraper` でログイン、`twitter-openapi-typescript` でフォロー一覧・詳細を取得、`cycletls` で TLS 指紋対策
- 進捗ファイルによるリジューム対応、レートリミット (429) 待機に対応

## 開発コマンド

```bash
pnpm install        # 依存関係のインストール (pnpm 以外は preinstall で拒否)
pnpm dev            # tsx watch でエントリを起動
pnpm start          # tsx で src/main.ts を実行
pnpm auth:google    # Google Calendar 連携用の OAuth2 認証フローを実行
pnpm lint           # prettier --check + eslint + tsc (型チェック) を run-z で連続実行
pnpm fix            # prettier --write + eslint --fix
pnpm test           # jest (--passWithNoTests つき)
```

## アーキテクチャと主要ファイル

- `src/main.ts`: エントリーポイント(フォロー取得 → 誕生日抽出 → 出力 → 任意で Calendar 同期)
- `src/auth-google.ts`: `pnpm auth:google` から呼ばれる Google OAuth2 認証フロー用エントリ
- `src/core/`: ドメインロジック
  - `following.ts`(フォロー一覧・誕生日抽出)、`output.ts`(JSON 出力)、`calendar-sync.ts`(Calendar への差分同期)
- `src/infra/`: 外部連携層
  - `auth.ts`(Twitter ログイン)、`cycletls.ts`(TLS ラッパー)、`storage.ts`(ファイル I/O)、`calendar-client.ts` / `google-auth.ts`(Google Calendar)、`logger.ts`
- `src/shared/`: `config.ts`(環境変数・設定読み込み)、`types.ts`、`retry.ts` / `google-retry.ts`(リトライ)
- `src/types/third-party.d.ts`: 型定義のない外部ライブラリの補完
- `data/`: 設定・出力・キャッシュ・トークンの保存先(`.gitignore` 対象)

ファイルの読み書きは直接 `fs` を触らず `src/infra/storage.ts` を経由する。

## コーディング規約

- 言語: TypeScript。ランタイムは Node.js(`.node-version` は 24.18.0)、パッケージマネージャは pnpm
- Lint/Format: ESLint(`@book000/eslint-config` + standard)+ Prettier。コミット前に `pnpm lint` を通す
- 公開関数・インターフェースには日本語で JSDoc を書く
- `any` を避ける。型は `src/shared/types.ts` を参照・拡張する
- `tsconfig.json` の `skipLibCheck` は有効化しない
- エラーメッセージは英語。先頭に絵文字を付ける場合は一貫して付ける
- コメント言語は日本語。日本語と英数字の間には半角スペースを入れる

## テスト

- フレームワークは Jest(`ts-jest`)、対象は `**/*.test.ts`
- 現状テストファイルは存在せず、`pnpm test` は `--passWithNoTests` で通る。変更の動作確認は `pnpm lint`(型チェック含む)と `pnpm start` の手動実行で行う
- テストを追加する場合は対象コードと同階層に `*.test.ts` を置く

## セキュリティ / 機密情報

- `data/config.json` や `.env` に含まれる Twitter 認証情報(パスワード・Cookie・メールアドレス)、Google の `data/google-credentials.json` / `data/google-tokens.json` は絶対にコミットしない
- ログや出力に個人情報を含めない。`RESPONSES_LOG_ENABLED=1` を設定すると API レスポンス(個人情報を含む)を `data/responses` に保存するため取り扱いに注意する
- `data/` はユーザーデータが入るため操作時に注意する

## リポジトリ固有

- 環境変数で挙動を細かく制御する(認証情報、各種パス、取得上限、Google Calendar 同期など)。追加・変更時は `src/shared/config.ts` と `README.md`「環境変数」節を同期させる
- Docker 実行をサポート(`docker build -t get-twitter-birthdays .`)。Google 認証時はポート 3000 のマッピングが必要
- スクレイピングのため、Twitter 側の仕様変更・レートリミットに留意する
- Renovate の PR には直接コミットしない

## ドキュメント更新ルール

- 機能追加・仕様変更時は `README.md`(使い方・環境変数・仕組み)を更新する
- 環境変数を増減した場合は `README.md` と `src/shared/config.ts` の双方を確認する
- ディレクトリ構成やコマンドを変えたら、この CLAUDE.md の該当節も更新する

## Git / コミット

- コミットは Conventional Commits(`feat:`, `fix:`, `chore:` など)。description は日本語
- ブランチは Conventional Branch 形式(`feat/...`, `fix/...`)
