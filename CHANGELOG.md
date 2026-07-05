# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 5 — Classroom polish** (PRD §26.5): hints, scoring, export,
  projector polish, student-clarity pass, and the teacher runbook.
  - **Hints** (PRD §17.4): Hint button in `JournalEntryPanel` steps through
    the 4 levels from the shared engine (`getHint`). Level 4 (full answer)
    is gated by the new `allowStudentFullHint` setting (default false —
    full answers go through teacher Reveal). `hints_used` is recorded per
    pending action and feeds scoring.
  - **Scoring** (PRD §25): per-year snapshot now stores
    `score = netIncome + cash*0.1 − loan*0.1 + cleanBooksBonus` plus
    `cumulative_score`. Bonus = +100 if all student entries were first-try,
    +50 if all within one retry, 0 if any revealed. System entries
    (interest, year-end, closing, counterparty auto-posts) are excluded.
    New `GET /:id/scores` endpoint; leaderboard on DisplayPage /
    TeacherDashboard switches to score-based ranking when `showScores` is
    on (new setting, default true).
  - **Export** (PRD §19.1): `GET /:id/export?format=json|csv`. JSON is the
    full event-sourced record; CSV is a multi-section workbook
    (`journal_entries`, `balances`, `scores`) for Excel grading, with
    `is_student_submitted` / `attempt_outcome` columns so system entries
    are distinguishable.
  - **Teacher recovery** (PRD §24): End Game button (`POST /:id/end`),
    "Play again with same settings" clone (`POST /:id/clone`), stuck-team
    badge with elapsed minutes on the team table, Export CSV/JSON buttons.
  - **Projector polish**: plain-language event ticker, year-end celebration
    banner (with net income) driven by `year_end_completed`, timed answer-reveal
    card on reveal, event-card description shown on the projector, shared
    `Leaderboard` component on DisplayPage and TeacherDashboard.
  - **Student clarity** (PRD §28.1): persistent status strip on TeamDashboard
    keyed off the team's year-end checklist (not the turn pending), normal-balance
    captions on account dropdowns, mini before/after T-account feedback on
    correct journal submissions, hint state resets per pending action,
    disconnected-connection banner.
  - **Security / correctness fixes**: `teacherPinHash` stripped from state
    broadcasts and JSON export; hint counter increments only the active pending;
    `pendingToView` exposes `id`, `createdAt`, and `hintsUsed` for stuck badges;
    year-end banner timer no longer re-arms on every broadcast; teacher dashboard
    errors use toast instead of `alert()`.
  - **New settings**: `allowStudentFullHint`, `showScores` on `GameSettings`.
  - **New schema columns**: `pending_actions.hints_used`,
    `year_snapshots.score`, `year_snapshots.cumulative_score`.
  - **Convenience scripts**: `pnpm dev` runs server + client together via
    `concurrently`; `pnpm start` builds the client then runs the server.
  - README expanded with reset instructions, implemented features, known
    limitations, and the PRD §31 MVP acceptance checklist.
  - 13 Phase 5 integration tests covering end-game (blocks rolls), scoring,
    export (no pin hash), hint gating/per-pending counter, clone settings,
    submit `balanceChanges`, pending view fields, and state broadcast hygiene.
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
