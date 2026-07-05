import type { Request, Response, NextFunction } from "express";
import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { networkInterfaces } from "node:os";
import { createGame, startGame, GameError, pauseGame, resumeGame, forceNextTurn, addTeam, removeTeam } from "../services/gameService.js";
import { endTurn, resolveChoice, roll, submitJournalEntry, revealAnswer, takeLoanForPendingFee, buildHouse } from "../services/turnService.js";
import { getGameState, ledgerView, statementsView } from "../services/stateService.js";
import { startYearEnd, resolveYearEndStep } from "../services/yearEndService.js";
import { AccountingError } from "../services/accountingService.js";
import { queries } from "../db/queries.js";
import { accounting, game as gameData } from "@amono/shared";
import {
  createTeacherSession,
  createTeamSession,
  createDisplaySession,
  getSession,
  requireTeacherSession,
  requireTeamSession,
  requireEndTurnSession,
  requireSelfTeamOrTeacher,
  requireYearEndResolveSession,
  countJoinedTeams,
  teamSessionCounts,
  type Session,
} from "../services/sessionsService.js";
import { logEvent } from "../services/eventLog.js";
import { withGameLock } from "../services/gameLock.js";

export const gamesRouter: RouterType = Router();

/** Broadcast helper injected from index.ts so routes can fan out state updates. */
type BroadcastFn = (gameId: string) => void;
function broadcast(req: Request, gameId: string): void {
  const fn = req.app.get("broadcastState") as BroadcastFn | undefined;
  if (fn) fn(gameId);
}

const createGameSchema = z.object({
  roomName: z.string().optional(),
  teacherPin: z.string().min(1),
  difficulty: z.enum(["cash", "accrual"]),
  numberOfTeams: z.number().int().min(2).max(4),
  propertyAllocationRatio: z.union([z.literal(0), z.literal(0.25), z.literal(0.5), z.literal(0.75)]),
  startingCash: z.number().int().min(0),
  startingLoanLimit: z.number().int().min(0),
  allowStudentFullHint: z.boolean().optional(),
  showScores: z.boolean().optional(),
});

gamesRouter.post("/", (req, res, next) => {
  try {
    const input = createGameSchema.parse(req.body);
    const game = createGame(input);
    const session = createTeacherSession(game.id, input.teacherPin);
    res.status(201).json({
      game,
      chart: accounting.getChartOfAccounts(game.difficulty),
      sessionToken: session.token,
    });
  } catch (e) {
    next(e);
  }
});

// LAN address report for lobby "copyable join URL" (PLAN-03 §3).
gamesRouter.get("/meta/lan-info", (_req, res) => {
  res.json({ lanIps: collectLanIps(), port: Number(process.env.PORT ?? 5000) });
});

/** Room lookup by code (PLAN-03 §3) — students type a code in /join. */
gamesRouter.get("/by-code/:roomCode", (req, res, next) => {
  try {
    const game = queries.gameByRoomCode(req.params.roomCode);
    if (!game) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No room with that code" } });
      return;
    }
    const counts = teamSessionCounts(game.id);
    res.json({
      gameId: game.id,
      roomCode: game.roomCode,
      status: game.status,
      difficulty: game.difficulty,
      settings: game.settings,
      joinedTeams: countJoinedTeams(game.id),
      teams: queries.teamsByGame(game.id).map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        joinedCount: counts.get(t.id) ?? 0,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// Join flows (Phase 3 §1, §3).
const teacherJoinSchema = z.object({ teacherPin: z.string().min(1) });
gamesRouter.post("/by-code/:roomCode/teacher-join", (req, res, next) => {
  try {
    const { teacherPin } = teacherJoinSchema.parse(req.body);
    const game = queries.gameByRoomCode(req.params.roomCode);
    if (!game) throw new GameError("NOT_FOUND", "No room with that code");
    const session = createTeacherSession(game.id, teacherPin);
    res.json({ sessionToken: session.token, gameId: game.id });
  } catch (e) {
    next(e);
  }
});

const teamJoinSchema = z.object({ teamId: z.string(), displayName: z.string().optional() });
gamesRouter.post("/:gameId/join", (req, res, next) => {
  try {
    const { teamId, displayName } = teamJoinSchema.parse(req.body);
    const session = createTeamSession(req.params.gameId, teamId, displayName);
    broadcast(req, req.params.gameId);
    res.json({ sessionToken: session.token, gameId: session.gameId, teamId });
  } catch (e) {
    next(e);
  }
});

gamesRouter.post("/:gameId/display-join", (req, res, next) => {
  try {
    const game = queries.gameById(req.params.gameId);
    if (!game) throw new GameError("NOT_FOUND", "Game not found");
    const session = createDisplaySession(req.params.gameId);
    res.json({ sessionToken: session.token, gameId: session.gameId });
  } catch (e) {
    next(e);
  }
});

// Session restore on refresh/reconnect (PLAN-03 §1).
gamesRouter.get("/session", (req, res, next) => {
  try {
    const auth = req.header("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (!token) {
      res.status(401).json({ error: { code: "NO_SESSION", message: "No token" } });
      return;
    }
    const s = getSession(token);
    if (!s) {
      res.status(401).json({ error: { code: "NO_SESSION", message: "Invalid or expired token" } });
      return;
    }
    res.json({ session: s });
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId", (req, res, next) => {
  try {
    res.json(getGameState(req.params.gameId));
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/properties", (req, res, next) => {
  try {
    res.json(queries.propertiesByGame(req.params.gameId));
  } catch (e) {
    next(e);
  }
});

const startSchema = z.object({ teacherPin: z.string(), override: z.boolean().optional() });
gamesRouter.post("/:gameId/start", async (req, res, next) => {
  try {
    const { teacherPin, override } = startSchema.parse(req.body);
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    const game = await withGameLock(req.params.gameId, () =>
      startGame(req.params.gameId, teacherPin, { overrideMinTeams: override }),
    );
    broadcast(req, game.id);
    res.json(getGameState(game.id));
  } catch (e) {
    next(e);
  }
});

gamesRouter.post("/:gameId/roll", async (req, res, next) => {
  try {
    const { teamId } = z.object({ teamId: z.string() }).parse(req.body);
    requireTeamSession(req.header("Authorization"), req.params.gameId, teamId);
    const result = await withGameLock(req.params.gameId, () => roll(req.params.gameId, teamId));
    broadcast(req, req.params.gameId);
    res.json({ result, state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

const resolveSchema = z.object({
  teamId: z.string(),
  choice: z.string(),
  amount: z.number().int().positive().optional(),
});
gamesRouter.post("/:gameId/resolve-event", async (req, res, next) => {
  try {
    const input = resolveSchema.parse(req.body);
    requireTeamSession(req.header("Authorization"), req.params.gameId, input.teamId);
    await withGameLock(req.params.gameId, () => resolveChoice(req.params.gameId, input.teamId, input));
    broadcast(req, req.params.gameId);
    res.json({ state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

const journalSchema = z.object({
  teamId: z.string(),
  debitAccount: z.string(),
  creditAccount: z.string(),
  amount: z.number().int().positive(),
});
gamesRouter.post("/:gameId/submit-journal-entry", async (req, res, next) => {
  try {
    const input = journalSchema.parse(req.body);
    requireTeamSession(req.header("Authorization"), req.params.gameId, input.teamId);
    const result = await withGameLock(req.params.gameId, () =>
      submitJournalEntry(req.params.gameId, input.teamId, input),
    );
    broadcast(req, req.params.gameId);
    res.json({ result, state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

gamesRouter.post("/:gameId/build-house", async (req, res, next) => {
  try {
    const input = z.object({ teamId: z.string(), propertyId: z.string() }).parse(req.body);
    requireTeamSession(req.header("Authorization"), req.params.gameId, input.teamId);
    await withGameLock(req.params.gameId, () => buildHouse(req.params.gameId, input.teamId, input.propertyId));
    broadcast(req, req.params.gameId);
    res.json({ state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

gamesRouter.post("/:gameId/end-turn", async (req, res, next) => {
  try {
    requireEndTurnSession(req.header("Authorization"), req.params.gameId);
    const game = await withGameLock(req.params.gameId, () => endTurn(req.params.gameId));
    broadcast(req, game.id);
    res.json({ state: getGameState(game.id) });
  } catch (e) {
    next(e);
  }
});

// ---- Teacher-only controls (Phase 3 §5) ----
gamesRouter.post("/:gameId/pause", async (req, res, next) => {
  try {
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    const game = await withGameLock(req.params.gameId, () => pauseGame(req.params.gameId));
    broadcast(req, game.id);
    res.json(getGameState(game.id));
  } catch (e) {
    next(e);
  }
});
gamesRouter.post("/:gameId/resume", async (req, res, next) => {
  try {
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    const game = await withGameLock(req.params.gameId, () => resumeGame(req.params.gameId));
    broadcast(req, game.id);
    res.json(getGameState(game.id));
  } catch (e) {
    next(e);
  }
});
gamesRouter.post("/:gameId/force-next-turn", async (req, res, next) => {
  try {
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    const game = await withGameLock(req.params.gameId, () => forceNextTurn(req.params.gameId));
    broadcast(req, game.id);
    res.json(getGameState(game.id));
  } catch (e) {
    next(e);
  }
});
gamesRouter.post("/:gameId/reveal-answer", async (req, res, next) => {
  try {
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    await withGameLock(req.params.gameId, () => revealAnswer(req.params.gameId));
    broadcast(req, req.params.gameId);
    res.json({ state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

// ---- Team management (lobby-only add/remove) ----
gamesRouter.post("/:gameId/teams", async (req, res, next) => {
  try {
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    const team = await withGameLock(req.params.gameId, () => addTeam(req.params.gameId));
    broadcast(req, req.params.gameId);
    res.status(201).json({ team });
  } catch (e) {
    next(e);
  }
});

gamesRouter.delete("/:gameId/teams/:teamId", async (req, res, next) => {
  try {
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    await withGameLock(req.params.gameId, () => removeTeam(req.params.gameId, req.params.teamId));
    broadcast(req, req.params.gameId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Phase 4: year-end, fee-loan softlock, credit-limit override ----

const loanForFeeSchema = z.object({ teamId: z.string(), amount: z.number().int().positive() });
gamesRouter.post("/:gameId/loan-for-fee", async (req, res, next) => {
  try {
    const { teamId, amount } = loanForFeeSchema.parse(req.body);
    requireTeamSession(req.header("Authorization"), req.params.gameId, teamId);
    await withGameLock(req.params.gameId, () => takeLoanForPendingFee(req.params.gameId, teamId, amount));
    broadcast(req, req.params.gameId);
    res.json({ state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

const yearEndStartSchema = z.object({ teamId: z.string() });
gamesRouter.post("/:gameId/year-end/start", async (req, res, next) => {
  try {
    const { teamId } = yearEndStartSchema.parse(req.body);
    requireSelfTeamOrTeacher(req.header("Authorization"), req.params.gameId, teamId);
    await withGameLock(req.params.gameId, () => startYearEnd(req.params.gameId, teamId));
    broadcast(req, req.params.gameId);
    res.json({ state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

const yearEndStepSchema = z.object({
  teamId: z.string(),
  choice: z.enum(["pay_cash", "roll_to_loan", "continue"]).default("continue"),
});
gamesRouter.post("/:gameId/year-end/resolve-step", async (req, res, next) => {
  try {
    const { teamId, choice } = yearEndStepSchema.parse(req.body);
    requireYearEndResolveSession(req.header("Authorization"), req.params.gameId, teamId);
    await withGameLock(req.params.gameId, () => resolveYearEndStep(req.params.gameId, teamId, choice));
    broadcast(req, req.params.gameId);
    res.json({ state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

const creditLimitSchema = z.object({ teamId: z.string(), creditLimit: z.number().int().min(0) });
gamesRouter.post("/:gameId/credit-limit", async (req, res, next) => {
  try {
    const { teamId, creditLimit } = creditLimitSchema.parse(req.body);
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    const team = queries.teamsByGame(req.params.gameId).find((t) => t.id === teamId);
    if (!team) throw new GameError("NOT_FOUND", "Team not found");
    const oldLimit = team.creditLimit;
    await withGameLock(req.params.gameId, () => {
      queries.setTeamCreditLimit(teamId, creditLimit);
      logEvent(req.params.gameId, null, "teacher_override", {
        action: "credit_limit",
        teamId,
        oldLimit,
        newLimit: creditLimit,
      });
    });
    broadcast(req, req.params.gameId);
    res.json(getGameState(req.params.gameId));
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/teams/:teamId/arap", (req, res, next) => {
  try {
    const teams = queries.teamsByGame(req.params.gameId);
    const cbs = queries.creditBalancesByGame(req.params.gameId);
    res.json(accounting.generateARAPSchedule(req.params.teamId, teams, cbs));
  } catch (e) {
    next(e);
  }
});

// ---- Phase 5: hints, scoring, end-game, export ----

// Returns the hint text for the active team's pending journal entry at the
// requested level (1–4). Level 4 is gated by the game's allowStudentFullHint
// setting; if disabled, level 4 falls back to level 3 text and the response
// flags `gated` so the UI can tell the student to ask the teacher.
gamesRouter.post("/:gameId/hint", (req, res, next) => {
  try {
    const { level } = z.object({ level: z.number().int().min(1).max(4) }).parse(req.body);
    const game = queries.gameById(req.params.gameId);
    if (!game) throw new GameError("NOT_FOUND", "Game not found");
    const pending = queries.pendingByGame(req.params.gameId);
    if (!pending || pending.status !== "awaiting_journal") {
      throw new GameError("NO_PENDING", "No pending journal entry");
    }
    requireTeamSession(req.header("Authorization"), req.params.gameId, pending.teamId);
    const expected = (pending.expectedEntries as any[]).find((e) => e.teamId === pending.teamId) ??
      (pending.expectedEntries as any[])[0];
    if (!expected) throw new GameError("NO_PENDING", "Pending action has no expected entry");
    const allowFull = game.settings.allowStudentFullHint ?? false;
    const effectiveLevel = level === 4 && !allowFull ? 3 : level;
    const text = accounting.getHint(expected, effectiveLevel as 1 | 2 | 3 | 4);
    const hintsUsed = queries.incPendingHints(pending.id);
    broadcast(req, req.params.gameId);
    res.json({ level: effectiveLevel, text, hintsUsed, gated: level === 4 && !allowFull });
  } catch (e) {
    next(e);
  }
});

// End the game (sets status to "ended"); Phase 5 §2.
gamesRouter.post("/:gameId/end", async (req, res, next) => {
  try {
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    const { endGame } = await import("../services/gameService.js");
    const game = await withGameLock(req.params.gameId, () => endGame(req.params.gameId));
    broadcast(req, req.params.gameId);
    res.json(getGameState(game.id));
  } catch (e) {
    next(e);
  }
});

// Clone a game's settings into a new room ("Play again with same settings").
gamesRouter.post("/:gameId/clone", async (req, res, next) => {
  try {
    requireTeacherSession(req.header("Authorization"), req.params.gameId);
    const src = queries.gameById(req.params.gameId);
    if (!src) throw new GameError("NOT_FOUND", "Game not found");
    const { teacherPin } = z.object({ teacherPin: z.string().min(1) }).parse(req.body);
    const cloned = createGame({
      teacherPin,
      difficulty: src.difficulty,
      numberOfTeams: queries.teamsByGame(src.id).length,
      propertyAllocationRatio: src.settings.propertyAllocationRatio,
      startingCash: src.settings.startingCash,
      startingLoanLimit: src.settings.startingLoanLimit,
      allowStudentFullHint: src.settings.allowStudentFullHint,
      showScores: src.settings.showScores,
    });
    const session = createTeacherSession(cloned.id, teacherPin);
    res.status(201).json({ game: cloned, sessionToken: session.token });
  } catch (e) {
    next(e);
  }
});

// Per-team score breakdown (Phase 5 §3 leaderboard source).
gamesRouter.get("/:gameId/scores", (_req, res, next) => {
  try {
    const gameId = _req.params.gameId;
    const teams = queries.teamsByGame(gameId);
    const scores = teams.map((t) => {
      const snaps = queries.yearSnapshotsForTeam(t.id);
      const latest = snaps[snaps.length - 1];
      return {
        teamId: t.id,
        name: t.name,
        color: t.color,
        score: latest?.cumulativeScore ?? 0,
        yearSnapshots: snaps.map((s) => ({ year: s.year, score: s.score ?? 0, cumulative: s.cumulativeScore })),
      };
    });
    res.json({ scores });
  } catch (e) {
    next(e);
  }
});

// Export (PRD §19.1). JSON = full event-sourced record; CSV = teacher-graded workbook.
gamesRouter.get("/:gameId/export", async (req, res, next) => {
  try {
    const format = (req.query.format as string | undefined) ?? "json";
    const { exportGame } = await import("../services/exportService.js");
    const out = exportGame(req.params.gameId, format as "json" | "csv");
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="game-${req.params.gameId}.csv"`);
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="game-${req.params.gameId}.json"`);
    }
    res.send(out);
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/teams/:teamId/ledger", (req, res, next) => {
  try {
    res.json(ledgerView(req.params.teamId));
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/teams/:teamId/t-accounts", (req, res, next) => {
  try {
    res.json(ledgerView(req.params.teamId).tAccounts);
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/teams/:teamId/statements", (req, res, next) => {
  try {
    res.json(statementsView(req.params.teamId));
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/deck", (req, res, next) => {
  try {
    const game = queries.gameById(req.params.gameId);
    if (!game) return res.status(404).json({ error: "not found" });
    res.json(gameData.getDeck(game.difficulty));
  } catch (e) {
    next(e);
  }
});

// Zod errors → 400; GameError → its code; otherwise 500.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof GameError || err instanceof AccountingError) {
    const status =
      err.code === "NO_SESSION" ||
      err.code === "NOT_TEACHER" ||
      err.code === "NOT_YOUR_TEAM" ||
      err.code === "NOT_YOUR_TURN" ||
      err.code === "WRONG_GAME"
        ? 401
        : 400;
    res.status(status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: { code: "VALIDATION", message: err.errors.map((e) => e.message).join("; ") } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
}

/** Any valid session for this game (team, teacher, or display). */
function requireAnySession(auth: string | undefined, gameId: string): Session {
  const token = (auth ?? "").startsWith("Bearer ") ? (auth ?? "").slice(7) : auth ?? "";
  const session = getSession(token);
  if (!session) throw new GameError("NO_SESSION", "Missing or invalid session token");
  if (session.gameId !== gameId) throw new GameError("WRONG_GAME", "Session is for a different game");
  return session;
}

/** IPv4 LAN addresses (RFC1918 + link-local) for the lobby join URL. */
function collectLanIps(): string[] {
  const nets = networkInterfaces();
  const out: string[] = [];
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const n of list) {
      if (n.family === "IPv4" && !n.internal) out.push(n.address);
    }
  }
  return out;
}
