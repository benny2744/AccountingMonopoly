# Development

How to set up and work on Accounting Monopoly locally.

## Prerequisites

- **Node.js 22+** — check with `node -v`.
- **pnpm 9+** — enable with `corepack enable` if you have Node, or
  `npm install -g pnpm`.
- A UNIX-like shell (macOS/Linux, or WSL on Windows). SQLite is provided via
  Node's built-in `node:sqlite`; no separate DB server required.

## First-time setup

```bash
git clone <repo-url> AccountingMonopoly
cd AccountingMonopoly
pnpm install
```

This installs dependencies for the root plus all three workspace packages
(`apps/client`, `apps/server`, `packages/shared`). pnpm hoists sensibly via the
lockfile; do not delete `pnpm-lock.yaml`.

## Repository layout

See [ARCHITECTURE.md](../ARCHITECTURE.md) for a full map. The short version:

```
apps/client      React + Vite frontend
apps/server      Express + Socket.IO server, SQLite persistence
packages/shared  Pure accounting engine + types + game definitions
docs/            This file and DEPLOYMENT.md
```

## Running in development

You need two processes in dev: the Vite dev server (with HMR) and the Express +
Socket.IO server. Vite proxies `/api` and `/socket.io` to the server.

```bash
# Terminal 1 — server on :5000
pnpm --filter @amono/server dev

# Terminal 2 — client on :5173
pnpm --filter @amono/client dev
```

Open <http://localhost:5173>. The client talks to the server through the Vite
proxy, so room creation, rolls, and Socket.IO events all work end-to-end.

### Classroom flow (dev)

1. Teacher: `/create` → lobby at `/lobby/:roomCode`.
2. Students: `/join` or `/join/:code` → pick a team → `/game/:roomCode`.
3. Teacher starts when at least two teams have joined (or uses "Start anyway").
4. Optional projector display: `/display/:roomCode`.

Session tokens are stored in `localStorage` (`amono.sessionToken`) and sent on
REST (`Authorization: Bearer …`) and Socket.IO handshake `auth.token`.

### Why two processes?

In dev we want HMR and React Fast Refresh from Vite. In classroom mode the
server serves the built client bundle, so only one process is needed — see
[DEPLOYMENT.md](DEPLOYMENT.md).

## Useful scripts

Run from the repository root unless noted.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install all workspace dependencies. |
| `pnpm build` | Type-check the whole monorepo (root `tsc --noEmit`). |
| `pnpm typecheck` | Type-check each package individually. |
| `pnpm test` | Run the full Vitest suite once. |
| `pnpm test:watch` | Run Vitest in watch mode. |
| `pnpm test:coverage` | Run tests with V8 coverage. |
| `pnpm --filter @amono/client dev` | Vite dev server on :5173. |
| `pnpm --filter @amono/client build` | Type-check + build the client to `apps/client/dist`. |
| `pnpm --filter @amono/server dev` | Run server with `tsx watch` on :5000. |
| `pnpm --filter @amono/server start` | Run server once (no watch). |
| `pnpm --filter @amono/shared test` | Run only the shared-engine tests. |

The root `pnpm lint` script is a placeholder ("no linter configured"). Add a
real linter (e.g. ESLint or oxlint) before relying on it.

## Environment variables

None are required for local dev. The server reads/writes a SQLite database file
in `data/` (gitignored). If you later add env-driven config, document it here
and validate it with Zod at startup.

## Working with the shared package

`@amono/shared` exposes TypeScript source directly (no build step needed in
dev). Its `package.json` `exports` map points at `./src/index.ts`,
`./src/accounting/index.ts`, and `./src/game/index.ts`, so you can import:

```ts
import type { GameEvent } from "@amono/shared";
import { postJournalEntry } from "@amono/shared/accounting";
import { SIMPLE_BOARD } from "@amono/shared/game";
```

When you change shared code, the server and client pick it up on their next
type-check / reload.

## Testing

- Tests are colocated with source as `*.test.ts`.
- The accounting engine has the densest coverage, including the two PRD §32
  acceptance scenarios (`scenarioA.test.ts`, `scenarioB.test.ts`).
- Server integration tests live in
  `apps/server/src/services/game.integration.test.ts` (REST) and
  `apps/server/src/services/socket.integration.test.ts` (Socket.IO + sessions).
- Add a test whenever you touch accounting logic or a game rule. Match the
  existing naming pattern.

Run a single file:

```bash
pnpm test packages/shared/src/accounting/statements.test.ts
```

## Debugging tips

- Server logs every `GameEvent` it appends; watch the terminal running
  `pnpm --filter @amono/server dev`.
- The SQLite file lives under `data/`. Use `sqlite3 data/<file>.db` to inspect
  `games`, `teams`, `game_events`, `journal_entries`, etc.
- To reset local state, stop the server and delete the `data/` directory.

## Before you push

Always run:

```bash
pnpm build && pnpm test
```

Keep the shared accounting engine green at all times — it is the contract both
apps depend on.
