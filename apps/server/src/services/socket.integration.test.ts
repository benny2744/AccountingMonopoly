import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { openDb, closeDb, getDb } from "../db/client.js";
import { runMigrations } from "../db/schema.js";
import { createSocketServer, type SocketServer } from "../socket.js";
import { createGame, startGame } from "./gameService.js";
import { queries } from "../db/queries.js";
import { createTeamSession, createTeacherSession, createDisplaySession } from "./sessionsService.js";

let httpServer: HttpServer;
let socketServer: SocketServer;
let port: number;

beforeAll(async () => {
  openDb(":memory:");
  runMigrations();
  httpServer = createServer();
  socketServer = createSocketServer(httpServer);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  socketServer.io.close();
  httpServer.closeAllConnections?.();
  await new Promise<void>((r) => httpServer.close(() => r()));
  closeDb();
});

beforeEach(() => {
  for (const t of [
    "journal_entry_lines",
    "journal_entries",
    "pending_actions",
    "credit_balances",
    "game_events",
    "sessions",
    "accounts",
    "properties",
    "board_spaces",
    "teams",
    "deck_order",
    "games",
  ]) {
    getDb().exec(`DELETE FROM ${t}`);
  }
});

function client(token: string): ClientSocket {
  return ioc(`http://127.0.0.1:${port}`, { path: "/socket.io", auth: { token }, autoConnect: false });
}

function once<T = unknown>(sock: ClientSocket, event: string, timeout = 1500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    sock.once(event, (v: T) => {
      clearTimeout(t);
      resolve(v);
    });
  });
}

interface Setup {
  gameId: string;
  roomCode: string;
  teacher: ClientSocket;
  teams: { id: string; token: string; sock: ClientSocket }[];
}

/** Create a started game and connect a teacher + one client per team via sockets. */
async function setupGameAndConnect(numTeams = 3): Promise<Setup> {
  const game = createGame({
    teacherPin: "1234",
    difficulty: "cash",
    numberOfTeams: numTeams,
    propertyAllocationRatio: 0.5,
    startingCash: 1500,
    startingLoanLimit: 500,
  });
  const teams = queries.teamsByGame(game.id);
  for (const t of teams) {
    createTeamSession(game.id, t.id, `student-${t.name}`);
  }
  startGame(game.id, "1234");
  const teamEntries = await Promise.all(
    teams.map(async (t) => {
      const s = createTeamSession(game.id, t.id, `student-${t.name}`);
      const sock = client(s.token);
      sock.connect();
      await once(sock, "game:state_updated");
      return { id: t.id, token: s.token, sock };
    }),
  );
  const teacherSession = createTeacherSession(game.id, "1234");
  const teacher = client(teacherSession.token);
  teacher.connect();
  await once(teacher, "game:state_updated");
  return { gameId: game.id, roomCode: game.roomCode, teacher, teams: teamEntries };
}

function closeAll(s: Setup): Promise<void> {
  const all = [s.teacher, ...s.teams.map((t) => t.sock)];
  for (const c of all) c.disconnect();
  return new Promise((r) => setTimeout(r, 50));
}

describe("socket multiplayer (Phase 3)", () => {
  it("rejects a connection without a valid session token", async () => {
    const bad = ioc(`http://127.0.0.1:${port}`, { path: "/socket.io", auth: { token: "nope" }, autoConnect: false });
    bad.connect();
    const err = await once(bad, "connect_error");
    expect((err as Error).message).toBe("NO_SESSION");
    bad.disconnect();
  });

  it("only the current team's request_roll succeeds; others get game:error", async () => {
    const s = await setupGameAndConnect(3);
    const state = queries.gameById(s.gameId)!;
    const currentTeamId = state.currentTeamId!;
    const wrongClient = s.teams.find((t) => t.id !== currentTeamId)!;

    // Wrong team tries to roll → ack error + game:error emission.
    const ackP = new Promise<any>((resolve) => wrongClient.sock.emit("request_roll", {}, resolve));
    const ack = await ackP;
    expect(ack.ok).toBe(false);
    // Now correct team rolls → both should get game:state_updated.
    const correct = s.teams.find((t) => t.id === currentTeamId)!;
    const otherP = once(wrongClient.sock, "game:state_updated");
    correct.sock.emit("request_roll", {});
    await Promise.all([once(correct.sock, "game:state_updated"), otherP]);
    await closeAll(s);
  });

  it("broadcasts game:state_updated to every client after a posted entry", async () => {
    const s = await setupGameAndConnect(2);
    const state0 = queries.gameById(s.gameId)!;
    const current = s.teams.find((t) => t.id === state0.currentTeamId)!;

    // Roll and keep resolving until we hit awaiting_end or post an entry.
    current.sock.emit("request_roll", {});
    await once(current.sock, "game:state_updated");
    let snap = await freshState(s.gameId);
    let guard = 0;
    while (snap.pending && guard < 8) {
      if (snap.pending.status === "awaiting_choice") {
        const choice = snap.pending.kind === "buy_or_skip" ? "skip" : snap.pending.kind === "rent_due" ? "cash" : "pass";
        current.sock.emit("request_resolve_event", { choice });
        await once(current.sock, "game:state_updated");
      } else if (snap.pending.status === "awaiting_journal") {
        const expected = (snap.pending.expectedEntries as any[]).find((e) => e.teamId === current.id) ?? (snap.pending.expectedEntries as any[])[0];
        const debit = expected.lines.find((l: any) => l.debit > 0);
        const credit = expected.lines.find((l: any) => l.credit > 0);
        const beforeSeq = lastEventSeq(s.gameId);
        const other = s.teams.find((t) => t.id !== current.id)!;
        const otherP = once(other.sock, "game:state_updated");
        current.sock.emit("submit_journal_entry", { debitAccount: debit.accountName, creditAccount: credit.accountName, amount: debit.debit });
        await Promise.all([once(current.sock, "game:state_updated"), otherP]);
        // Verify a new event was logged (proves broadcast carried new state).
        expect(lastEventSeq(s.gameId)).toBeGreaterThan(beforeSeq);
        snap = await freshState(s.gameId);
        break;
      }
      snap = await freshState(s.gameId);
      guard++;
    }
    await closeAll(s);
  });

  it("reconnect with the same session token restores pending action state", async () => {
    const s = await setupGameAndConnect(2);
    const state0 = queries.gameById(s.gameId)!;
    const current = s.teams.find((t) => t.id === state0.currentTeamId)!;

    // Seed a deterministic pending action so the test does not depend on dice/board luck.
    const pendingId = crypto.randomUUID();
    const ts = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO pending_actions (id, game_id, team_id, kind, payload, expected_entries, status, attempts, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        pendingId,
        s.gameId,
        current.id,
        "buy_or_skip",
        JSON.stringify({ name: "Test Property", price: 100, rent: 10 }),
        JSON.stringify([]),
        "awaiting_choice",
        0,
        ts,
      );
    getDb()
      .prepare("UPDATE games SET turn_phase = ?, updated_at = ? WHERE id = ?")
      .run("resolving", ts, s.gameId);

    const before = await freshState(s.gameId);
    expect(before.pending?.kind).toBe("buy_or_skip");

    const token = current.token;
    current.sock.disconnect();

    const sock2 = client(token);
    sock2.connect();
    const restored = (await once(sock2, "game:state_updated")) as any;
    expect(restored.pending?.kind).toBe("buy_or_skip");
    expect(restored.pending?.status).toBe("awaiting_choice");
    sock2.disconnect();
    await closeAll(s);
  });

  it("paused game blocks roll, resolve, submit, and end-turn", async () => {
    const s = await setupGameAndConnect(2);
    s.teacher.emit("pause_game", {});
    await once(s.teacher, "game:state_updated");
    const state = queries.gameById(s.gameId)!;
    expect(state.status).toBe("paused");
    const current = s.teams.find((t) => t.id === state.currentTeamId)!;

    const rollAck = await new Promise<any>((resolve) => current.sock.emit("request_roll", {}, resolve));
    expect(rollAck.ok).toBe(false);

    const resolveAck = await new Promise<any>((resolve) =>
      current.sock.emit("request_resolve_event", { choice: "skip" }, resolve),
    );
    expect(resolveAck.ok).toBe(false);

    const journalAck = await new Promise<any>((resolve) =>
      current.sock.emit(
        "submit_journal_entry",
        { debitAccount: "Cash", creditAccount: "Owner Capital", amount: 1 },
        resolve,
      ),
    );
    expect(journalAck.ok).toBe(false);

    const endAck = await new Promise<any>((resolve) => current.sock.emit("request_end_turn", {}, resolve));
    expect(endAck.ok).toBe(false);

    s.teacher.emit("resume_game", {});
    await once(s.teacher, "game:state_updated");
    const resumedAck = await new Promise<any>((resolve) => current.sock.emit("request_roll", {}, resolve));
    expect(resumedAck.ok).toBe(true);
    await closeAll(s);
  });

  it("endTurn rejected for display and non-current team", async () => {
    const s = await setupGameAndConnect(2);
    const snap = await advanceToAwaitingEnd(s);
    expect(snap.game.turnPhase).toBe("awaiting_end");

    const state = queries.gameById(s.gameId)!;
    const other = s.teams.find((t) => t.id !== state.currentTeamId)!;
    const otherAck = await emitAck(other.sock, "request_end_turn");
    expect(otherAck.ok).toBe(false);

    const displaySession = createDisplaySession(s.gameId);
    const displaySock = client(displaySession.token);
    displaySock.connect();
    await once(displaySock, "game:state_updated");
    const displayAck = await emitAck(displaySock, "request_end_turn");
    expect(displayAck.ok).toBe(false);
    displaySock.disconnect();
    await closeAll(s);
  });

  it("endTurn accepted for current team and teacher", async () => {
    const s = await setupGameAndConnect(2);
    const snap = await advanceToAwaitingEnd(s);
    expect(snap.game.turnPhase).toBe("awaiting_end");

    const state = queries.gameById(s.gameId)!;
    const current = s.teams.find((t) => t.id === state.currentTeamId)!;
    const currentAck = await emitAck(current.sock, "request_end_turn");
    expect(currentAck.ok).toBe(true);

    const s2 = await setupGameAndConnect(2);
    await advanceToAwaitingEnd(s2);
    const teacherAck = await emitAck(s2.teacher, "request_end_turn");
    expect(teacherAck.ok).toBe(true);
    await closeAll(s2);
  });

  it("display session cannot roll; teacher cannot impersonate a team via socket", async () => {
    const s = await setupGameAndConnect(2);
    const state = queries.gameById(s.gameId)!;
    const current = s.teams.find((t) => t.id === state.currentTeamId)!;

    const displaySession = createDisplaySession(s.gameId);
    const displaySock = client(displaySession.token);
    displaySock.connect();
    await once(displaySock, "game:state_updated");
    const displayAck = await emitAck(displaySock, "request_roll");
    expect(displayAck.ok).toBe(false);
    displaySock.disconnect();

    const teacherRollAck = await emitAck(s.teacher, "request_roll");
    expect(teacherRollAck.ok).toBe(false);
    await closeAll(s);
  });

  it("teacher-only controls reject team sessions", async () => {
    const s = await setupGameAndConnect(2);
    const team = s.teams[0]!;
    const errP = once(team.sock, "game:error");
    team.sock.emit("pause_game", {});
    const err = await errP;
    expect((err as any).code).toBe("NOT_TEACHER");
    await closeAll(s);
  });
});

async function freshState(gameId: string): Promise<any> {
  const { getGameState } = await import("./stateService.js");
  return getGameState(gameId);
}

async function emitAck(sock: ClientSocket, event: string, payload: unknown = {}): Promise<any> {
  return new Promise((resolve) => sock.emit(event, payload, resolve));
}

async function advanceToAwaitingEnd(s: Setup): Promise<any> {
  const state0 = queries.gameById(s.gameId)!;
  const current = s.teams.find((t) => t.id === state0.currentTeamId)!;
  current.sock.emit("request_roll", {});
  await once(current.sock, "game:state_updated");
  let snap = await freshState(s.gameId);
  let guard = 0;
  while (snap.game.turnPhase !== "awaiting_end" && guard < 16) {
    if (snap.pending?.status === "awaiting_choice") {
      const choice = snap.pending.kind === "buy_or_skip" ? "skip" : snap.pending.kind === "rent_due" ? "cash" : "pass";
      current.sock.emit("request_resolve_event", { choice });
      await once(current.sock, "game:state_updated");
    } else if (snap.pending?.status === "awaiting_journal") {
      const expected =
        (snap.pending.expectedEntries as any[]).find((e) => e.teamId === current.id) ??
        (snap.pending.expectedEntries as any[])[0];
      const debit = expected.lines.find((l: any) => l.debit > 0);
      const credit = expected.lines.find((l: any) => l.credit > 0);
      current.sock.emit("submit_journal_entry", {
        debitAccount: debit.accountName,
        creditAccount: credit.accountName,
        amount: debit.debit,
      });
      await once(current.sock, "game:state_updated");
    } else if (snap.game.turnPhase === "awaiting_roll") {
      current.sock.emit("request_roll", {});
      await once(current.sock, "game:state_updated");
    }
    snap = await freshState(s.gameId);
    guard++;
  }
  return snap;
}

function lastEventSeq(gameId: string): number {
  const row = getDb().prepare("SELECT MAX(seq) AS m FROM game_events WHERE game_id = ?").get(gameId) as { m: number | null } | undefined;
  return row?.m ?? 0;
}
