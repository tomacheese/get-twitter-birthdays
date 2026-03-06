# AGENTS.md

## 目的
このドキュメントは、汎用 AI エージェントが `get-twitter-birthdays` リポジトリで作業する際の基本方針を定義します。

## 基本方針
- **言語**: 会話、コードコメント、ドキュメントは日本語。エラーメッセージは英語。
- **フォーマット**: 日本語と英数字の間に半角スペースを入れる。
- **コミット**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。`<description>` は日本語。
- **ブランチ**: [Conventional Branch](https://conventional-branch.github.io) に従う。

## 判断記録のルール
- 重要な決定を行う際は、その内容、理由、代替案、前提条件を明示的に記録または報告する。
- 仮定に基づいた行動をとる場合は、その仮定を明確にする。

## 開発手順
1. **理解**: `README.md` とソースコードを読み、プロジェクトの目的（Twitter 誕生日取得）を理解する。
2. **準備**: `pnpm install` で依存関係をインストールする。
3. **実装**: `src/` 配下のコードを変更する。既存のスタイル（Prettier/ESLint）に従う。
4. **確認**: `pnpm lint` で静的解析を行い、`pnpm test` でテストを実行する。

## セキュリティ / 機密情報
- `data/config.json` や `.env` ファイルに含まれる Twitter の認証情報（パスワード、クッキー等）は絶対にコミットしない。
- ログ出力に個人情報が含まれないよう注意する。

## リポジトリ固有
- Node.js バージョン: 24.11.1
- パッケージマネージャ: pnpm
- `src/infra/cycletls.ts` など、外部ライブラリのラッパーがある場合はそれを使用する。
