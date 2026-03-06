# CLAUDE.md

## 目的
このドキュメントは、Claude Code が `get-twitter-birthdays` リポジトリで作業する際の方針とルールを定義します。

## 判断記録のルール
1. **判断内容の要約**: 何を決定したか簡潔に記載
2. **検討した代替案**: 他にどのようなアプローチを検討したか
3. **採用しなかった案とその理由**: なぜ他の案を採用しなかったか
4. **前提条件・仮定・不確実性**: 判断の基礎となった情報と、未確定な要素
5. **他エージェントによるレビュー可否**: Codex CLI 等によるレビューが必要か

## プロジェクト概要
- 目的: Twitter/X のフォローユーザーの誕生日を取得・保存する
- 主な機能: 自動スクレイピング、誕生日抽出、JSON 出力

## 重要ルール
- **会話言語**: 日本語
- **コミット規約**: Conventional Commits (`feat: ...`, `fix: ...`)
- **コメント言語**: 日本語 (docstring 含む)
- **エラーメッセージ**: 英語
- **テキスト整形**: 日本語と英数字の間に半角スペースを挿入

## 環境のルール
- **ブランチ命名**: `feat/description`, `fix/description` (Conventional Branch)
- **リポジトリ調査**: 調査時はテンポラリディレクトリに git clone して検索
- **Renovate**: Renovate の PR には触れない

## Git Worktree
- 本リポジトリでは Git Worktree の使用を推奨 (`.bare/<branch>` 構成)

## コード改修時のルール
- エラーメッセージの先頭に絵文字がある場合は、全体で絵文字を設定する
- `tsconfig.json` 等で `skipLibCheck` を有効にしない
- 公開関数やインターフェースには日本語の docstring を記述する

## 相談ルール
- 実装レビューや整合性確認は Codex CLI に相談可能
- 外部仕様や最新情報は Gemini CLI に確認可能
- 指摘事項は無視せず対応する

## 開発コマンド
```bash
# インストール
pnpm install

# 開発サーバー (Watch)
pnpm dev

# 本番実行
pnpm start

# テスト
pnpm test

# Lint チェック
pnpm lint

# コード修正 (Lint & Format)
pnpm fix
```

## アーキテクチャと主要ファイル
- `src/main.ts`: エントリーポイント
- `src/core/`: コアロジック (following.ts, output.ts)
- `src/infra/`: インフラ層 (auth.ts, cycletls.ts, storage.ts)
- `src/shared/`: 共有ユーティリティ (config.ts, types.ts)
- `data/`: 設定ファイルや出力ファイルの保存先

## 実装パターン
- `twitter-openapi-typescript` と `twitter-scraper` を組み合わせたスクレイピング
- `cycletls` による TLS 指紋対策
- `infra/storage.ts` を介したファイル操作

## テスト
- フレームワーク: Jest
- テストは `src/**/*.test.ts` に配置
- `pnpm test` で実行

## ドキュメント更新ルール
- 機能追加・変更時は `README.md` の「使い方は」「環境変数」セクションを更新
- `package.json` の更新時は依存関係を確認

## 作業チェックリスト

### 新規改修時
1. プロジェクト構造と目的を理解する
2. 適切なブランチを作成する (最新の default ブランチから)
3. 不要になったブランチを削除する
4. `pnpm install` を実行する

### コミット・プッシュ前
1. メッセージが Conventional Commits に準拠しているか確認
2. 認証情報等の機密情報が含まれていないか確認
3. `pnpm lint` が通ることを確認
4. `pnpm start` や `pnpm test` で動作確認

### PR 作成前
1. ユーザーからの依頼に基づいているか確認
2. コンフリクトの可能性がないか確認

### PR 作成後
1. コンフリクトがないか確認
2. PR 本文に最新の変更内容のみを日本語で記述
3. CI (`gh pr checks`) の成功を確認
4. Copilot/Codex のレビューに対応

## リポジトリ固有
- `data/` ディレクトリは `.gitignore` されているが、ユーザーデータが入るため操作時は注意
- スクレイピングを行うため、レートリミットや API 仕様変更に留意する
