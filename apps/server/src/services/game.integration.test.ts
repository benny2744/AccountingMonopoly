import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { openDb, closeDb, getDb } from "../db/client.js";
import { runMigrations } from "../db/schema.js";
import { createApp } from "../app.js";

let port: number;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  openDb(":memory:");
  runMigrations();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
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

const B = () => `http://127.0.0.1:${port}`;
async function get(path: string, token?: string): Promise<any> {
  const r = await fetch(B() + path, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  return r.json();
}
async function post(path: string, body: any, token?: string): Promise<{ ok: boolean; status: number; json: any }> {
  const r = await fetch(B() + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  return { ok: r.ok, status: r.status, json };
}

/** Create a game and return a teacher session token for authenticated calls. */
async function createGameWithSession(opts: {
  propertyAllocationRatio?: 0 | 0.25 | 0.5 | 0.75;
  numberOfTeams?: number;
  difficulty?: "cash" | "accrual";
} = {}): Promise<{ gameId: string; token: string; teamTokens: Record<string, string> }> {
  const { json } = await post("/api/games", {
    teacherPin: "1234",
    difficulty: opts.difficulty ?? "cash",
    numberOfTeams: opts.numberOfTeams ?? 3,
    propertyAllocationRatio: opts.propertyAllocationRatio ?? 0.25,
    startingCash: 1500,
    startingLoanLimit: 500,
  });
  const gameId = json.game.id;
  const teacherToken = json.sessionToken;
  // Pre-issue a session per team so action calls can authenticate as that team.
  const state = await get(`/api/games/${gameId}`);
  const teamTokens: Record<string, string> = {};
  for (const tv of state.teams) {
    const j = await post(`/api/games/${gameId}/join`, { teamId: tv.team.id });
    teamTokens[tv.team.id] = j.json.sessionToken;
  }
  return { gameId, token: teacherToken, teamTokens };
}

async function createGameWithOptions(opts: {
  propertyAllocationRatio?: 0 | 0.25 | 0.5 | 0.75;
  numberOfTeams?: number;
} = {}): Promise<string> {
  const { gameId, token } = await createGameWithSession(opts);
  await post(`/api/games/${gameId}/start`, { teacherPin: "1234" }, token);
  return gameId;
}

async function createAndStart(): Promise<string> {
  return createGameWithOptions();
}

async function tokensFor(gameId: string): Promise<{ token: string; teamTokens: Record<string, string> }> {
  const state = await get(`/api/games/${gameId}`);
  const teacherJoin = await post(`/api/games/by-code/${state.game.roomCode}/teacher-join`, { teacherPin: "1234" });
  const teamTokens: Record<string, string> = {};
  for (const tv of state.teams) {
    const j = await post(`/api/games/${gameId}/join`, { teamId: tv.team.id });
    teamTokens[tv.team.id] = j.json.sessionToken;
  }
  return { token: teacherJoin.json.sessionToken, teamTokens };
}

/** Advance the active team until buy_or_skip or throw after max steps. */
async function rollUntilBuyOrSkip(gameId: string, maxSteps = 80): Promise<{ teamId: string; pending: any; teamTokens: Record<string, string> }> {
  const { token, teamTokens } = await tokensFor(gameId);
  for (let i = 0; i < maxSteps; i++) {
    const s = await get(`/api/games/${gameId}`);
    const teamId = s.game.currentTeamId;
    const pending = s.pending;

    if (pending?.kind === "buy_or_skip") {
      return { teamId, pending, teamTokens };
    }

    if (pending?.status === "awaiting_choice") {
      const choice = pending.kind === "rent_due" ? "cash" : "skip";
      if (pending.kind === "bank_stop") {
        await post(`/api/games/${gameId}/resolve-event`, { teamId: pending.teamId, choice: "pass" }, teamTokens[pending.teamId]);
      } else {
        await post(`/api/games/${gameId}/resolve-event`, { teamId: pending.teamId, choice }, teamTokens[pending.teamId]);
      }
      continue;
    }

    if (pending?.status === "awaiting_journal") {
      const expected = (pending.expectedEntries || []).find((e: any) => e.teamId === pending.teamId) ?? pending.expectedEntries[0];
      const debit = expected.lines.find((l: any) => l.debit > 0);
      const credit = expected.lines.find((l: any) => l.credit > 0);
      await post(`/api/games/${gameId}/submit-journal-entry`, {
        teamId: pending.teamId,
        debitAccount: debit.accountName,
        creditAccount: credit.accountName,
        amount: debit.debit,
      }, teamTokens[pending.teamId]);
      continue;
    }

    if (s.game.turnPhase === "awaiting_end") {
      await post(`/api/games/${gameId}/end-turn`, {}, token);
      continue;
    }

    if (s.game.turnPhase === "awaiting_roll") {
      await post(`/api/games/${gameId}/roll`, { teamId }, teamTokens[teamId]);
    }
  }
  throw new Error("did not land on unowned property");
}

async function driveUntilJournal(gameId: string): Promise<{ state: any; teamId: string; teamTokens: Record<string, string>; token: string }> {
  const { token, teamTokens } = await tokensFor(gameId);
  for (let i = 0; i < 30; i++) {
    const s = await get(`/api/games/${gameId}`);
    const tid = s.game.currentTeamId;
    const roll = await post(`/api/games/${gameId}/roll`, { teamId: tid }, teamTokens[tid]);
    const p = roll.json.state?.pending;
    if (p?.status === "awaiting_journal") return { state: roll.json.state, teamId: tid, teamTokens, token };
    if (p?.status === "awaiting_choice") {
      let choice = "pass";
      if (p.kind === "buy_or_skip") choice = "skip";
      if (p.kind === "rent_due") choice = "cash";
      const r = await post(`/api/games/${gameId}/resolve-event`, { teamId: p.teamId, choice }, teamTokens[p.teamId]);
      if (r.json.state?.pending?.status === "awaiting_journal") {
        return { state: r.json.state, teamId: p.teamId, teamTokens, token };
      }
      if (r.json.state?.turnPhase === "awaiting_end" || r.json.state?.game?.turnPhase === "awaiting_end") {
        await post(`/api/games/${gameId}/end-turn`, {}, token);
      }
    }
    if (roll.json.state?.game?.turnPhase === "awaiting_end") {
      await post(`/api/games/${gameId}/end-turn`, {}, token);
    }
  }
  throw new Error("no journal pending in 30 rolls");
}

/** Journal the currently-open pending action on behalf of `teamId`. */
async function journalCurrentPending(gameId: string, teamId: string, token: string): Promise<{ ok: boolean; json: any }> {
  const state = await get(`/api/games/${gameId}`);
  const pending = state.pending;
  if (!pending) return { ok: false, json: { error: { code: "NO_PENDING" } } };
  const expected = (pending.expectedEntries || []).find((e: any) => e.teamId === teamId);
  if (!expected) return { ok: false, json: { error: { code: "NO_EXPECTED" } } };
  const debit = expected.lines.find((l: any) => l.debit > 0);
  const credit = expected.lines.find((l: any) => l.credit > 0);
  return post(`/api/games/${gameId}/submit-journal-entry`, {
    teamId,
    debitAccount: debit.accountName,
    creditAccount: credit.accountName,
    amount: debit.debit,
  }, token);
}

describe("game lifecycle (Phase 2 integration)", () => {
  it("creates, starts, allocates opening entries, balance sheets balance", async () => {
    const gameId = await createAndStart();
    const state = await get(`/api/games/${gameId}`);
    expect(state.game.status).toBe("active");
    expect(state.game.turnPhase).toBe("awaiting_roll");
    expect(state.teams.length).toBe(3);
    for (const tv of state.teams) {
      expect(tv.cash).toBe(1500);
      const stmts = await get(`/api/games/${gameId}/teams/${tv.team.id}/statements`);
      expect(stmts.balanceSheet.balances).toBe(true);
      expect(stmts.balanceSheet.totalAssets).toBeGreaterThan(0);
    }
  });

  it("rejects incorrect teacher PIN on start", async () => {
    const { gameId, token } = await createGameWithSession({ numberOfTeams: 2, propertyAllocationRatio: 0 });
    // Use a separate game created without a session to test PIN rejection.
    const { json } = await post("/api/games", {
      teacherPin: "1234",
      difficulty: "cash",
      numberOfTeams: 2,
      propertyAllocationRatio: 0,
      startingCash: 1500,
      startingLoanLimit: 500,
    });
    void gameId; void token;
    const res = await post(`/api/games/${json.game.id}/start`, { teacherPin: "wrong" }, json.sessionToken);
    expect(res.ok).toBe(false);
    expect(res.json.error.code).toBe("INVALID_PIN");
  });

  it("drives a full turn with a journal entry and verifies posting", async () => {
    const gameId = await createAndStart();
    const { state, teamId, teamTokens } = await driveUntilJournal(gameId);
    const expected = (state.pending.expectedEntries || []).find((e: any) => e.teamId === teamId);
    const debit = expected.lines.find((l: any) => l.debit > 0);
    const credit = expected.lines.find((l: any) => l.credit > 0);
    const res = await post(`/api/games/${gameId}/submit-journal-entry`, {
      teamId,
      debitAccount: debit.accountName,
      creditAccount: credit.accountName,
      amount: debit.debit,
    }, teamTokens[teamId]);
    expect(res.json.result.correct).toBe(true);

    // If the entry chains to a counterparty, journal their side too.
    if (res.json.result.chainedTo) {
      const ct: string = res.json.result.chainedTo;
      const tk = teamTokens[ct]!;
      const receiverRes = await journalCurrentPending(gameId, ct, tk);
      expect(receiverRes.ok).toBe(true);
    }

    const after = await get(`/api/games/${gameId}`);
    expect(after.pending).toBeNull();
    expect(after.game.turnPhase).toBe("awaiting_end");
    const ta = await get(`/api/games/${gameId}/teams/${teamId}/t-accounts`);
    expect(Array.isArray(ta)).toBe(true);
  });

  it("blocks a second roll until end turn, then advances to the next team", async () => {
    const gameId = await createAndStart();
    const { teamId, teamTokens, token } = await driveUntilJournal(gameId);
    const state = await get(`/api/games/${gameId}`);
    const expected = state.pending.expectedEntries.find((e: any) => e.teamId === teamId);
    const debit = expected.lines.find((l: any) => l.debit > 0);
    const credit = expected.lines.find((l: any) => l.credit > 0);
    const res = await post(`/api/games/${gameId}/submit-journal-entry`, {
      teamId,
      debitAccount: debit.accountName,
      creditAccount: credit.accountName,
      amount: debit.debit,
    }, teamTokens[teamId]);

    // Resolve any chained counterparty pending before ending the turn.
    if (res.json.result?.chainedTo) {
      const ct: string = res.json.result.chainedTo;
      await journalCurrentPending(gameId, ct, teamTokens[ct]!);
    }

    const secondRoll = await post(`/api/games/${gameId}/roll`, { teamId }, teamTokens[teamId]);
    expect(secondRoll.ok).toBe(false);
    expect(secondRoll.json.error.code).toBe("INVALID_STATE");

    const end = await post(`/api/games/${gameId}/end-turn`, {}, token);
    expect(end.json.state.game.turnPhase).toBe("awaiting_roll");
    const nextTeamId = end.json.state.game.currentTeamId;
    expect(nextTeamId).not.toBe(teamId);

    const nextRoll = await post(`/api/games/${gameId}/roll`, { teamId: nextTeamId }, teamTokens[nextTeamId]);
    expect(nextRoll.ok).toBe(true);
  });

  it("rejects a wrong journal entry with the right error codes", async () => {
    const gameId = await createAndStart();
    const { teamId, teamTokens } = await driveUntilJournal(gameId);
    const res = await post(`/api/games/${gameId}/submit-journal-entry`, {
      teamId,
      debitAccount: "Cash",
      creditAccount: "Owner Capital",
      amount: 1,
    }, teamTokens[teamId]);
    expect(res.json.result.correct).toBe(false);
    expect(res.json.result.errors.length).toBeGreaterThan(0);
  });

  it("prevents out-of-turn rolls", async () => {
    const gameId = await createAndStart();
    const { token: _t, teamTokens } = await tokensFor(gameId);
    void _t;
    const state = await get(`/api/games/${gameId}`);
    const wrongTeam = state.teams.find((t: any) => t.team.id !== state.game.currentTeamId)!.team.id;
    const res = await post(`/api/games/${gameId}/roll`, { teamId: wrongTeam }, teamTokens[wrongTeam]);
    expect(res.ok).toBe(false);
    expect(res.json.error.code).toBe("NOT_YOUR_TURN");
  });

  it("rejects buying a property with insufficient cash", async () => {
    const gameId = await createGameWithOptions({ propertyAllocationRatio: 0 });
    const { teamId, pending, teamTokens } = await rollUntilBuyOrSkip(gameId);
    const price = (pending.payload as { price: number }).price;

    const { postEntry } = await import("./accountingService.js");
    const cash = (await get(`/api/games/${gameId}`)).teams.find((t: any) => t.team.id === teamId)!.cash;
    postEntry({
      gameId,
      teamId,
      turnId: "setup",
      description: "Drain cash for test",
      sourceEventId: "test-drain",
      year: 1,
      isStudentSubmitted: false,
      isCorrect: true,
      lines: [
        { accountName: "Event Expense", debit: cash - (price - 1), credit: 0 },
        { accountName: "Cash", debit: 0, credit: cash - (price - 1) },
      ],
    });

    const buy = await post(`/api/games/${gameId}/resolve-event`, {
      teamId,
      choice: "buy",
    }, teamTokens[teamId]);
    expect(buy.ok).toBe(false);
    expect(buy.json.error.code).toBe("INSUFFICIENT_CASH");
  });

  it("bank loan + interest: a team with a loan is charged interest on its next roll", async () => {
    const gameId = await createAndStart();
    const { teamTokens } = await tokensFor(gameId);
    const state = await get(`/api/games/${gameId}`);
    const currentTeam = state.game.currentTeamId;

    const { postExpectedAsSystem } = await import("./accountingService.js");
    const { accounting } = await import("@amono/shared");
    const teamRow = state.teams.find((t: any) => t.team.id === currentTeam)!;
    postExpectedAsSystem(gameId, currentTeam, "setup", accounting.loanTaken(currentTeam, 300), teamRow.team.currentYear);

    const roll = await post(`/api/games/${gameId}/roll`, { teamId: currentTeam }, teamTokens[currentTeam]);
    const allEvents = roll.json.state?.events ?? [];
    const hasInterest = allEvents.some((e: any) => e.type === "interest_charged");
    expect(hasInterest).toBe(true);
  });

  it("rolls interest to loan when cash is insufficient", async () => {
    const gameId = await createAndStart();
    const { teamTokens } = await tokensFor(gameId);
    const state = await get(`/api/games/${gameId}`);
    const teamId = state.game.currentTeamId;
    const teamRow = state.teams.find((t: any) => t.team.id === teamId)!;

    const { postExpectedAsSystem } = await import("./accountingService.js");
    const { accounting } = await import("@amono/shared");
    postExpectedAsSystem(gameId, teamId, "setup", accounting.loanTaken(teamId, 400), teamRow.team.currentYear);
    // Loan increases cash (+400); drain to $5 so interest (min $10) must roll to loan.
    const { postEntry } = await import("./accountingService.js");
    postEntry({
      gameId,
      teamId,
      turnId: "setup",
      description: "Drain cash",
      sourceEventId: "test-drain2",
      year: 1,
      isStudentSubmitted: false,
      isCorrect: true,
      lines: [
        { accountName: "Event Expense", debit: 1895, credit: 0 },
        { accountName: "Cash", debit: 0, credit: 1895 },
      ],
    });

    const roll = await post(`/api/games/${gameId}/roll`, { teamId }, teamTokens[teamId]);
    const events = roll.json.state?.events ?? [];
    const interestEvent = events.find((e: any) => e.type === "interest_charged");
    expect(interestEvent?.payload?.rolledToLoan).toBe(true);
  });

  it("teacher can add and remove unjoined teams in the lobby", async () => {
    const { gameId, token } = await createGameWithSession({ numberOfTeams: 2 });
    const added = await post(`/api/games/${gameId}/teams`, {}, token);
    expect(added.ok).toBe(true);
    expect(added.json.team.name).toBe("Green");

    const added2 = await post(`/api/games/${gameId}/teams`, {}, token);
    expect(added2.ok).toBe(true);

    const tooMany = await post(`/api/games/${gameId}/teams`, {}, token);
    expect(tooMany.ok).toBe(false);
    expect(tooMany.json.error?.code).toBe("TOO_MANY_TEAMS");

    const remove = await fetch(B() + `/api/games/${gameId}/teams/${added2.json.team.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(remove.ok).toBe(true);

    const state = await get(`/api/games/${gameId}`, token);
    expect(state.teams).toHaveLength(3);
  });
  it("cannot remove a joined team or go below 2 teams", async () => {
    const { gameId, token, teamTokens } = await createGameWithSession({ numberOfTeams: 3 });
    const joinedTeamId = Object.keys(teamTokens)[0]!;
    const joined = await fetch(B() + `/api/games/${gameId}/teams/${joinedTeamId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(joined.ok).toBe(false);
    const body = (await joined.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("TEAM_JOINED");

    // Adding a 4th slot is removable because nobody joined it.
    const added = await post(`/api/games/${gameId}/teams`, {}, token);
    expect(added.ok).toBe(true);
    const removable = await fetch(B() + `/api/games/${gameId}/teams/${added.json.team.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(removable.ok).toBe(true);

    const after = await get(`/api/games/${gameId}`, token);
    expect(after.teams).toHaveLength(3);
  });

  it("cannot add or remove teams after the game starts", async () => {
    const { gameId, token } = await createGameWithSession({ numberOfTeams: 2 });
    await post(`/api/games/${gameId}/start`, { teacherPin: "1234" }, token);
    const add = await post(`/api/games/${gameId}/teams`, {}, token);
    expect(add.ok).toBe(false);
    expect(add.json.error?.code).toBe("INVALID_STATE");
  });

});
