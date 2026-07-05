# Architecture

This document describes how the Accounting Monopoly codebase is organized and
how data and control flow through it. It is the reference for anyone making
non-trivial changes. For product behaviour, read [PRD.md](PRD.md); for phase
roadmaps, see [PLAN-00-OVERVIEW.md](PLAN-00-OVERVIEW.md).

## Goals

1. **Server-authoritative.** Clients never compute official game outcomes. They
   emit action requests; the server validates, persists, applies, and broadcasts.
2. **Event-sourced.** Every state-changing action is persisted as a `GameEvent`
   row before state is mutated, so the game can be reconstructed, audited, and
   debugged.
3. **Pure accounting core.** The accounting engine in `packages/shared` has zero
   dependency on React or Express — it is plain TypeScript, fully unit-testable,
   and reused by both client (for optimistic display) and server (for truth).
4. **Classroom-friendly.** One process on the teacher's laptop can serve the
   built client and the API over LAN; no external services or auth required.

## Monorepo layout

| Package | npm name | Responsibility |
| --- | --- | --- |
| `apps/client` | `@amono/client` | React + Vite frontend. Board, dashboards, journal entry form, T-account and statement views. |
| `apps/server` | `@amono/server` | Express REST + Socket.IO. Validates every action, persists to SQLite, applies state, broadcasts diffs. |
| `packages/shared` | `@amono/shared` | Pure accounting engine, shared TypeScript types, board presets, event card decks. No I/O, no UI. |

`@amono/shared` is consumed by both apps via pnpm `workspace:*` and is imported
directly from its TypeScript source (no build step required for dev).

### Where things live

- Accounting engine: [`packages/shared/src/accounting/`](packages/shared/src/accounting)
  - `accounts.ts`, `normalBalances.ts` — chart of accounts and debit/credit rules.
  - `journal.ts` — posting journal entries to the ledger.
  - `validation.ts` — comparing a student entry to the expected entry.
  - `entryRules.ts` — maps each game event type to its expected journal entries.
  - `statements.ts` — income statement, balance sheet, cash summary, A/R–A/P schedule.
  - `scenarioA.test.ts`, `scenarioB.test.ts` — the PRD §32 acceptance scenarios.
- Game definitions: [`packages/shared/src/game/`](packages/shared/src/game)
  - `boardPresets.ts` — the 24-space simple board.
  - `eventCards.ts` — cash-basis and accrual event decks.
- Server game logic: [`apps/server/src/services/`](apps/server/src/services)
  - `gameService.ts` — room/team lifecycle, start gating, teacher controls.
  - `turnService.ts` — dice, movement, landing resolution, `endTurn`.
  - `accountingService.ts` — bridges game events to the shared entry rules and posts entries.
  - `stateService.ts` — projection of current game state for reads and broadcasts.
  - `sessionsService.ts` — session tokens bound to `{gameId, role, teamId}`.
  - `gameLock.ts` — per-game in-process mutex shared by REST and Socket.IO.
  - `eventLog.ts` — appends and reads `GameEvent` rows.
- Real-time: [`apps/server/src/socket.ts`](apps/server/src/socket.ts) — Socket.IO
  rooms keyed by `roomCode`, role guards, full-state `game:state_updated` broadcasts.
- Persistence: [`apps/server/src/db/`](apps/server/src/db)
  - `schema.ts`, `queries.ts`, `client.ts` (`node:sqlite`).
- REST: [`apps/server/src/routes/games.ts`](apps/server/src/routes/games.ts).
- Client UI: [`apps/client/src/components/`](apps/client/src/components),
  [`apps/client/src/routes/`](apps/client/src/routes) (`TeamDashboard`,
  `TeacherDashboard`, `DisplayPage`, `LobbyPage`, `JoinPage`), and
  [`apps/client/src/store.ts`](apps/client/src/store.ts) (Zustand + Socket.IO).

## Request and event flow

```
Browser (React)
   │  REST POST /api/games/:id/...        Socket.IO emit
   ▼                                        │
Express route (Zod-validated payload) ◄─────┘
   │
   ▼
GameService / TurnService / AccountingService
   │  1. Validate game rule + accounting rule
   │  2. Append GameEvent row (SQLite)
   │  3. Apply to in-memory state projection
   │  4. Compute broadcast payload (often via shared engine)
   ▼
Socket.IO broadcast: `game:state_updated` (full snapshot), `game:error` (to the
offending socket only).
   │
   ▼
All clients in the room update their Zustand store and re-render.
```

Key invariant: **the `GameEvent` row is persisted before state is mutated**, and
the broadcast is derived from the authoritative server state. Clients may render
optimistically, but the server's next broadcast is the source of truth.

## Data model (summary)

Full TypeScript interfaces are in [PRD.md §18](PRD.md) and
[`packages/shared/src/types.ts`](packages/shared/src/types.ts).

- **Game** — room code, difficulty (`cash` | `accrual`), status, settings
  (property allocation ratio, starting cash, loan/credit limit, journal entry mode).
- **Team** — name, color, board position, current year, credit limit, active flag.
- **BoardSpace** — index, name, type (`go`, `property`, `event`, `bank`,
  `repair`, `charity`, `road_closure`, `rest`, `tax`).
- **Property** — board space, purchase price, rent, owner team id.
- **Account** — per-team account; type ∈ `asset | liability | equity | revenue | expense`; normal balance `debit | credit`.
- **JournalEntry** + **JournalEntryLine** — student-submitted or auto-posted;
  carries `isCorrect` and `sourceEventId` for traceability.
- **GameEvent** — typed record of every state change (`roll`, `move`,
  `land_property`, `rent_paid_cash`, `rent_paid_credit`, `draw_event_card`,
  `year_end_started`, `teacher_override`, …). `payload` is the typed detail.
- **CreditBalance** (accrual only) — debtor/creditor team pair, amount, source
  event, status `open | paid | rolled_to_loan`.

## Accounting engine contract

The engine exposes pure functions (see [PRD.md §21](PRD.md)):

- `getNormalBalance(accountType)`
- `validateJournalEntry(input, expectedEntry)`
- `postJournalEntry(entry)`
- `calculateAccountBalance(account, journalLines)`
- `generateIncomeStatement / BalanceSheet / CashSummary / ARAPSchedule`

Normal balances: **Assets** and **Expenses** are debit-normal; **Liabilities**,
**Equity**, and **Revenue** are credit-normal. Money is represented as integer
dollars (the PRD has no cents); validate `Number.isInteger(x) && x >= 0` at
boundaries. IDs are `crypto.randomUUID()` / `nanoid`.

## Game event → journal entry mapping

[`packages/shared/src/accounting/entryRules.ts`](packages/shared/src/accounting/entryRules.ts)
maps each game event type to the expected journal entries for every team it
touches (payer + receiver, debtor + creditor). The server uses these rules both
to validate student submissions and to auto-post the counterparty entry when the
room's `journalEntryMode` is `autoPostCounterparty` (the MVP default).

## Separation: game events vs. accounting entries

A **game event** is what happened in the game ("Team Red landed on Team Blue's
property and owes $120 rent"). An **accounting entry** is how it is recorded.
The same game event can produce different entries depending on the difficulty
mode and the chosen payment method (cash / player credit / bank credit line).
Keeping these layers separate is what makes the engine testable and the audit
trail clean.

## Testing strategy

- **Shared engine** carries the heaviest unit-test coverage, including the two
  PRD §32 scenarios. These run on every `pnpm test`.
- **Server** has integration tests:
  - `game.integration.test.ts` — REST create → roll → resolve → journal → statements.
  - `socket.integration.test.ts` — out-of-turn rolls, broadcast fan-out, reconnect
    with token, pause blocking all mutators, `endTurn` authorization, teacher/team
    role guards.
- **Client** is currently exercised through the integration flow; a dedicated
  component test layer can be added without changing this architecture.

## Out of scope (MVP)

Auctions, houses/hotels, property trading, depreciation, bad debt, inventory,
taxes-as-accounting, AI opponents, real authentication, exact Monopoly board,
advanced animations, cloud deployment — see [PRD.md §4.4](PRD.md).
