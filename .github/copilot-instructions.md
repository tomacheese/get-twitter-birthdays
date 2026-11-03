# GitHub Copilot review instructions

This repository is a TypeScript / Node.js (pnpm) CLI that fetches the birthdays of followed Twitter/X users, saves them to `data/birthdays.json`, and optionally syncs them to Google Calendar. See `AGENTS.md` for the project rules, including the English-only language policy. Review pull requests against the points below.

## Enforced conventions (flag violations)

- Prettier / ESLint (`@book000/eslint-config` + standard). `pnpm lint` includes the `tsc` type check, so changes that leave type errors are not acceptable.
- `skipLibCheck` must not be enabled in `tsconfig.json`.
- Avoid new `any`; use and extend the types in `src/shared/types.ts`.
- Exported functions and interfaces have JSDoc.
- Code comments, docs, runtime messages, commit messages and PR titles are in English (Conventional Commits for commits and PR titles). The Japanese calendar event title is the one intentional exception.

## What to check

- **Secrets**: no credentials from `data/config.json`, `.env`, `data/google-credentials.json` or `data/google-tokens.json` in the diff, and no personal information in logs or output (especially the `data/responses` dump enabled by `RESPONSES_LOG_ENABLED=1`).
- **Error handling**: the existing wait on rate limits (429, using `x-rate-limit-reset`) is preserved, and external API calls use the retry helpers in `src/shared/retry.ts` / `google-retry.ts`.
- **File I/O**: files are accessed through `src/infra/storage.ts`, not `fs` directly.
- **Resume integrity**: changes to reading or writing the progress file (`birthdays-progress.json`) do not break resuming, and `snapshotComplete` still guards Calendar reconcile deletions.
- **Environment variables**: when one is added or removed, both the code that reads it and the "Environment variables" section of `README.md` are updated.

## Known patterns not to flag

- `data/` is git-ignored on purpose (it holds user data and credentials).
- `--passWithNoTests` in the `test` script is intentional.
- `only-allow pnpm` in `preinstall` is intentional (pnpm is enforced).
- Adjusting the TLS fingerprint with `cycletls` is a legitimate part of scraping, not obfuscation.
