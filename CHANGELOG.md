# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 3 — Multiplayer classroom rooms** (`socket.io` server, session-based
  identity, room-code join, role-aware client screens, production serving):
  - `sessions` table + `sessionsService` issuing UUID tokens bound to
    `{gameId, role, teamId}`; clients store the token in `localStorage`.
  - `apps/server/src/socket.ts` — Socket.IO server with Zod-validated events and
    full-state broadcasts (`game:state_updated`) on every mutation.
  - `services/gameLock.ts` — per-game in-process mutex shared by REST and sockets.
  - Teacher controls: `pause`, `resume`, `force_next_turn`, `reveal_answer`
    (POST endpoints + socket events). Pause blocks all mutating team actions.
  - REST: `GET /api/games/by-code/:roomCode` (with per-team join occupancy),
    `teacher-join`, `:gameId/join`, `display-join`, `GET /session`,
    `GET /meta/lan-info`. Mutating endpoints require a valid session token.
  - Express serves the built client from `apps/client/dist` with an SPA fallback.
  - Client routes: `/join[/:code]`, `/lobby/:roomCode`, `/game/:roomCode`
    (team), `/teacher/:roomCode`, `/display/:roomCode`. Zustand store owns the
    Socket.IO connection, restores session on connect, and surfaces `game:error`
    via a dismissible toast.
  - 9 socket integration tests + extended REST tests (82 tests total).

### Fixed
- **Phase 3 review fixes** — students can play again (session bootstrap on
  connect/join); `endTurn` requires active game + current-team-or-teacher;
  socket role guards block display/teacher from team actions; lobby shows live
  join occupancy and gates start on 2+ teams; T-accounts/statements refresh on
  state updates; teacher impersonation bypass removed.
- Pre-existing `pnpm build` failure (root tsconfig lacked `jsx: react-jsx`
  for client sources) and `@types/node`/type-naming issues in client/server.

### Notes
- Project is pre-1.0. Phase 3 multiplayer is acceptance-ready for classroom
  testing; accrual polish and classroom UX remain in `PLAN-04` / `PLAN-05`.

## [0.1.0] - YYYY-MM-DD

_First tagged release — not yet cut._

### Added
- pnpm workspace monorepo: `apps/client`, `apps/server`, `packages/shared`.
- Pure TypeScript accounting engine: accounts, journal posting, validation,
  T-account generation, income statement, balance sheet, cash summary.
- Express + Socket.IO server with SQLite persistence and event-sourced game state.
- React + Vite client with board, team dashboard, journal entry form, and
  statement views.
- Cash-basis event deck and simple 24-space board preset.

[Unreleased]: https://example.com/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/releases/tag/v0.1.0
