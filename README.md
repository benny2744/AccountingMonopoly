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

Pre-1.0. The shared accounting engine and a local hot-seat game are in place;
multiplayer rooms, accrual mode polish, and classroom UX are tracked in the
phase plans (see [Plans](#plans-and-specs)).

---

## Tech stack

- **Monorepo**: pnpm workspaces — `apps/client`, `apps/server`, `packages/shared`
- **Client**: React 18 + Vite + TypeScript, Tailwind CSS, Zustand, `socket.io-client`
- **Server**: Node 22 + Express + TypeScript, Socket.IO, better-sqlite3 + Drizzle ORM, Zod
- **Shared**: pure TypeScript accounting engine (no React/Express dependencies)
- **Tests**: Vitest everywhere; heaviest coverage in `packages/shared`

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data and control flow.

---

## Quick start

Prerequisites: **Node 22+** and **pnpm 9+**.

```bash
pnpm install

# Run client and server together in dev (in separate terminals):
pnpm --filter @amono/client dev    # http://localhost:5173 (proxies /api + /socket.io to :5000)
pnpm --filter @amono/server dev    # http://localhost:5000

# Type-check everything:
pnpm build

# Run the full test suite:
pnpm test
```

For classroom/LAN deployment, build the client and run only the server —
students join via `http://<teacher-LAN-IP>:5000`. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Repository layout

```
apps/
  client/          React + Vite frontend (board, dashboards, journal entry form)
  server/          Express + Socket.IO server, SQLite persistence, game services
packages/
  shared/          Pure accounting engine, types, board presets, event card decks
docs/              Development and deployment guides
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
