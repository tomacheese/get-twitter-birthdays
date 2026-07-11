# GitHub Copilot コードレビュー指示

このリポジトリは Twitter/X のフォローユーザーの誕生日を取得し、`data/birthdays.json` への保存および Google Calendar への同期を行う TypeScript / Node.js (pnpm) 製 CLI ツールです。プルリクエストのレビューでは以下を重点的に確認してください。

## 強制されている規約(違反はフラグする)

- Prettier / ESLint(`@book000/eslint-config` + standard 準拠)。`pnpm lint` は `tsc` の型チェックまで含むため、型エラーが残る変更は不可。
- `tsconfig.json` の `skipLibCheck` を有効化しない。
- `any` 型の新規追加は避け、`src/shared/types.ts` の型を利用・拡張する。
- 公開関数・インターフェースには日本語の JSDoc を付ける。
- エラーメッセージは英語。日本語と英数字の間には半角スペースを入れる。
- コミット / PR タイトルは Conventional Commits(`feat:`, `fix:`, `chore:` など)。

## レビュー時の重点確認事項

- **機密情報**: `data/config.json`・`.env`・`data/google-credentials.json`・`data/google-tokens.json` の認証情報がコミットに含まれていないか。ログや出力に個人情報が混入していないか(特に `RESPONSES_LOG_ENABLED=1` 時の `data/responses` 保存)。
- **エラーハンドリング**: レートリミット (429) は `x-rate-limit-reset` を見て待機する既存挙動を壊していないか。外部 API 呼び出しは `src/shared/retry.ts` / `google-retry.ts` のリトライを適切に使っているか。
- **ファイル I/O**: 直接 `fs` を触らず `src/infra/storage.ts` を経由しているか。
- **リジューム整合性**: 進捗ファイル(`birthdays-progress.json` など)の読み書き変更が途中再開を壊していないか。
- **環境変数**: 変数を増減した場合、`src/shared/config.ts` と `README.md`「環境変数」節の双方が更新されているか。

## フラグすべきでない既知パターン(誤検知回避)

- `data/` が `.gitignore` されているのは意図的(ユーザーデータ・認証情報の保存先)。
- `package.json` の `test` に付く `--passWithNoTests` は意図的(現状テストファイルなし)。
- `preinstall` の `only-allow pnpm` は意図的(pnpm 強制)。
- `cycletls` による TLS 指紋の調整はスクレイピング用途の正規実装であり、不正な難読化ではない。
