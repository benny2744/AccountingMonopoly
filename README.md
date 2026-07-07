# Accounting Monopoly

A browser-based, multiplayer classroom game inspired by Monopoly, designed to
teach beginner accounting. Students roll, buy property, pay rent, draw event
cards, and **record every transaction as a journal entry**. The server validates
their debits/credits, posts to a ledger, and generates T-accounts and financial
statements so students see how gameplay becomes accounting.

Two difficulty modes are supported:

- **Cash Basis** — record revenue and expenses only when cash changes hands.
- **Accrual Basis** — adds accounts receivable/payable, player-to-player credit,
  prepaids, and year-end settlement.

> Accounting clarity comes first; board animations and advanced Monopoly
> mechanics are secondary.

---

## Status

Pre-1.0. The shared accounting engine, local hot-seat game, **multiplayer
classroom rooms**, and **Accrual Basis mode** (player credit, deferred
settlements, per-team year-end checklist) are implemented. Classroom UX polish
remains in [PLAN-05-CLASSROOM-POLISH.md](PLAN-05-CLASSROOM-POLISH.md).

---

## Tech stack

- **Monorepo**: pnpm workspaces — `apps/client`, `apps/server`, `packages/shared`
- **Client**: React 18 + Vite + TypeScript, Tailwind CSS, Zustand, `socket.io-client`
- **Server**: Node 22 + Express + TypeScript, Socket.IO, `node:sqlite` (hand-written SQL schema), Zod
- **Shared**: pure TypeScript accounting engine (no React/Express dependencies)
- **Tests**: Vitest everywhere; heaviest coverage in `packages/shared`

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data and control flow.

---

## Quick start

Prerequisites: **Node 22+** and **pnpm 9+**.

```bash
pnpm install

# Run client and server together (logs interleaved in one terminal):
pnpm dev
# → http://localhost:5173 (proxies /api + /socket.io to :5000)

# Or run them separately:
pnpm dev:server    # http://localhost:5000
pnpm dev:client    # http://localhost:5173

# Type-check everything:
pnpm build

# Run the full test suite:
pnpm test
```

For classroom/LAN deployment, build the client and run only the server —
students join via `http://<teacher-LAN-IP>:5000`. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Run with Docker (recommended for classrooms)

The fastest path — no Node or pnpm install needed on the host.

```bash
docker compose up --build -d
```

Then open `http://localhost:5000` (or `http://<teacher-LAN-IP>:5000` from a
student device). The SQLite database persists at `./data/game.db` on the host.

After upgrading the image across major releases (classic board, houses, etc.),
wipe `./data` once and create a fresh teacher room — see
[docs/DOCKER.md](docs/DOCKER.md#upgrade).

Full instructions: [docs/DOCKER.md](docs/DOCKER.md).

### Resetting local state

All session data lives in a SQLite file under `data/` (default
`data/game.db`; override with `DB_PATH=…`). Stop the server and delete (or
move) the `data/` directory to start a fresh session — the server recreates
the schema on next start.

## Implemented features (MVP scope)

- **Cash & accrual difficulty modes** with the PRD §10 chart of accounts
  (event cards post to **Event Expense**; Charity/Road Closure decoys removed
  from the journal dropdown — see CHANGELOG for PRD deviations).
- **Server-authoritative, event-sourced** gameplay: every state change is
  persisted as a `GameEvent` row before state mutates.
- **Multiplayer over LAN** via Socket.IO: teacher, per-team student clients,
  and a projector display, all synchronised by full-state broadcasts.
- **Per-team year-end checklist** (accrual): collect A/R, settle A/P
  (pay-cash or roll-to-loan), recognise prepaids, snapshot statements, close
  the books to Retained Earnings.
- **Learning aids**: 4-level hints (level 4 teacher-gated), teacher reveal,
  normal-balance captions on account dropdowns, softlock loan-then-pay
  affordance, stuck-team badges.
- **Scoring** per PRD §25: `netIncome + cash*0.1 − loan*0.1 + cleanBooksBonus`
  per year, with cumulative leaderboard (toggle via `showScores` setting).
- **Export**: JSON (full event-sourced record) and CSV (Excel-graded
  workbook with journal entries, balances, and scores) from the teacher
  dashboard.
- **Classic 40-space board**: Monopoly-style color groups, railroads, card-draw
  spaces (Community Chest / Chance), income & luxury tax, simplified
  houses/hotels with `Buildings` journal entries, year-end on passing GO only.
- **In-board player controls**: Roll Dice / End Turn buttons render inside the
  board's center area (no viewport overlay); event cards and tax tiles pop up a
  themed modal (Community Chest / Chance / Tax) with signed amounts before the
  journal panel.
- **Animated dice + piece movement**: tumbling 2D dice (~1.5s spin with face
  cycling) and step-through token animation that begins once the dice settles.
  Card, tax, and rent popups wait until dice + movement finish (hydrate guards
  prevent replay when switching tabs back to the board).
- **Year-scoped financial statements**: income statement and cash summary are
  filtered by fiscal year (defaults to the current year; year selector when
  `currentYear > 1` so closed years stay visible after year-end closing).
- **Two-sided journaling**: when a team pays rent (or settles a multi-team
  event card), the **receiving team** also records their own journal entry
  before the turn advances — no silent auto-posts. Teacher **Reveal Answer**
  and **Force next turn** auto-post any open counterparty entry so the
  teacher can unblock the room without lopsided books.
- **Lobby team management**: add up to 4 / remove down to 2 unjoined team
  slots before the game starts (remove-then-add reuses vacated name/color
  slots); default 2 teams.
- **Properties tab**: owned properties, house/hotel status, and rent tables for
  each team and on the teacher dashboard.
- **Multi-tab fix**: each browser tab keeps its own session token so teacher +
  team testing in one browser no longer breaks roll dice.

## Known limitations (out of scope for MVP, PRD §4.4)

Auctions, property trading, depreciation, bad debt, inventory,
taxes-as-accounting, AI opponents, real authentication, exact Monopoly board,
advanced animations, cloud deployment. The event card editor (PRD §26.5) is
also out of scope.

## MVP acceptance (PRD §31)

The MVP is acceptable when all of the following hold:

- [x] Teacher can create a game room.
- [x] Students can join teams.
- [x] Teacher can choose Cash Basis or Accrual Basis.
- [x] Teacher can set property allocation to 0%, 25%, 50%, or 75%.
- [x] Properties can be assigned at game start.
- [x] Teams can roll dice and move around the board.
- [x] Teams can buy properties.
- [x] Teams can pay and receive rent.
- [x] Cash event deck works in Cash Basis Mode.
- [x] Accrual event deck works in Accrual Basis Mode.
- [x] Students must submit debit and credit accounts after transactions.
- [x] System validates journal entries.
- [x] Journal entries post to T-accounts.
- [x] Income statement and balance sheet generate correctly.
- [x] Cash summary generates correctly.
- [x] In Accrual Mode, A/R and A/P are tracked.
- [x] In Accrual Mode, players can pay rent on credit.
- [x] In Accrual Mode, prepaids adjust at year-end.
- [x] Passing GO triggers year-end.
- [x] Loans charge interest per dice roll.
- [x] Teacher can pause, reveal answer, and force next turn.

---

## Repository layout

```
apps/
  client/          React + Vite frontend (board, dashboards, journal entry form)
  server/          Express + Socket.IO server, SQLite persistence, game services
packages/
  shared/          Pure accounting engine, types, board presets, event card decks
docs/              Development, deployment, and Docker guides
PRD.md             Product requirements (source of truth)
PLAN-00..05-*.md   Per-phase implementation plans
ARCHITECTURE.md    System architecture, data flow, data model
CHANGELOG.md       Release history
AGENTS.md          Guidance for AI coding agents working in this repo
```

Detailed dev workflow: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Plans and specs

The product is fully specified in the root documents:

- [PRD.md](PRD.md) — product requirements, accounts, event decks, screens, API.
- [PLAN-00-OVERVIEW.md](PLAN-00-OVERVIEW.md) — phase index and locked
  technical decisions.
- [PLAN-01-ACCOUNTING-ENGINE.md](PLAN-01-ACCOUNTING-ENGINE.md) — shared engine.
- [PLAN-02-LOCAL-GAME.md](PLAN-02-LOCAL-GAME.md) — local hot-seat game.
- [PLAN-03-MULTIPLAYER.md](PLAN-03-MULTIPLAYER.md) — Socket.IO rooms.
- [PLAN-04-ACCRUAL-MODE.md](PLAN-04-ACCRUAL-MODE.md) — accrual concepts.
- [PLAN-05-CLASSROOM-POLISH.md](PLAN-05-CLASSROOM-POLISH.md) — UX, hints, export.

---

## Contributing

This project is early stage. If you have access and want to contribute, read
[ARCHITECTURE.md](ARCHITECTURE.md) and the relevant `PLAN-*.md` first, keep the
accounting engine pure, and run `pnpm build && pnpm test` before committing.
AI coding agents should read [AGENTS.md](AGENTS.md).

---

## License

[MIT](LICENSE) © Benny
