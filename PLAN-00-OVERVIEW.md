# Accounting Monopoly — Implementation Plan Overview

Source requirements: [PRD.md](PRD.md). This file indexes the per-phase implementation plans and records the cross-cutting decisions they all rely on.

## Phase index

| Phase | Plan file | Goal | Ships when |
| --- | --- | --- | --- |
| 1 | [PLAN-01-ACCOUNTING-ENGINE.md](PLAN-01-ACCOUNTING-ENGINE.md) | Monorepo scaffold + pure shared accounting engine with tests | PRD §32 Scenario A & B tests pass |
| 2 | [PLAN-02-LOCAL-GAME.md](PLAN-02-LOCAL-GAME.md) | Server, DB, and a hot-seat playable game in one browser | PRD §26.2 acceptance criteria |
| 3 | [PLAN-03-MULTIPLAYER.md](PLAN-03-MULTIPLAYER.md) | Socket.IO rooms, student join, teacher/team/projector screens | PRD §26.3 acceptance criteria |
| 4 | [PLAN-04-ACCRUAL-MODE.md](PLAN-04-ACCRUAL-MODE.md) | Accrual accounts, player credit, prepaids, year-end settlement | PRD §26.4 acceptance criteria |
| 5 | [PLAN-05-CLASSROOM-POLISH.md](PLAN-05-CLASSROOM-POLISH.md) | Hints, scoring, export, reset, projector polish, README | PRD §26.5 acceptance criteria |

Each phase builds on the previous one; do not start a phase before the prior phase's acceptance checks pass.

## Locked technical decisions

These resolve every "either/or" the PRD leaves open. All phase plans assume them.

- **Monorepo**: pnpm workspaces with `apps/client`, `apps/server`, `packages/shared` (PRD §29 layout).
- **Client**: React 18 + Vite + TypeScript, Tailwind CSS, Zustand for client state, `socket.io-client`, `react-router-dom`.
- **Server**: Node 22, Express + TypeScript, Socket.IO, **better-sqlite3 + Drizzle ORM** (chosen over Prisma: zero codegen daemon, synchronous API fits a single-process LAN server), Zod for all request/socket payload validation.
- **Tests**: Vitest everywhere. The shared engine carries the heaviest coverage (PRD §27.1).
- **Serving model**: in dev, Vite (5173) proxies `/api` and `/socket.io` to the server (5000). In classroom mode, Express serves the built client from `apps/client/dist` so the teacher runs one process and everyone uses `http://<LAN-IP>:5000`.
- **IDs**: `crypto.randomUUID()`. **Money**: integer dollars only (the PRD has no cents anywhere); validate integers ≥ 0 at boundaries.
- **Authority**: server-authoritative, event-sourced. Clients emit action requests; the server validates, persists a `GameEvent` row, applies state, and broadcasts. Clients never compute official outcomes.

## Richup.io UI/UX conventions we adopt

Applies mainly to Phases 2, 3, 5:

- Central square board with spaces around the edge and an info panel (dice, current action, event card) in the middle.
- Right sidebar: team list with color chips, cash balances, active-turn highlight, and a scrolling game log of plain-language entries ("Team Red rolled 7", "Team Blue paid $120 rent to Team Red").
- Clicking any board space opens a detail popover (price, rent, owner).
- Turn flow driven by modal prompts: buy/skip, rent payment method (accrual), event card reveal.
- Lobby: room code, copyable join URL, team slots with colors, teacher-only Start button.
- **Classroom adaptation**: every resolved money action flows into the journal entry form (debit/credit dropdowns, amount, hints, feedback). This form gets more visual weight than the board itself (PRD §28.3).

## Out of scope for MVP (PRD §4.4, §30.2)

Auctions, property trading, depreciation, bad debt, inventory, taxes-as-accounting, AI opponents, real auth, exact Monopoly board, advanced animations, cloud deployment.
