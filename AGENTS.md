# AGENTS.md

Guidance for AI coding agents and contributors. `CLAUDE.md` imports this file, and `.github/copilot-instructions.md` adds the review checklist.

## Language

- All deliverables are written in **English**: commit messages, PR/Issue titles and bodies, review comments, code comments and docstrings, and documentation (`README.md`, `AGENTS.md`, etc.).
- Exceptions (keep as is): the Japanese calendar event title `<name>(@<screenName>)の誕生日` (user-visible output), quotations, technical identifiers, generated files, and external text.
- Runtime messages (logs, errors, CLI prompts) are English.
- Do not rewrite Git history to change the language of past commits.

## Overview

A CLI tool that fetches the birthdays of the Twitter/X users you follow and saves them to `data/birthdays.json`. Optionally, it syncs them to Google Calendar as yearly recurring events.

- Login with `@the-convocation/twitter-scraper`, then fetch the following list and details with `twitter-openapi-typescript`. `cycletls` is used for the TLS fingerprint.
- A progress file lets an interrupted run resume. Rate limits (429) are handled by waiting.

## Commands

```bash
pnpm install        # install dependencies (other package managers are rejected by preinstall)
pnpm start          # run src/main.ts with tsx
pnpm dev            # run src/main.ts with tsx watch
pnpm auth:google    # run the Google OAuth 2.0 flow for Calendar sync
pnpm lint           # prettier --check + eslint + tsc (type check)
pnpm fix            # prettier --write + eslint --fix
pnpm test           # jest with coverage
```

Run `pnpm lint` and `pnpm test` before committing. Node.js and pnpm versions are pinned in `.node-version` and `package.json`.

## Structure

- `src/main.ts`: entry point (fetch following → extract birthdays → write output → optional Calendar sync)
- `src/auth-google.ts`: entry point for `pnpm auth:google`
- `src/core/`: domain logic
  - `following.ts`: fetches the following list and details. Returns `complete` (whether the result is a complete snapshot), stored as `snapshotComplete` in the progress file.
  - `output.ts`: builds the output JSON.
  - `calendar-sync.ts`: diff-based Calendar sync. Reconcile deletions are skipped entirely when `complete` is false, no birthdays were fetched, or the candidates exceed `SYNC_CALENDAR_RECONCILE_MAX_DELETIONS`.
- `src/infra/`: external integrations (`auth.ts`, `cycletls.ts`, `storage.ts`, `calendar-client.ts`, `google-auth.ts`, `logger.ts`)
- `src/shared/`: `config.ts` (environment variables), `types.ts`, `retry.ts` / `google-retry.ts`
- `src/types/third-party.d.ts`: type declarations for untyped libraries
- `data/`: config, output, caches and tokens (git-ignored)

Read and write files through `src/infra/storage.ts`, not `fs` directly.

## Conventions

- TypeScript on Node.js, managed with pnpm. ESLint (`@book000/eslint-config` + standard) and Prettier.
- Error messages are English. If you prefix them with an emoji, do it consistently.
- Avoid `any`; use and extend the types in `src/shared/types.ts`.
- Do not enable `skipLibCheck` in `tsconfig.json`.
- Write JSDoc for exported functions and interfaces.
- Tests are `**/*.test.ts` next to the code under test (Jest + `ts-jest`). Mock external APIs; tests never touch the network.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and branches follow [Conventional Branch](https://conventional-branch.github.io) (`feat/...`, `fix/...`).
- Do not commit to Renovate PRs.

## Environment variables and docs

Behavior is controlled by environment variables (credentials, paths, fetch limits, Calendar sync). When adding or changing one, update both `src/shared/config.ts` (or the code that reads it) and the "Environment variables" section of `README.md`. Update `README.md` and this file when commands or the directory layout change.

## Security

- Never commit `data/config.json`, `.env`, `data/google-credentials.json` or `data/google-tokens.json`, or any Twitter password, cookie or email address.
- Do not write personal information to logs or output. `RESPONSES_LOG_ENABLED=1` saves raw API responses to `data/responses`, so handle that directory with care.
- `data/` holds user data. Be careful when operating on it.
- This tool scrapes Twitter, so be mindful of upstream changes and rate limits.
