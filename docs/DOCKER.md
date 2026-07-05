# Docker deployment

The fastest way to run Accounting Monopoly for a class. The image bundles
the built client and the Node 22 + Socket.IO server into a single container;
students join over the LAN at `http://<teacher-LAN-IP>:5000`.

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

First build takes ~2 minutes (installs pnpm deps + builds the client). Watch
the logs with:

```bash
docker compose logs -f amono
```

You should see `Accounting Monopoly server listening on http://0.0.0.0:5000`.

Verify the API:

```bash
curl http://localhost:5000/api/health
# → {"ok":true}
```

## Find the LAN IP for students

```bash
# Linux
hostname -I
# macOS
ipconfig getifaddr en0
# Docker host (any OS)
docker compose exec amono wget -qO- http://localhost:5000/api/games/meta/lan-info
```

Share `http://<LAN-IP>:5000/join` with students. The teacher opens the same
URL and clicks **Create Teacher Room**.

## Where the data lives

The SQLite database is bind-mounted at **`./data/game.db`** on the host
(see `docker-compose.yml`). It survives container rebuilds, restarts, and
upgrades.

```bash
ls -la data/
# game.db  game.db-shm  game.db-wal   ← WAL mode keeps 3 files; treat them as a set
```

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
reproducible. The schema is migrated on startup; new columns are added
with `ALTER TABLE … ADD COLUMN` and tolerate databases from prior phases.

### Back up the database mid-session

Stop the container first (WAL mode needs a clean shutdown to flush `-wal`
into the main file):

```bash
docker compose stop
cp data/game.db data/backup-$(date +%Y%m%d-%H%M).db
docker compose start
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
| Healthcheck stuck "unhealthy" | Check `docker compose logs amono` for a port conflict or DB-permission error on `./data`. |
| Students can't reach the server | Wrong LAN IP, port 5000 blocked, or client-isolation enabled on the school Wi-Fi. |
| Build fails on `pnpm install` | Ensure `pnpm-lock.yaml` is committed; delete `node_modules/` and re-run. |
| Database locked / WAL files growing | Stop the container cleanly (`docker compose stop`) before backing up. |
| Want to start over | `docker compose down && rm -rf data && docker compose up -d`. |

## How the image is structured

- **Stage 1 (`build`)**: installs all workspace deps, runs
  `pnpm --filter @amono/client build`, produces `apps/client/dist/`.
- **Stage 2 (`runtime`)**: re-installs full deps (server runs TypeScript via
  `tsx`), copies `packages/shared/src`, `apps/server/src`, and the prebuilt
  client. Runs as the non-root `node` user. Listens on `0.0.0.0:5000`.

The Express server serves the built client bundle with an SPA fallback, so
`/join`, `/game/:code`, `/teacher/:code`, and `/display/:code` all work
directly on student devices without a separate web server.
