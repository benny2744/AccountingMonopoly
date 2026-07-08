import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, closeDb, getDb } from "../db/client.js";
import { runMigrations } from "../db/schema.js";
import { createApp } from "../app.js";
import { loginAdmin } from "../testHelpers.js";
import { createGame, startGame, endGame } from "./gameService.js";
import { queries } from "../db/queries.js";
import { createTeacherSessionForGame, createTeamSession } from "./sessionsService.js";
import { activateYearEnd, resolveYearEndStep } from "./yearEndService.js";
import { postEntry, balanceOf } from "./accountingService.js";
import { exportGame } from "./exportService.js";
import { getGameState } from "./stateService.js";
import { submitJournalEntry, roll } from "./turnService.js";

let httpServer: HttpServer;
// Assigned in beforeAll; referenced as `void port` to silence unused warnings.
let port = 0;
let adminToken = "";

beforeAll(async () => {
  openDb(":memory:");
  runMigrations();
  const app = createApp();
  httpServer = createServer(app);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  port = (httpServer.address() as AddressInfo).port;
  adminToken = await loginAdmin(port);
});

afterAll(async () => {
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
    "deferred_settlements",
    "year_snapshots",
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

void port;

const B = () => `http://127.0.0.1:${port}`;
async function post(path: string, body: unknown, token?: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const r = await fetch(B() + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Admin-Token": adminToken,
    },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  return { ok: r.ok, status: r.status, json };
}

function makeStartedGame(difficulty: "cash" | "accrual" = "cash"): {
  gameId: string;
  teamIds: string[];
  teamTokens: Record<string, string>;
  teacherToken: string;
} {
  const game = createGame({
    difficulty,
    numberOfTeams: 2,
    propertyAllocationRatio: 0,
    startingCash: 1500,
    startingLoanLimit: 500,
    allowStudentFullHint: false,
    showScores: true,
  });
  const teams = queries.teamsByGame(game.id);
  const teamTokens: Record<string, string> = {};
  for (const t of teams) {
    teamTokens[t.id] = createTeamSession(game.id, t.id, "tester").token;
  }
  const teacherToken = createTeacherSessionForGame(game.id).token;
  startGame(game.id);
  return { gameId: game.id, teamIds: teams.map((t) => t.id), teamTokens, teacherToken };
}

function seedJournalPending(gameId: string, teamId: string): string {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO pending_actions (id, game_id, team_id, kind, payload, expected_entries, status, attempts, hints_used, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      gameId,
      teamId,
      "event_card",
      JSON.stringify({}),
      JSON.stringify([
        {
          teamId,
          description: "Collect rent",
          lines: [
            { accountName: "Cash", debit: 100, credit: 0 },
            { accountName: "Rent Revenue", debit: 0, credit: 100 },
          ],
        },
      ]),
      "awaiting_journal",
      0,
      0,
      new Date().toISOString(),
    );
  return id;
}

describe("Phase 5 — classroom polish", () => {
  it("endGame flips status to 'ended' and blocks student rolls", () => {
    const { gameId, teamIds } = makeStartedGame();
    const game = endGame(gameId);
    expect(game.status).toBe("ended");
    expect(queries.gameById(gameId)!.status).toBe("ended");
    expect(() => roll(gameId, teamIds[0]!)).toThrow();
  });

  it("scoring: first-try year yields +100 cleanBooksBonus", () => {
    const { gameId, teamIds } = makeStartedGame("accrual");
    const teamId = teamIds[0]!;
    // Seed a single first_try student entry in year 1.
    getDb()
      .prepare(
        `INSERT INTO pending_actions (id, game_id, team_id, kind, payload, expected_entries, status, attempts, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        crypto.randomUUID(),
        gameId,
        teamId,
        "event_card",
        JSON.stringify({}),
        JSON.stringify([
          {
            teamId,
            description: "test",
            lines: [
              { accountName: "Cash", debit: 250, credit: 0 },
              { accountName: "Event Revenue", debit: 0, credit: 250 },
            ],
          },
        ]),
        "awaiting_journal",
        0,
        new Date().toISOString(),
      );
    postEntry({
      gameId,
      teamId,
      turnId: "1",
      description: "first try entry",
      sourceEventId: "test-1",
      year: 1,
      isStudentSubmitted: true,
      isCorrect: true,
      attemptOutcome: "first_try",
      lines: [
        { accountName: "Cash", debit: 250, credit: 0 },
        { accountName: "Event Revenue", debit: 0, credit: 250 },
      ],
    });
    activateYearEnd(gameId, teamId, "1");
    let guard = 0;
    while (guard < 20) {
      const p = queries.yearEndPendingByTeam(teamId);
      if (!p) break;
      resolveYearEndStep(gameId, teamId, "continue");
      guard++;
    }
    const snap = queries.yearSnapshotsForTeam(teamId)[0];
    expect(snap).toBeTruthy();
    expect(snap!.score).toBeGreaterThan(0);
    // Score = netIncome (250) + cash*0.1 + cleanBooksBonus (100) − loan*0.1 (0).
    // After closing, netIncome inside the snapshot is captured BEFORE closing entries.
    const statements = snap!.statements as any;
    expect(statements.scoreBreakdown.cleanBooksBonus).toBe(100);
    expect(statements.scoreBreakdown.netIncome).toBe(250);
    const completed = queries.eventsByGame(gameId).find((e) => e.type === "year_end_completed");
    expect((completed!.payload as { netIncome?: number }).netIncome).toBe(250);
  });

  it("scoring: a revealed entry zeroes the cleanBooksBonus", () => {
    const { gameId, teamIds } = makeStartedGame("accrual");
    const teamId = teamIds[0]!;
    postEntry({
      gameId,
      teamId,
      turnId: "1",
      description: "revealed entry",
      sourceEventId: "test-rev",
      year: 1,
      isStudentSubmitted: false,
      isCorrect: true,
      attemptOutcome: "revealed",
      lines: [
        { accountName: "Cash", debit: 100, credit: 0 },
        { accountName: "Event Revenue", debit: 0, credit: 100 },
      ],
    });
    activateYearEnd(gameId, teamId, "1");
    let guard = 0;
    while (guard < 20) {
      const p = queries.yearEndPendingByTeam(teamId);
      if (!p) break;
      resolveYearEndStep(gameId, teamId, "continue");
      guard++;
    }
    const snap = queries.yearSnapshotsForTeam(teamId)[0]!;
    const statements = snap.statements as any;
    expect(statements.scoreBreakdown.cleanBooksBonus).toBe(0);
  });

  it("scoring: system entries (closing/interest/auto-post) don't affect the bonus", () => {
    const { gameId, teamIds } = makeStartedGame("accrual");
    const teamId = teamIds[0]!;
    postEntry({
      gameId,
      teamId,
      turnId: "1",
      description: "first try",
      sourceEventId: "test-1",
      year: 1,
      isStudentSubmitted: true,
      isCorrect: true,
      attemptOutcome: "first_try",
      lines: [
        { accountName: "Cash", debit: 300, credit: 0 },
        { accountName: "Event Revenue", debit: 0, credit: 300 },
      ],
    });
    // A bunch of system entries (interest, counterparty auto-posts) in the same year.
    for (let i = 0; i < 3; i++) {
      postEntry({
        gameId,
        teamId,
        turnId: "1",
        description: "system",
        sourceEventId: `sys-${i}`,
        year: 1,
        isStudentSubmitted: false,
        isCorrect: true,
        attemptOutcome: "system",
        lines: [
          { accountName: "Interest Expense", debit: 10, credit: 0 },
          { accountName: "Cash", debit: 0, credit: 10 },
        ],
      });
    }
    activateYearEnd(gameId, teamId, "1");
    let guard = 0;
    while (guard < 20) {
      const p = queries.yearEndPendingByTeam(teamId);
      if (!p) break;
      resolveYearEndStep(gameId, teamId, "continue");
      guard++;
    }
    const snap = queries.yearSnapshotsForTeam(teamId)[0]!;
    const statements = snap.statements as any;
    expect(statements.scoreBreakdown.cleanBooksBonus).toBe(100);
  });

  it("exportService JSON contains the event-sourced record without teacherPinHash", () => {
    const { gameId } = makeStartedGame();
    const json = exportGame(gameId, "json");
    const parsed = JSON.parse(json);
    expect(parsed.game.id).toBe(gameId);
    expect(parsed.game.teacherPinHash).toBeUndefined();
    expect(parsed.teams.length).toBe(2);
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(Array.isArray(parsed.journalEntries)).toBe(true);
    expect(Array.isArray(parsed.yearSnapshots)).toBe(true);
  });

  it("getGameState omits teacherPinHash from broadcasts", () => {
    const { gameId } = makeStartedGame();
    const state = getGameState(gameId);
    expect((state.game as { teacherPinHash?: string }).teacherPinHash).toBeUndefined();
    expect(queries.gameById(gameId)!.teacherPinHash).toBeTruthy();
  });

  it("exportService CSV has the three sections and the headers", () => {
    const { gameId } = makeStartedGame();
    const csv = exportGame(gameId, "csv");
    expect(csv).toContain("section,team,turn,year,description,debit_account,credit_account,amount,is_student_submitted,attempt_outcome");
    expect(csv).toContain("section,team,account,type,balance");
    expect(csv).toContain("section,team,year,score,cumulative");
    void gameId;
  });

  it("settings allowStudentFullHint + showScores persist into the game row", () => {
    const game = createGame({
      difficulty: "cash",
      numberOfTeams: 2,
      propertyAllocationRatio: 0,
      startingCash: 1500,
      startingLoanLimit: 500,
      allowStudentFullHint: true,
      showScores: false,
    });
    expect(game.settings.allowStudentFullHint).toBe(true);
    expect(game.settings.showScores).toBe(false);
  });

  it("hint endpoint gates level 4 and increments only the active pending", async () => {
    const { gameId, teamIds, teamTokens } = makeStartedGame("accrual");
    const teamA = teamIds[0]!;
    const teamB = teamIds[1]!;
    const journalId = seedJournalPending(gameId, teamA);
    activateYearEnd(gameId, teamB, "1");
    const yearEndPending = queries.yearEndPendingByTeam(teamB);
    expect(yearEndPending).toBeTruthy();

    const { ok, json } = await post(
      `/api/games/${gameId}/hint`,
      { level: 4 },
      teamTokens[teamA],
    );
    expect(ok).toBe(true);
    const body = json as { gated: boolean; hintsUsed: number };
    expect(body.gated).toBe(true);
    expect(body.hintsUsed).toBe(1);
    expect(queries.pendingByGame(gameId)!.hintsUsed).toBe(1);
    expect(queries.pendingByGame(gameId)!.id).toBe(journalId);
    expect(queries.yearEndPendingByTeam(teamB)!.hintsUsed).toBe(0);
  });

  it("clone copies settings into a new room", async () => {
    const { gameId, teacherToken } = makeStartedGame("accrual");
    const { ok, json } = await post(`/api/games/${gameId}/clone`, {}, teacherToken);
    expect(ok).toBe(true);
    const body = json as { game: { id: string; settings: { allowStudentFullHint: boolean; showScores: boolean } } };
    expect(body.game.id).not.toBe(gameId);
    expect(body.game.settings.allowStudentFullHint).toBe(false);
    expect(body.game.settings.showScores).toBe(true);
  });

  it("submitJournalEntry returns before/after balanceChanges", () => {
    const { gameId, teamIds } = makeStartedGame();
    const teamId = teamIds[0]!;
    seedJournalPending(gameId, teamId);
    const cashBefore = balanceOf(teamId, "Cash");
    const revenueBefore = balanceOf(teamId, "Rent Revenue");
    const result = submitJournalEntry(gameId, teamId, {
      debitAccount: "Cash",
      creditAccount: "Rent Revenue",
      amount: 100,
    });
    expect(result.correct).toBe(true);
    expect(result.balanceChanges).toEqual([
      { accountName: "Cash", before: cashBefore, after: cashBefore + 100 },
      { accountName: "Rent Revenue", before: revenueBefore, after: revenueBefore + 100 },
    ]);
  });

  it("pendingToView exposes id, createdAt, and hintsUsed for stuck badges", () => {
    const { gameId, teamIds } = makeStartedGame();
    const teamId = teamIds[0]!;
    const pendingId = seedJournalPending(gameId, teamId);
    queries.incPendingHints(pendingId);
    const state = getGameState(gameId);
    expect(state.pending?.id).toBe(pendingId);
    expect(state.pending?.createdAt).toBeTruthy();
    expect(state.pending?.hintsUsed).toBe(1);
  });
});
