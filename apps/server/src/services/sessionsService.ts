import { getDb } from "../db/client.js";
import { queries } from "../db/queries.js";
import { sha256, uuid, now } from "../util/ids.js";
import { GameError } from "./gameService.js";

export type SessionRole = "teacher" | "team" | "display";

export interface Session {
  token: string;
  gameId: string;
  role: SessionRole;
  teamId: string | null;
  displayName: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface SessionRow {
  token: string;
  game_id: string;
  role: string;
  team_id: string | null;
  display_name: string | null;
  created_at: string;
  last_seen_at: string;
}

function rowToSession(r: SessionRow): Session {
  return {
    token: r.token,
    gameId: r.game_id,
    role: r.role as SessionRole,
    teamId: r.team_id,
    displayName: r.display_name,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
  };
}

export function getSession(token: string): Session | null {
  const r = getDb().prepare("SELECT * FROM sessions WHERE token = ?").get(token) as SessionRow | undefined;
  return r ? rowToSession(r) : null;
}

export function touchSession(token: string): void {
  getDb().prepare("UPDATE sessions SET last_seen_at = ? WHERE token = ?").run(now(), token);
}

/** Verify teacher PIN and issue a teacher session bound to the game. */
export function createTeacherSession(gameId: string, teacherPin: string): Session {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (sha256(teacherPin) !== game.teacherPinHash) {
    throw new GameError("INVALID_PIN", "Incorrect teacher PIN");
  }
  return insertSession({ gameId, role: "teacher", teamId: null, displayName: "Teacher" });
}

/** Issue a team session. Multiple students can share a team. */
export function createTeamSession(gameId: string, teamId: string, displayName?: string): Session {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  const team = queries.teamsByGame(gameId).find((t) => t.id === teamId);
  if (!team) throw new GameError("NOT_FOUND", "Team not found");
  return insertSession({ gameId, role: "team", teamId, displayName: displayName ?? null });
}

export function createDisplaySession(gameId: string): Session {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  return insertSession({ gameId, role: "display", teamId: null, displayName: "Display" });
}

function insertSession(input: {
  gameId: string;
  role: SessionRole;
  teamId: string | null;
  displayName: string | null;
}): Session {
  const token = uuid();
  const ts = now();
  getDb()
    .prepare(
      `INSERT INTO sessions (token, game_id, role, team_id, display_name, created_at, last_seen_at) VALUES (?,?,?,?,?,?,?)`,
    )
    .run(token, input.gameId, input.role, input.teamId, input.displayName, ts, ts);
  return { token, gameId: input.gameId, role: input.role, teamId: input.teamId, displayName: input.displayName, createdAt: ts, lastSeenAt: ts };
}

/** Resolve a session from a Bearer-style header value (token or "Bearer <token>"). */
export function sessionFromHeader(auth: string | undefined): Session | null {
  if (!auth) return null;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  const s = getSession(token);
  if (s) touchSession(token);
  return s;
}

export function requireTeamSession(auth: string | undefined, gameId: string, teamId: string): Session {
  const s = sessionFromHeader(auth);
  if (!s) throw new GameError("NO_SESSION", "Missing or invalid session token");
  if (s.gameId !== gameId) throw new GameError("WRONG_GAME", "Session is for a different game");
  if (s.role !== "team" || s.teamId !== teamId) {
    throw new GameError("NOT_YOUR_TEAM", "Action must come from the team's session");
  }
  return s;
}

export function requireTeacherSession(auth: string | undefined, gameId: string): Session {
  const s = sessionFromHeader(auth);
  if (!s) throw new GameError("NO_SESSION", "Missing or invalid session token");
  if (s.gameId !== gameId) throw new GameError("WRONG_GAME", "Session is for a different game");
  if (s.role !== "teacher") throw new GameError("NOT_TEACHER", "Action requires the teacher session");
  return s;
}

/** Count distinct teams with at least one joined session. */
export function countJoinedTeams(gameId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT team_id) AS c FROM sessions WHERE game_id = ? AND role = 'team' AND team_id IS NOT NULL`,
    )
    .get(gameId) as { c: number };
  return row.c;
}

/** Per-team count of active team sessions (for lobby occupancy). */
export function teamSessionCounts(gameId: string): Map<string, number> {
  const rows = getDb()
    .prepare(`SELECT team_id, COUNT(*) AS c FROM sessions WHERE game_id = ? AND role = 'team' GROUP BY team_id`)
    .all(gameId) as { team_id: string; c: number }[];
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.team_id, r.c);
  return m;
}

/** endTurn: current team or teacher only; display and other teams rejected. */
export function assertEndTurnSession(session: Session, gameId: string): void {
  if (session.gameId !== gameId) throw new GameError("WRONG_GAME", "Session is for a different game");
  if (session.role === "display") throw new GameError("NOT_YOUR_TEAM", "Display cannot end a turn");
  if (session.role === "team") {
    const game = queries.gameById(gameId);
    if (!game) throw new GameError("NOT_FOUND", "Game not found");
    if (session.teamId !== game.currentTeamId) {
      throw new GameError("NOT_YOUR_TURN", "Only the active team can end the turn");
    }
  }
}

export function requireEndTurnSession(auth: string | undefined, gameId: string): Session {
  const s = sessionFromHeader(auth);
  if (!s) throw new GameError("NO_SESSION", "Missing or invalid session token");
  assertEndTurnSession(s, gameId);
  return s;
}

/** Year-end start: owning team or teacher only; display and other teams rejected. */
export function assertSelfTeamOrTeacher(session: Session, gameId: string, teamId: string): void {
  if (session.gameId !== gameId) throw new GameError("WRONG_GAME", "Session is for a different game");
  if (session.role === "display") throw new GameError("NOT_YOUR_TEAM", "Display cannot start year-end");
  if (session.role === "team" && session.teamId !== teamId) {
    throw new GameError("NOT_YOUR_TEAM", "Cannot start year-end for another team");
  }
}

export function requireSelfTeamOrTeacher(auth: string | undefined, gameId: string, teamId: string): Session {
  const s = sessionFromHeader(auth);
  if (!s) throw new GameError("NO_SESSION", "Missing or invalid session token");
  assertSelfTeamOrTeacher(s, gameId, teamId);
  return s;
}

/** Year-end step resolve: owning team or teacher. */
export function requireYearEndResolveSession(auth: string | undefined, gameId: string, teamId: string): Session {
  return requireSelfTeamOrTeacher(auth, gameId, teamId);
}
