# Phase 2 — Server, Database, and Hot-Seat Playable Game

Goal (PRD §26.2): one browser, one server, multiple teams played hot-seat from the same screen. Full turn loop: roll → move → resolve → journal entry → validate → post → next team. Cash Basis mode only in this phase.

Depends on: Phase 1 engine complete.

## 1. Server scaffold (`apps/server`)

```txt
apps/server/
  package.json        (express, socket.io, better-sqlite3, drizzle-orm, zod; dev: tsx, drizzle-kit, vitest)
  drizzle.config.ts
  src/
    index.ts          (boot: open DB, run migrations, start http server on PORT=5000)
    app.ts            (express app, json middleware, /api routes, static client serving in prod)
    socket.ts         (Socket.IO wiring — stub in this phase, fully used in Phase 3)
    db/schema.ts      (Drizzle tables)
    db/client.ts
    routes/games.ts, teams.ts, ledger.ts
    services/gameService.ts, turnService.ts, eventService.ts, accountingService.ts
```

Dev runner: `tsx watch src/index.ts`. SQLite file at `data/game.db` (gitignored).

## 2. Database schema (`db/schema.ts`)

Tables mirroring PRD §18, all with text UUID PKs:

- `games` — roomCode (unique, 6 chars A–Z0–9), teacherPinHash (sha256 — no bcrypt needed for classroom LAN), difficulty, status, currentTeamId, currentTurnNumber, settings JSON, timestamps.
- `teams` — gameId FK, name, color, position, currentYear, creditLimit, isActive, joinOrder.
- `board_spaces` — gameId FK, index, name, type, propertyId?, deckType?. (Copied per-game from the preset so future custom boards need no migration.)
- `properties` — gameId FK, boardSpaceId FK, name, purchasePrice, rent, ownerTeamId?, isMortgaged.
- `accounts` — gameId, teamId, name, type, normalBalance. Seeded per team at game start from `getChartOfAccounts(difficulty)`.
- `journal_entries` + `journal_entry_lines` — per PRD §18.6/§18.7.
- `game_events` — type, payload JSON, turnId, createdAt. Append-only audit log (PRD §4.2).
- `pending_actions` — one open row per game: `{id, gameId, teamId, kind, payload JSON, expectedEntries JSON, status: "awaiting_choice" | "awaiting_journal" | "done"}`. This drives "what must happen next" and survives refreshes.
- `credit_balances` — created in Phase 4, but include the table now to avoid a migration.

## 3. Services

### `gameService.ts`

- `createGame(input)` — Zod-validated against PRD §7.1 shape; generates roomCode; seeds board spaces + properties from `boardPresets`.
- `startGame(gameId)` — creates teams (Red/Blue/Green/Yellow… colors), seeds each team's chart of accounts, posts opening entries: `Dr Cash startingCash / Cr Owner Capital` per team, then **property allocation**: randomly assign `round(ratio * propertyCount)` properties round-robin across teams, auto-posting `Dr Property / Cr Owner Capital` at purchase price with a `game_events` record each (PRD §7.2). Sets first team active, status `active`.
- `getGameState(gameId)` — the single composite snapshot the client renders: game, teams (with computed cash/loan balances via the engine), properties, board, pending action, last N game events (for the log).

### `turnService.ts` — the core loop (PRD §9.1)

- `roll(gameId, teamId)`:
  1. Reject unless `teamId === currentTeamId`, status active, no open pending action.
  2. **Interest first** (PRD §13.3): if team's Loan Payable balance > 0, compute `calculateInterestCharge`; create a pending action `interest_charge` whose expected entry is `interestPaidCash` if cash suffices, else `interestAddedToLoan`. For pacing, interest is auto-posted (system entry, `isStudentSubmitted: false`) and logged — students journal the main event of the turn, not every interest tick. Record a `game_events` row `interest_charged`.
  3. Roll 2d6 server-side; emit `roll` + `move` events; advance `position` modulo 24; if passed GO, flag year-end due (Phase 4 wires the full flow; in Phase 2 just log it and bump `currentYear`).
  4. Dispatch on landed space type → `eventService`.
- `endTurn(gameId)` — requires pending action `done`; advances `currentTeamId` by join order, increments turn number.

### `eventService.ts` — landing dispatch

Per space type:

- `property` unowned → pending action `buy_or_skip` `{propertyId, price}`.
- `property` owned by other team → pending action `rent_due`; Phase 2 is cash-only, so expected entries come from `rentPaidCash`. Insufficient cash → offer loan first (PRD §23 pattern applies to rent too: loan then pay).
- `property` owned by self / `rest` / `go` → no-op pending action auto-marked done.
- `event` → draw top card from the (shuffled per game, persisted order in game settings JSON) cash deck; pending action `event_card` with the card payload and expected entries from `entryRules`. Multi-team cards create counterparty system entries.
- `repair`, `charity`, `road_closure`, `tax` → fixed-amount space fees defined in `boardPresets` (e.g. repair 100, charity 100, road closure 120, tax 100), pending action with matching expense entry.
- `bank` → pending action `bank_stop`: option to take a loan (amount input, capped by `startingLoanLimit` minus current loan) or repay principal, or pass.

### Resolution + journal (`accountingService.ts`)

- `resolveChoice(gameId, teamId, choice)` — applies the game-state consequence (transfer property ownership, mark card resolved, create loan) and moves the pending action to `awaiting_journal` with the final `expectedEntries`.
- `submitJournalEntry(gameId, teamId, {debitAccount, creditAccount, amount})` — runs engine `validateJournalEntry`; on correct: post entry (student's own), auto-post counterparty entries when `journalEntryMode === "autoPostCounterparty"` (default, PRD §17.1), mark action done; on incorrect: increment attempt counter on the pending action, return feedback. Attempt count feeds Phase 5 scoring.
- Every posting also records a `game:journal_entry_posted`-shaped game event.

## 4. REST endpoints (PRD §19.1)

Implement now: `POST /api/games`, `GET /api/games/:gameId`, `POST /api/games/:gameId/start`, `POST /api/games/:gameId/roll`, `POST /api/games/:gameId/resolve-event`, `POST /api/games/:gameId/submit-journal-entry`, `GET .../teams/:teamId/ledger`, `GET .../teams/:teamId/t-accounts`, `GET .../teams/:teamId/statements`. Zod-validate every body; errors as `{error: {code, message}}`.

(Join/pause/resume/reveal/year-end/export land in Phases 3–5.)

## 5. Client scaffold (`apps/client`)

Vite + React + TS + Tailwind. Routes (react-router): `/` landing, `/create` room creation form (PRD §20.2 fields), `/game/:roomCode` the game screen. State: one Zustand store holding the latest `getGameState` snapshot + UI state (open modal, journal form state); in Phase 2 it refetches after every action (sockets replace polling in Phase 3).

## 6. Game screen — richup.io layout

Grid layout: `[board 60%] [sidebar 40%]` on desktop.

- **Board component**: CSS grid 7×7 ring rendering 24 spaces (corners: GO, Rest, Repair anchor spots per §8.1 ordering). Each space: name, color band for properties (grouped colors A–K in 4 hue groups), owner chip, team tokens as colored dots. Click → popover with price/rent/owner.
- **Board center**: dice display + Roll button (enabled only for the active team — hot-seat, so always visible with "Team Red, roll!" label), current pending-action summary, drawn event card render (title, description, teaching point).
- **Sidebar**: team cards (color, name, cash, property count, loan) with active-turn highlight; below, the **game log** fed from `game_events`, newest first, human-readable formatter per event type.
- **Modals** (richup-style prompts): BuyOrSkip, EventCard, BankStop (loan take/repay), FeeNotice. Each ends by opening the **JournalEntryPanel**.
- **JournalEntryPanel** (PRD §20.6): transaction description card, debit dropdown, credit dropdown (both from the mode's chart of accounts), amount input, Submit, feedback area (green correct text / red retry text). Hint button placeholder (wired in Phase 5). This panel is docked prominently under the board center — it is the pedagogical centerpiece (§28.3).
- **Tabs above sidebar**: Board | T-Accounts | Statements — T-Accounts and Statements render engine output for the currently selected team (PRD §16, §15), reusing `buildTAccounts` and `generate*` from shared.

## 7. Tests

- Service-level Vitest with an in-memory SQLite: create game → start → allocation posts opening entries → roll (seeded RNG) → land on property → buy → journal validate/post → balances via ledger endpoint → statements balance. Cover §27.3 edge cases reachable now: insufficient cash to buy (loan offer), wrong debit/credit submission, interest when cash insufficient.

## Acceptance (PRD §26.2)

- Teacher can create + start a game from the browser; teams take turns hot-seat; buy property; rent triggers between teams; cash event cards resolve; journal entries validate and update T-accounts; statements update and the balance sheet balances after every turn.
