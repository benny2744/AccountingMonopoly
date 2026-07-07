import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { queries } from "./db/queries.js";
import { getGameState } from "./services/stateService.js";
import {
  getSession,
  assertEndTurnSession,
  assertSelfTeamOrTeacher,
  type Session,
  type SessionRole,
} from "./services/sessionsService.js";
import { GameError } from "./services/gameService.js";
import { AccountingError } from "./services/accountingService.js";
import {
  roll,
  resolveChoice,
  submitJournalEntry,
  endTurn,
  revealAnswer,
  takeLoanForPendingFee,
} from "./services/turnService.js";
import { startYearEnd, resolveYearEndStep } from "./services/yearEndService.js";
import { pauseGame, resumeGame, forceNextTurn } from "./services/gameService.js";
import { withGameLock } from "./services/gameLock.js";

export interface SocketServer {
  io: Server;
  /** Broadcast the current game snapshot to everyone in the room. */
  broadcastState: (gameId: string) => void;
}

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    path: "/socket.io",
  });

  // Auth handshake: client sends `{ token }` from localStorage.
  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string }).token;
    if (!token) {
      socket.data.session = null;
      return next();
    }
    const session = getSession(token);
    if (!session) {
      return next(new Error("NO_SESSION"));
    }
    socket.data.session = session;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const session = socket.data.session as Session | null;
    if (!session) {
      socket.emit("game:error", { code: "NO_SESSION", message: "No session token" });
      return;
    }
    const roomCode = queries.gameById(session.gameId)?.roomCode;
    if (!roomCode) {
      socket.emit("game:error", { code: "NOT_FOUND", message: "Game not found" });
      return;
    }
    socket.join(`room:${roomCode}`);
    socket.emit("game:state_updated", getGameState(session.gameId));

    socket.on("request_roll", (raw, ack) =>
      handle(socket, session, "request_roll", raw, ack, () => {
        requireTeam(session);
        return withGameLock(session.gameId, () => {
          const result = roll(session.gameId, session.teamId!);
          return { result, state: getGameState(session.gameId) };
        });
      }),
    );

    socket.on("request_resolve_event", (raw, ack) =>
      handle(socket, session, "request_resolve_event", raw, ack, () => {
        requireTeam(session);
        return withGameLock(session.gameId, () => {
          const input = resolveSchema.parse(raw);
          resolveChoice(session.gameId, session.teamId!, input);
          return { state: getGameState(session.gameId) };
        });
      }),
    );

    socket.on("submit_journal_entry", (raw, ack) =>
      handle(socket, session, "submit_journal_entry", raw, ack, () => {
        requireTeam(session);
        return withGameLock(session.gameId, () => {
          const input = journalSchema.parse(raw);
          const result = submitJournalEntry(session.gameId, session.teamId!, input);
          return { result, state: getGameState(session.gameId) };
        });
      }),
    );

    socket.on("request_year_end", (raw, ack) =>
      handle(socket, session, "request_year_end", raw, ack, () => {
        const { teamId } = z.object({ teamId: z.string() }).parse(raw);
        assertSelfTeamOrTeacher(session, session.gameId, teamId);
        return withGameLock(session.gameId, () => {
          startYearEnd(session.gameId, teamId);
          return { state: getGameState(session.gameId) };
        });
      }),
    );

    socket.on("resolve_year_end_step", (raw, ack) =>
      handle(socket, session, "resolve_year_end_step", raw, ack, () => {
        const { teamId, choice } = z
          .object({ teamId: z.string(), choice: z.enum(["pay_cash", "roll_to_loan", "continue"]).default("continue") })
          .parse(raw);
        assertSelfTeamOrTeacher(session, session.gameId, teamId);
        return withGameLock(session.gameId, () => {
          resolveYearEndStep(session.gameId, teamId, choice);
          return { state: getGameState(session.gameId) };
        });
      }),
    );

    socket.on("request_loan_for_fee", (raw, ack) =>
      handle(socket, session, "request_loan_for_fee", raw, ack, () => {
        const { amount } = z.object({ amount: z.number().int().positive() }).parse(raw);
        requireTeam(session);
        return withGameLock(session.gameId, () => {
          takeLoanForPendingFee(session.gameId, session.teamId!, amount);
          return { state: getGameState(session.gameId) };
        });
      }),
    );

    socket.on("request_end_turn", (_raw, ack) =>
      handle(socket, session, "request_end_turn", {}, ack, () => {
        assertEndTurnSession(session, session.gameId);
        return withGameLock(session.gameId, () => {
          endTurn(session.gameId);
          return { state: getGameState(session.gameId) };
        });
      }),
    );

    // ---- Teacher-only controls ----
    socket.on("pause_game", (_raw, ack) =>
      teacherOnly(socket, session, ack, () =>
        withGameLock(session.gameId, () => {
          pauseGame(session.gameId);
          return { state: getGameState(session.gameId) };
        }),
      ),
    );
    socket.on("resume_game", (_raw, ack) =>
      teacherOnly(socket, session, ack, () =>
        withGameLock(session.gameId, () => {
          resumeGame(session.gameId);
          return { state: getGameState(session.gameId) };
        }),
      ),
    );
    socket.on("force_next_turn", (_raw, ack) =>
      teacherOnly(socket, session, ack, () =>
        withGameLock(session.gameId, () => {
          forceNextTurn(session.gameId);
          return { state: getGameState(session.gameId) };
        }),
      ),
    );
    socket.on("reveal_answer", (_raw, ack) =>
      teacherOnly(socket, session, ack, () =>
        withGameLock(session.gameId, () => {
          revealAnswer(session.gameId);
          return { state: getGameState(session.gameId) };
        }),
      ),
    );
  });

  function broadcastState(gameId: string): void {
    const game = queries.gameById(gameId);
    if (!game) return;
    io.to(`room:${game.roomCode}`).emit("game:state_updated", getGameState(gameId));
  }

  return { io, broadcastState };
}

const resolveSchema = z.object({
  choice: z.string(),
  amount: z.number().int().positive().optional(),
});
const journalSchema = z.object({
  debitAccount: z.string(),
  creditAccount: z.string(),
  amount: z.number().int().positive(),
});

type Ack = (response: unknown) => void;

function requireTeam(session: Session): void {
  if (session.role !== "team" || !session.teamId) {
    throw new GameError("NOT_YOUR_TEAM", "Action must come from a team session");
  }
}

function handle(
  socket: Socket,
  session: Session,
  event: string,
  _raw: unknown,
  ack: Ack | undefined,
  fn: () => Promise<{ state: unknown; result?: unknown }> | { state: unknown; result?: unknown },
): void {
  Promise.resolve()
    .then(() => fn())
    .then((out) => {
      ack?.({ ok: true, result: out.result });
      broadcast(socket, session, out.state);
    })
    .catch((err: unknown) => emitError(socket, event, err, ack));
}

function teacherOnly(
  socket: Socket,
  session: Session,
  ack: Ack | undefined,
  fn: () => Promise<{ state: unknown }> | { state: unknown },
): void {
  if (session.role !== "teacher") {
    socket.emit("game:error", { code: "NOT_TEACHER", message: "Teacher only" });
    ack?.({ ok: false, error: { code: "NOT_TEACHER" } });
    return;
  }
  Promise.resolve(fn())
    .then((out) => {
      ack?.({ ok: true });
      broadcast(socket, session, out.state);
    })
    .catch((err: unknown) => emitError(socket, "teacher_action", err, ack));
}

function broadcast(socket: Socket, session: Session, state: unknown): void {
  void socket;
  const game = queries.gameById(session.gameId);
  if (!game) return;
  socket.to(`room:${game.roomCode}`).emit("game:state_updated", state);
  socket.emit("game:state_updated", state);
}

function emitError(socket: Socket, event: string, err: unknown, ack: Ack | undefined): void {
  const code = err instanceof GameError || err instanceof AccountingError ? err.code : "INTERNAL";
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof z.ZodError) {
    ack?.({ ok: false, error: { code: "VALIDATION" } });
    socket.emit("game:error", { code: "VALIDATION", message: err.errors.map((e) => e.message).join("; ") });
    return;
  }
  ack?.({ ok: false, error: { code, message, params: (err as GameError | AccountingError).params } });
  socket.emit("game:error", { code, message, params: (err as GameError | AccountingError).params, event });
}

// Re-exported for service-layer callers that need to require team identity.
export function assertTeamSession(session: Session): void {
  requireTeam(session);
}
export type { SessionRole };
