# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 4 — Accrual Basis mode** (full feature set per PRD §26.4):
  - **Fee/event softlock fix** (PRD §23, §27.3): teams stuck on an
    unaffordable fee/expense card can take a bank loan mid-pending via
    `POST /:id/loan-for-fee` (`takeLoanForPendingFee`); the journal entry
    then clears the negative-cash guard.
  - **Credit limit enforcement** (PRD §12.2): player-credit rent choice
    rejected with `CREDIT_LIMIT` if it would push A/P exposure above the
    team's `creditLimit`; teacher can override per team via
    `POST /:id/credit-limit` and the dashboard UI.
  - **Accrual event cards queue deferred settlements** (PRD §11.2): the
    `accrual_revenue_receivable`, `accrual_expense_payable`, and
    `accrual_prepaid` cards insert a `deferred_settlements` row consumed at
    year-end. Player-to-player credit still uses `credit_balances`.
  - **Year-end checklist** (`yearEndService.ts`): replaces the Phase 2 year
    bump on GO pass. Modeled as a single `year_end` pending action with a
    steps payload — collect A/R, settle A/P (per-item pay-cash or
    roll-to-loan), recognize prepaids, snapshot statements, close revenue &
    expense to Retained Earnings, then bump `current_year`.
  - New tables: `deferred_settlements`, `year_snapshots` (plus an unused legacy
    `pending_year_end` column on `teams` — year-end is triggered in `roll()`).
  - New routes: `loan-for-fee`, `year-end/start`, `year-end/resolve-step`,
    `credit-limit`, `teams/:teamId/arap`; matching socket events.
  - Client UI: A/R & A/P summary in the sidebar; `YearEndPanel` checklist;
    softlock loan affordance inside `JournalEntryPanel`; teacher
    credit-limit override and "Trigger year-end" buttons.
  - 12 Phase 4 service tests in `accrual.integration.test.ts` (rent on credit,
    credit limit + override, full year-end, prepaid, A/P rollover, cash-mode
    rejection, loan-for-fee softlock, plus review-fix coverage below).
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
  - 9 socket integration tests + extended REST tests.

### Fixed
- **Phase 4 review fixes** (accrual mode):
  - Per-team year-end concurrency: `year_end` pendings are independent of the
    turn loop (`yearEndPendings` in game state); other teams keep playing while
    one team closes books; `roll()` blocks with `YEAR_END_OPEN` until done.
  - Year-end triggers immediately on GO pass/landing in `roll()` (removed stale
    `pending_year_end` flag plumbing).
  - Creditor-first A/R collection clears debtor A/P via bank loan rollover
    (`rolled_to_loan` on `credit_balances`; `year_end_ar_collected` event).
  - `credit_method_modifier` cards no longer softlock; deferred settlement rows
    are created only after a successful journal post (not at card draw).
  - Year-end start/resolve auth: self-team or teacher; credit-limit changes
    logged as `teacher_override` under game lock; `settle_ap` rejects
    `"continue"`.
  - Client: A/R & A/P schedule tab, live cash-short banner, year-end panel from
    `yearEndPendings`; year snapshot beginning cash from prior-year lines.
- **Phase 3 review fixes** — students can play again (session bootstrap on
  connect/join); `endTurn` requires active game + current-team-or-teacher;
  socket role guards block display/teacher from team actions; lobby shows live
  join occupancy and gates start on 2+ teams; T-accounts/statements refresh on
  state updates; teacher impersonation bypass removed.
- Pre-existing `pnpm build` failure (root tsconfig lacked `jsx: react-jsx`
  for client sources) and `@types/node`/type-naming issues in client/server.

### Notes
- Project is pre-1.0. Phases 3–4 are acceptance-ready for classroom testing;
  classroom UX polish remains in `PLAN-05`.

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
