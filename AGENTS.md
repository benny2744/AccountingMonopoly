# AGENTS.md

Guidance for AI coding agents (opencode, Claude Code, Cursor, etc.) working in
this repository. Read this before making changes.

## Source of truth

- **[PRD.md](PRD.md)** is the authoritative product spec. If code and PRD
  disagree on intended behaviour, PRD wins (and code is the bug).
- **[PLAN-00-OVERVIEW.md](PLAN-00-OVERVIEW.md)** records locked technical
  decisions (Drizzle over Prisma, integer dollars, server-authoritative,
  event-sourced). Do not quietly overturn these; flag it.
- **[PLAN-01..05-*.md](PLAN-00-OVERVIEW.md)** are the phase plans. Match the
  phase you are working in.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** describes package boundaries and data
  flow.

## Environment

- **Runtime**: Node 22+, pnpm 9+.
- **Install**: `pnpm install`
- **Type-check everything**: `pnpm build`
- **Tests**: `pnpm test` (Vitest). The shared accounting engine must stay green.
- **Per-package dev**:
  - Client: `pnpm --filter @amono/client dev` (Vite on :5173, proxies `/api` and `/socket.io` to :5000)
  - Server: `pnpm --filter @amono/server dev` (tsx watch on :5000)

Always run `pnpm build && pnpm test` before declaring a task done.

## Conventions

- **Language**: TypeScript, ESM (`"type": "module"`). Strict typing; avoid `any`.
- **Monorepo**: pnpm workspaces. Packages are `@amono/client`, `@amono/server`,
  `@amono/shared`. Shared code is consumed via `workspace:*` and imported
  directly from TypeScript source — no build step for dev.
- **Keep the accounting engine pure.**
  [`packages/shared/src/accounting/`](packages/shared/src/accounting) must not
  import React, Express, Socket.IO, or any I/O. It is reused by both apps and
  is the heart of the test suite.
- **Money**: integer dollars only. Validate `Number.isInteger(x) && x >= 0` at
  boundaries. The PRD has no cents.
- **IDs**: `crypto.randomUUID()` (or `nanoid` where the server already uses it).
- **Validation**: Zod for every REST body and Socket.IO payload.
- **Authority**: server-authoritative, event-sourced. Clients request actions;
  the server validates → writes a `GameEvent` row → mutates state → broadcasts.
  Never let a client compute an official outcome.
- **Game event vs. accounting entry**: a `GameEvent` records *what happened*;
  the `entryRules` map produces the *how it is recorded*. Keep these layers
  separate.
- **Tests**: colocated `*.test.ts`. Match source names. Add to the shared
  package when touching accounting logic.
- **Comments**: add brief comments for tricky or non-obvious logic only. Do not
  narrate obvious code.

## Where to make changes

| Task | Go to |
| --- | --- |
| Accounting rule, new account, validation | `packages/shared/src/accounting/` |
| Map a new game event to journal entries | `packages/shared/src/accounting/entryRules.ts` |
| New board layout or event card deck | `packages/shared/src/game/` |
| Shared types | `packages/shared/src/types.ts` |
| Turn logic, dice, landing resolution | `apps/server/src/services/turnService.ts` |
| Room/team lifecycle, orchestration | `apps/server/src/services/gameService.ts` |
| Sessions, join auth | `apps/server/src/services/sessionsService.ts` |
| Socket.IO + per-game lock | `apps/server/src/socket.ts`, `apps/server/src/services/gameLock.ts` |
| Bridge game events to accounting | `apps/server/src/services/accountingService.ts` |
| REST endpoints | `apps/server/src/routes/games.ts` |
| DB schema | `apps/server/src/db/schema.ts` |
| Client store + socket connect | `apps/client/src/store.ts`, `apps/client/src/hooks/useRoomConnection.ts` |
| Client screens | `apps/client/src/routes/` and `apps/client/src/components/` |

## Things to avoid

- Do **not** commit secrets, real phone numbers, or live config values.
- Do **not** edit `node_modules` or anything under `dist/`.
- Do **not** introduce cents/floats for money.
- Do **not** add React/Express/Socket.IO imports inside `packages/shared/src/accounting`.
- Do **not** let clients authoritatively decide game outcomes.
- Do **not** commit on the user's behalf unless explicitly asked.

## Commit messages

Short, action-oriented, Conventional Commits style:

```
feat(server): add year-end settlement endpoint
fix(accounting): balance sheet now nets credit-line payable
test(shared): cover prepaid maintenance recognition
docs: update ARCHITECTURE for socket rooms
```

## When in doubt

Read the relevant `PLAN-*.md`, check existing tests for the pattern, and prefer
the simplest implementation that satisfies the PRD's acceptance criteria.
