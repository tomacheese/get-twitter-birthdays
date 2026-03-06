# GitHub Copilot Instructions

## プロジェクト概要
- 目的: Twitter/X でフォローしているユーザーの誕生日を取得し、JSON に保存する
- 主な機能: フォロー一覧取得、誕生日抽出、進捗保存、Docker 実行サポート
- 対象ユーザー: 開発者、Twitter ユーザー

## 共通ルール
- 会話は日本語で行う。
- PR とコミットは Conventional Commits に従う。
- 日本語と英数字の間には半角スペースを入れる。
- エラーメッセージは英語で記載する。

## 技術スタック
- 言語: TypeScript
- ランタイム: Node.js (v24.11.1)
- パッケージマネージャー: pnpm
- 主要ライブラリ: twitter-openapi-typescript, @the-convocation/twitter-scraper, cycletls

## コーディング規約
- フォーマット: Prettier
- Lint: ESLint (Standard)
- 関数・インターフェースには日本語で JSDoc を記載する。
- TypeScript の `skipLibCheck` は使用しない。

## 開発コマンド
```bash
# 依存関係のインストール
pnpm install

# 開発 (watch モード)
pnpm dev

# 実行
pnpm start

# テスト
pnpm test

# Lint
pnpm lint

# 自動修正 (Format + Lint fix)
pnpm fix
```

## テスト方針
- テストフレームワーク: Jest
- テストファイル: `**/*.test.ts`

## セキュリティ / 機密情報
- `data/config.json` や環境変数 (`.env`) に含まれる認証情報 (Twitter パスワードなど) はコミットしない。
- ログ (`RESPONSES_LOG_ENABLED=1` 時など) に機密情報が出力される可能性があるため注意する。

## ドキュメント更新
- `README.md` (仕様変更時)

## リポジトリ固有
- Docker での実行もサポートしている (`docker build -t get-twitter-birthdays .`)。
- データは `data/` ディレクトリに保存される。
