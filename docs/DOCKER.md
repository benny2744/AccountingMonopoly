# Docker deployment

The fastest way to run Accounting Monopoly for a class. The image bundles
the built client and the Node 22 + Socket.IO server into a single container;
students join over the LAN at `http://<teacher-LAN-IP>:5000`.

**Current image includes:** classic 40-space Monopoly-style board, houses/hotels,
railroads, card-draw spaces, pass-GO year-end, two-sided rent journaling
(payer + receiver), lobby team add/remove (2–4 teams), hints/scoring/export,
animated dice with modal gating (cards/tax wait for dice + piece movement;
current-tile highlight follows the token), year-scoped financial statements
(default to last closed year after year-end), in-board controls, properties tab,
teacher recovery tools (Reveal Answer, Force next turn with counterparty auto-post),
and English/Chinese language toggle with localized CSV export.

## What you need

- A host with **Docker 24+** and the **Docker Compose plugin** (`docker compose`)
  — Linux, macOS, or Windows.
- A LAN IP reachable from student devices (school Wi-Fi or a dedicated AP).
- Port **5000** open on the host firewall.

## Quick start

```bash
git clone <repo-url> AccountingMonopoly
cd AccountingMonopoly
docker compose up --build -d
```

First build takes ~2 minutes (installs pnpm deps, type-checks shared + client,
builds the Vite bundle). Watch the logs with:

```bash
docker compose logs -f amono
```

You should see `Accounting Monopoly server listening on http://0.0.0.0:5000`.

Verify the API:

```bash
curl http://localhost:5000/api/health
# → {"ok":true}
```

Open the app in a browser:

```bash
# Teacher (same host)
open http://localhost:5000/join

# Or from any device on the LAN
open http://<LAN-IP>:5000/join
```

Routes served by the bundled SPA (no separate web server):

| URL | Role |
| --- | --- |
| `/join` | Students pick a team; teacher creates a room |
| `/teacher/:roomCode` | Teacher dashboard |
| `/game/:roomCode` | Team dashboard (roll, journal, build houses) |
| `/display/:roomCode` | Projector / read-only display |

## Find the LAN IP for students

```bash
# Linux
hostname -I
# macOS
ipconfig getifaddr en0
# From inside the container
docker compose exec amono wget -qO- http://localhost:5000/api/games/meta/lan-info
```

Share `http://<LAN-IP>:5000/join` with students. The teacher opens the same
URL and clicks **Create Teacher Room**.

**Multi-tab tip:** each browser tab keeps its own session token
(`sessionStorage`), so you can open teacher + team dashboards in separate tabs
on one machine without breaking Roll Dice.

## Where the data lives

The SQLite database is bind-mounted at **`./data/game.db`** on the host
(see `docker-compose.yml`). It survives container rebuilds, restarts, and
upgrades.

```bash
ls -la data/
# game.db  game.db-shm  game.db-wal   ← WAL mode keeps 3 files; treat them as a set
```

On startup the server runs **guarded schema migrations** (`ALTER TABLE … ADD
COLUMN`) for Phase 4/5 and classic-board columns (`properties.houses`,
`kind`, `color_group`, `hints_used`, score columns, etc.). Existing databases
pick up new columns automatically.

> **Important:** board layout and spaces are fixed when a game is **created**.
> After upgrading to a build with the classic 40-space board, **in-progress or
> lobby games from an older image may behave incorrectly** even though columns
> migrate. For a clean classroom session, wipe `./data` once after a major
> upgrade (see below) and create a fresh room.

## Day-to-day operations

### Stop / start

```bash
docker compose stop          # pause without losing data
docker compose start         # resume
docker compose down          # stop + remove container (data/ is preserved)
```

### Upgrade

```bash
git pull
docker compose up --build -d
```

The `pnpm-lock.yaml` is `--frozen-lockfile`-locked, so the build is
reproducible. Schema columns migrate on startup.

**After a major release** (classic board, houses, counterparty journaling):

```bash
docker compose down
rm -rf data/                 # optional but recommended — stale rooms confuse testing
docker compose up --build -d
```

Then create a **new teacher room** and verify roll → buy/rent → journal →
export from the teacher dashboard.

### Back up the database mid-session

Stop the container first (WAL mode needs a clean shutdown to flush `-wal`
into the main file):

```bash
docker compose stop
cp data/game.db data/backup-$(date +%Y%m%d-%H%M).db
docker compose start
```

Teacher export (no stop required for a snapshot, but stop is safer for file copy):

```bash
curl -H "Authorization: Bearer <teacher-token>" \
  "http://localhost:5000/api/games/<gameId>/export?format=json" -o session.json
```

### Reset to a fresh game

```bash
docker compose down
rm -rf data/
docker compose up -d
```

The server recreates the schema on next start.

### Inspect the database

```bash
docker compose exec amono sh -c 'apk add sqlite && sqlite3 /data/game.db'
# or, from the host, if sqlite3 is installed:
sqlite3 data/game.db
```

Useful queries:

```sql
.tables
SELECT room_code, status, difficulty FROM games;
SELECT name, kind, houses, color_group FROM properties LIMIT 10;
SELECT type, COUNT(*) FROM game_events GROUP BY type;
```

## Multi-architecture builds (amd64 + arm64)

The Dockerfile is arch-neutral: `node:22-alpine` ships both `linux/amd64`
and `linux/arm64`, and there are no native dependencies.

Default `docker compose up --build` builds for **your host's architecture**
— so if you're on an M-series Mac, you get arm64; on a Windows/Linux x86
laptop, you get amd64.

To cross-build (e.g., build on an M-series Mac to deploy to a school x86
Windows PC):

```bash
# One-time setup
docker run --privileged --rm tonistiigi/binfmt --install all

# Build amd64 on an arm64 host (or vice versa). Note: `--load` only works
# for a single platform at a time, so pick the deployment arch.
docker buildx build --platform linux/amd64 -t accounting-monopoly:latest --load .
docker compose up -d
```

For a true multi-arch image you'd need to push to a registry — out of scope
for this local-build setup.

## Configuration

Environment variables (override in `docker-compose.yml` or with `-e`):

| Variable   | Default          | Purpose                                  |
| ---------- | ---------------- | ---------------------------------------- |
| `PORT`     | `5000`           | Server listen port (also `EXPOSE`d).     |
| `DB_PATH`  | `/data/game.db`  | SQLite file path inside the container.   |
| `NODE_ENV` | `production`     | Set by the Dockerfile; no need to change.|

To change the host port:

```yaml
services:
  amono:
    ports:
      - "80:5000"   # students hit http://<LAN-IP> directly
```

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `docker compose` not found | Install the Compose plugin (Docker Desktop includes it; on Linux: `apt install docker-compose-plugin`). |
| Healthcheck stuck "unhealthy" | Check `docker compose logs amono` for a port conflict or DB-permission error on `./data`. Allow 15s start period for migrations. |
| Students can't reach the server | Wrong LAN IP, port 5000 blocked, or client-isolation enabled on the school Wi-Fi. |
| Build fails on `pnpm install` | Ensure `pnpm-lock.yaml` is committed; delete local `node_modules/` and re-run. |
| Build fails on `tsc` | Fix TypeScript errors locally with `pnpm build` before rebuilding the image. |
| Roll Dice does nothing / 401 | Multiple roles in one tab overwrote the session token in older builds; use **separate tabs** (current client uses per-tab `sessionStorage`). |
| Board looks wrong after upgrade | Wipe `./data`, rebuild, and create a **new room** — old games keep their original board rows. |
| Rent stuck waiting for receiver | Expected with two-sided journaling; receiver opens their team tab and journals, or teacher uses **Reveal Answer** / **Force next turn**. |
| Database locked / WAL files growing | Stop the container cleanly (`docker compose stop`) before backing up. |
| Want to start over | `docker compose down && rm -rf data && docker compose up -d`. |

## How the image is structured

- **Stage 1 (`build`)**: installs workspace deps, type-checks `packages/shared`
  and `apps/client`, runs `pnpm --filter @amono/client build`, produces
  `apps/client/dist/`.
- **Stage 2 (`runtime`)**: re-installs full workspace deps (server runs
  TypeScript via `tsx`), copies `packages/shared/src`, `apps/server/src`, and
  the prebuilt client bundle. Runs as **root** so the bind-mounted `./data`
  directory is writable on any host uid. Listens on `0.0.0.0:5000`.

The Express server serves the built client bundle with an SPA fallback, so
`/join`, `/game/:code`, `/teacher/:code`, and `/display/:code` all work
directly on student devices without a separate web server. Socket.IO shares
the same origin and port — no reverse-proxy WebSocket config needed for the
default compose setup.
