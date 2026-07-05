# Phase 3 — Multiplayer Classroom Rooms

Goal (PRD §26.3): students join from their own devices via LAN IP + room code; teacher, teams, and a projector display stay synchronized over Socket.IO; state survives refresh/disconnect; SQLite persists everything.

Depends on: Phase 2 playable game (including the `turnPhase` state machine, teacher PIN verification at start, and negative-cash guard from the Phase 1–2 review fixes).

## 0. Current repo baseline (post Phase 2 fixes)

Phase 2 already ships:

- `turnPhase` on the game row: `"awaiting_roll" | "resolving" | "awaiting_end"` — enforced in `roll` / `endTurn` / `markPendingDone` (`apps/server/src/services/turnService.ts`).
- Client `BottomBar` keys off `game.turnPhase` (`apps/client/src/routes/GamePage.tsx`).
- Teacher PIN verified via `sha256` at `startGame` (`apps/server/src/services/gameService.ts`).
- Persistence via `node:sqlite` + hand-written SQL schema (`apps/server/src/db/schema.ts`), not Drizzle/better-sqlite3.
- Routes use `/game/:gameId` (UUID), not `/game/:roomCode`; room codes are 5 chars (`apps/server/src/util/ids.ts`).

Phase 3 builds on this — do not re-implement the turn loop; wire multiplayer and role screens around it.

## 1. Session & identity model (no auth, PRD §4.4)

- On join, the server issues a `sessionToken` (UUID) bound to `{gameId, role: "teacher" | "team" | "display", teamId?}` stored in a new `sessions` table. Client keeps it in `localStorage`, sends it in the Socket.IO handshake `auth` and as a header on REST calls.
- Teacher identity = correct PIN at join time → teacher session. Students pick a team slot → team session (multiple students may share one team; they share control).
- Refresh/reconnect: handshake with an existing token restores role and re-joins the room — no rejoin flow needed (PRD §27.3 refresh/reconnect cases).

## 2. Socket.IO layer (`apps/server/src/socket.ts`)

Rooms keyed by `roomCode`. Implement the PRD §19.2 contract:

**Client → server** (all Zod-validated, all re-checked against session role/team):

- `join_room {roomCode, teamId? | displayMode?}` / `teacher_join {roomCode, pin}`
- `request_roll`, `request_resolve_event {choice}`, `submit_journal_entry {debitAccount, creditAccount, amount}`, `request_year_end`
- Teacher-only: `pause_game`, `resume_game`, `force_next_turn`, `reveal_answer`, `override {action, payload}`

**Server → clients:**

- `game:state_updated` — the composite snapshot from `getGameState`, broadcast after every mutation. Must include `game.turnPhase` and `game.currentTeamId` so clients drive Roll / End Turn / waiting banners without inferring from filtered `pending` rows. Snapshot is small (one classroom game), so full-state broadcast is simpler and safer than diffs.
- `game:turn_changed`, `game:event_created`, `game:journal_entry_posted`, `game:year_end_started`, `game:year_end_completed`, `game:error {code, message}` (sent only to the offending socket).

Refactor Phase 2 so REST routes and socket handlers call the same service functions (`roll`, `endTurn`, `resolveChoice`, `submitJournalEntry`); socket handlers just add broadcast. Those services already enforce `turnPhase` — socket handlers inherit roll/end-turn guards for free. Keep REST for setup/queries, sockets for gameplay (PRD §19).

**Dependencies:** `socket.io` is already in `apps/server/package.json`. Add `socket.io-client` to `apps/client/package.json`.

**Per-game action serialization**: wrap mutating service calls in a per-`gameId` in-process mutex (simple promise queue) so two students on one team clicking simultaneously can't double-apply. `node:sqlite` is synchronous (same property the plan originally assumed for better-sqlite3), which helps, but the queue guards multi-step service logic.

**`journalEntryMode` setting:** stored in game settings but not yet read — `submitJournalEntry` unconditionally auto-posts counterparty entries. Implement mode switching in Phase 3 (respect `autoPostCounterparty` vs `activeTeamOnly` / `bothTeams` per PRD §17.1) before multiplayer exposes rent across teams at scale.

## 3. Join flow & lobby (PRD §20.1–§20.3)

**Room-code routing (migration from Phase 2):** the client currently navigates to `/game/:gameId` (UUID). Phase 3 must add a lookup endpoint (e.g. `GET /api/rooms/:roomCode` → `{ gameId, status, … }`) and migrate routes to `/game/:roomCode`, `/teacher/:roomCode`, `/display/:roomCode`. Room codes are currently **5 characters** (`apps/server/src/util/ids.ts`); decide whether to keep 5 or align to the PRD's 6-char spec before shipping join URLs.

- `/join` page: room code input → team slot picker showing colors and who's already on each team → lands on `/game/:roomCode` as that team.
- Lobby state (`status === "lobby"`): teacher sees room code (huge, projector-friendly), copyable join URL `http://<LAN-IP>:5000/join?code=XXXX` (server reports its LAN address(es) via `os.networkInterfaces()` in `GET /api/games/:id` or the room lookup endpoint), team list with join status, settings summary, Start button. Students see room code, their team, "waiting for teacher".
- Start disabled until at least 2 teams have a member (teacher can override and start anyway for demo purposes). `startGame` already verifies the teacher PIN via `sha256` against `teacherPinHash`; `teacher_join {roomCode, pin}` reuses the same check for teacher sessions.

## 4. Role-specific screens

Split the Phase 2 single screen into three routes sharing the Board/Sidebar/Log components:

### `TeamDashboard` (`/game/:roomCode`) — PRD §20.5

- Board + sidebar as in Phase 2, but Roll / End Turn / status messaging key off **`game.turnPhase` + `game.currentTeamId`** (already implemented in Phase 2 `BottomBar`): Roll only when `turnPhase === "awaiting_roll"` and it's this team's turn; End Turn when `turnPhase === "awaiting_end"`; "Resolve pending action…" when `turnPhase === "resolving"`. Other teams see a "Waiting for Team X…" banner (PRD §28.1).
- Pending action modals and the JournalEntryPanel appear only for the acting team; other teams see a read-only "Team Red is recording a journal entry…" status line.
- Tabs: Board | My T-Accounts | My Statements (own team only, PRD §16.2).

### `TeacherDashboard` (`/teacher/:roomCode`) — PRD §20.9, §24

- Top bar: game status, current team, Pause/Resume, Force Next Turn.
- Team table: cash / loan / position / stuck-indicator (pending action older than N minutes highlights amber — PRD §28.2 "which team is stuck").
- Per-team drill-in: ledger, T-accounts, statements (teacher can view all teams, §16.2).
- Pending-entry monitor: shows the active team's attempts; **Reveal answer** button pushes the correct entry to that team's screen and auto-posts it (marks entry `isStudentSubmitted: false`, attempt outcome "revealed" for Phase 5 scoring).
- Override panel (each creates a `teacher_override` GameEvent with old/new values, PRD §24): adjust cash via manual journal entry, transfer property ownership, reverse latest transaction (post a mirrored reversing entry rather than deleting — keeps the event log append-only), mark entry correct, force next turn.

### `SharedBoardPage` (`/display/:roomCode`) — PRD §20.4, §5.3

- Read-only, projector-optimized: large board, large team panel, current turn banner, last dice roll, drawn event card full-screen flash, recent-transactions ticker, leaderboard placeholder (Phase 5). No buttons; joins the room as `role: "display"`.

## 5. Pause/resume & turn enforcement

- `status: "paused"` blocks all mutating actions server-side; clients show a "Game paused by teacher" overlay.
- All action handlers re-verify: correct session, correct team, correct game status, **`turnPhase` position**, and open pending action where applicable. Server remains the sole authority (PRD §4.1). Do not rely on `pending.status === "done"` in client state — done pending rows are filtered out of `getGameState`; use `turnPhase` instead.

## 6. Production serving

- `pnpm build` builds shared, server, and client; Express serves `apps/client/dist` with an SPA fallback so `http://<LAN-IP>:5000/join` works directly on student devices.
- README gets the teacher runbook: `pnpm start`, find LAN IP, project the display URL.

## 7. Tests (PRD §27.2, §27.3)

- Socket integration tests (vitest + `socket.io-client` against an ephemeral server): two team clients + teacher join; only current team's `request_roll` succeeds; out-of-turn roll gets `game:error`; both clients receive `game:state_updated` after a posted entry; reconnect with token restores role; pause blocks actions.
- Refresh scenario: kill and recreate a client socket mid-pending-action; state snapshot restores the open modal via `pending_actions`.

## Acceptance (PRD §26.3)

- Multiple browsers stay synchronized; only the current team can roll; teacher can pause/resume; game state persists in SQLite across a server restart (reopen DB → games resume from persisted state).
