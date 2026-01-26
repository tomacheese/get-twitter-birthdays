# GEMINI.md

## 目的
このドキュメントは、Gemini CLI が `get-twitter-birthdays` リポジトリで作業する際のコンテキストと指示を定義します。

## 出力スタイル
- **言語**: ユーザーへの回答は日本語。途中経過の思考プロセスは英語でも可。
- **トーン**: 専門的かつ簡潔に。
- **形式**: Markdown。日本語と英数字の間には半角スペースを入れる。

## 共通ルール
- **コミットメッセージ**: Conventional Commits (`type(scope): description`)。Description は日本語。
- **ブランチ**: `feat/...` や `fix/...` などの Conventional Branch 形式。
- **コード**: TypeScript。コメントは日本語。エラーメッセージは英語。

## プロジェクト概要
- **名前**: get-twitter-birthdays
- **目的**: Twitter (X) のフォロー中ユーザーの誕生日情報を取得し、JSON ファイルとして保存する。
- **仕組み**: `twitter-scraper` で認証し、`twitter-openapi-typescript` でデータを取得。Docker での実行も想定。

## コーディング規約
- **Lint**: `pnpm lint` (ESLint)
- **Format**: `pnpm fix` (Prettier)
- **型定義**: `src/shared/types.ts` や `src/types/` を参照。`any` は避ける。
- **ドキュメント**: JSDoc を日本語で記述する。

## 開発コマンド
```bash
# 依存関係インストール
pnpm install

# 開発用実行 (Watch)
pnpm dev

# 通常実行
pnpm start

# テスト実行
pnpm test

# Lint 実行
pnpm lint

# コード修正
pnpm fix
```

## 注意事項
- **認証情報**: `data/config.json` などに保存される認証情報はコミットしない。
- **API 制限**: Twitter API (またはスクレイピング) のレートリミットを考慮した実装になっているか確認する。
- **禁止事項**: `skipLibCheck` の有効化、Renovate PR への直接コミット。

## リポジトリ固有
- `src/infra/` にインフラ層（認証、ストレージ、TLS）が分離されているアーキテクチャに従う。
- データの入出力は `src/infra/storage.ts` を通じて行うことを推奨。
