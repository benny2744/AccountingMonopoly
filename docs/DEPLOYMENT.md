# Deployment

How to run Accounting Monopoly for a real classroom session. The app is designed
to be hosted on the teacher's laptop or a small school server and joined over
the local network (LAN). No cloud account, external auth, or internet access is
required.

## Two modes

| Mode | When to use | What runs |
| --- | --- | --- |
| **Dev** | While building the app | Vite dev server (:5173) + Express server (:5000). Vite proxies `/api` and `/socket.io` to the server. |
| **Classroom** | During a class | A single Node process runs the Express server (:5000), which also serves the built client bundle. Everyone hits `http://<LAN-IP>:5000`. |

This document covers the **classroom** mode.

> **Recommended:** use [Docker](DOCKER.md) (`docker compose up --build -d`) —
> no Node/pnpm install on the host, reproducible builds, and persistent
> `./data/game.db`. After major upgrades, wipe `./data` and create a fresh room.

## Prerequisites on the host machine

- **Node.js 22+** and **pnpm 9+**.
- A stable LAN IP reachable from student devices (school Wi-Fi or a dedicated
  access point). Confirm with `ping <host-LAN-IP>` from a student device.
- Port **5000** open on the host (check firewall / `ufw allow 5000/tcp`).
- All student devices have a modern browser. No install needed.

## Build the client

From the repository root on the host:

```bash
pnpm install --frozen-lockfile
pnpm --filter @amono/client build
```

This produces `apps/client/dist/`. The server is configured to serve this
directory when it exists, so students load the React app straight from the
server.

## Run the server

```bash
pnpm --filter @amono/server start
```

The server listens on `0.0.0.0:5000` (binds to all interfaces so LAN clients
can reach it). You should see a startup log confirming the port and the SQLite
file path.

### Running as a long-lived process

For a classroom session, keep the server alive even if your terminal closes:

```bash
# Option A: nohup (simplest)
nohup pnpm --filter @amono/server start > /tmp/amono-server.log 2>&1 &

# Option B: a terminal multiplexer you already use (tmux/screen)
tmux new -s amono 'pnpm --filter @amono/server start'
```

To stop it: `pkill -f "@amono/server"` or kill the tmux session.

## Find the LAN IP

On the host:

- macOS: `ipconfig getifaddr en0` (or `en1` for Wi-Fi).
- Linux: `hostname -I` (pick the address on the classroom network).

Example: if the host is `10.0.5.137`:

- Teacher opens: <http://10.0.5.137:5000>
- Students join: <http://10.0.5.137:5000/join>

## Running a class session

1. **Teacher** opens the host URL in a browser and clicks **Create Teacher Room**.
2. Fill in room name, teacher PIN, difficulty (Cash or Accrual), number of
   teams, property allocation, starting cash, and credit limit.
3. The lobby shows a **room code** and a copyable **join URL**. Share the URL
   (or the room code) with students.
4. **Students** open the URL on their devices, pick a team, and wait in the lobby.
5. Teacher clicks **Start**. Turns proceed server-side; only the current team
   can roll.
6. After each money event, the active student submits a journal entry. The
   server validates it and (per the room's journal entry mode) auto-posts the
   counterparty entry. Event cards and tax tiles show a reveal popup (with
   signed amounts) before the journal form; both wait until dice and piece
   movement finish. All event-card expenses post to **Event Expense**.
7. Teacher can pause/resume, force the next turn, reveal the correct entry
   (with confirmation), override mistakes, end the game, clone settings for a
   new room, and trigger year-end from the teacher dashboard.
8. Open the **Display** URL on the projector for the shared board, leaderboard,
   and celebration banners.
9. At the end, use **Export** to download the game summary as JSON or CSV.
   On the **Statements** tab, students review closed-year income after
   year-end — the view defaults to the last closed year; use the year
   selector (when `currentYear > 1`) to switch to the current year or prior
   years.

## Data and persistence

- All state lives in a SQLite database file under `data/` (gitignored). The
  exact filename is logged at server startup.
- The database is the durable record of the session. If the server restarts,
  it reloads state from `game_events` and resumes.
- To start a fresh session, stop the server and delete or move the `data/`
  directory.

### Backups

To back up mid-session, copy the SQLite file (SQLite handles concurrent reads
safely; a brief copy is fine):

```bash
cp data/<file>.db data/backup-$(date +%Y%m%d-%H%M).db
```

## Networking notes

- The app uses **WebSocket fallback to long polling** via Socket.IO, so it works
  on restrictive school networks that block raw WebSockets.
- If students can load the page but live updates do not arrive, check that port
  5000 is open in both directions and that the school network allows
  device-to-device traffic. Some "client isolation" Wi-Fi setups block this —
  disable client isolation for the classroom SSID if needed.
- For very large classes, one server process handles a single room well; if you
  need multiple concurrent rooms, run additional server instances on different
  ports.

## Updating the app

```bash
git pull
pnpm install --frozen-lockfile
pnpm --filter @amono/client build
# restart the server process
```

The SQLite schema is managed by Drizzle; if a migration is needed it will be
noted in [CHANGELOG.md](../CHANGELOG.md).

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Students see "cannot reach server" | Wrong LAN IP, port 5000 blocked, or client-isolation enabled on Wi-Fi. |
| Page loads but no live updates | Socket.IO cannot connect — check firewall and network isolation. |
| `pnpm --filter @amono/client build` fails | Run `pnpm build` from root to see type errors across packages. |
| Server crashes on startup | Check the SQLite file is writable and not locked by another process. |
| Need to start over | Stop server, delete `data/`, restart. |
