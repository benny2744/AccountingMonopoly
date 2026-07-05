import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, closeDb, getDb } from "../db/client.js";
import { runMigrations } from "../db/schema.js";
import { createApp } from "../app.js";
import { createGame, startGame, forceNextTurn } from "./gameService.js";
import { queries } from "../db/queries.js";
import { createTeacherSession, createTeamSession, createDisplaySession } from "./sessionsService.js";
import { roll, resolveChoice, submitJournalEntry, endTurn, takeLoanForPendingFee } from "./turnService.js";
import { startYearEnd, resolveYearEndStep, buildYearEndSteps } from "./yearEndService.js";
import { balanceOf, postExpectedAsSystem } from "./accountingService.js";
import { accounting } from "@amono/shared";

let httpServer: HttpServer;
let port: number;

beforeAll(async () => {
  openDb(":memory:");
  runMigrations();
  const app = createApp();
  httpServer = createServer(app);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  port = (httpServer.address() as AddressInfo).port;
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

interface Setup {
  gameId: string;
  teamIds: string[];
  teamTokens: Record<string, string>;
  teacherToken: string;
}

function makeAccrualGame(numTeams = 2): Setup {
  const game = createGame({
    teacherPin: "1234",
    difficulty: "accrual",
    numberOfTeams: numTeams,
    propertyAllocationRatio: 0,
    startingCash: 1500,
    startingLoanLimit: 500,
  });
  const teams = queries.teamsByGame(game.id);
  const teamTokens: Record<string, string> = {};
  for (const t of teams) {
    teamTokens[t.id] = createTeamSession(game.id, t.id, "tester").token;
  }
  // startGame requires at least 2 joined sessions — created above.
  startGame(game.id, "1234");
  const teacherToken = createTeacherSession(game.id, "1234").token;
  return { gameId: game.id, teamIds: teams.map((t) => t.id), teamTokens, teacherToken };
}

function givePropertyTo(gameId: string, teamId: string): void {
  const props = queries.propertiesByGame(gameId).filter((p) => !p.ownerTeamId);
  if (props.length === 0) return;
  const prop = props[0]!;
  getDb().prepare("UPDATE properties SET owner_team_id = ? WHERE id = ?").run(teamId, prop.id);
  postExpectedAsSystem(
    gameId,
    teamId,
    "setup",
    accounting.propertyAssignedAtSetup(teamId, prop.purchasePrice, prop.name),
    1,
  );
}

/** Seed a player-credit rent so debtor has A/P and creditor has A/R. */
function seedPlayerCreditRent(gameId: string, debtorId: string, creditorId: string, amount: number): void {
  const entries = accounting.rentPaidCredit(debtorId, creditorId, amount);
  for (const e of entries) {
    postExpectedAsSystem(gameId, e.teamId, "seed", e, 1);
  }
  getDb()
    .prepare(
      `INSERT INTO credit_balances (id, game_id, debtor_team_id, creditor_team_id, amount, source_event_id, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(crypto.randomUUID(), gameId, debtorId, creditorId, amount, "seed-rent", "open", new Date().toISOString());
}

function mockDice(d1: number, d2: number): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(Math, "random")
    .mockReturnValueOnce((d1 - 0.5) / 6)
    .mockReturnValueOnce((d2 - 0.5) / 6);
}

function setTeamPosition(teamId: string, position: number): void {
  getDb().prepare("UPDATE teams SET position = ? WHERE id = ?").run(position, teamId);
}

function setCurrentTeam(gameId: string, teamId: string, turnPhase: "awaiting_roll" | "awaiting_end" = "awaiting_roll"): void {
  getDb().prepare("UPDATE games SET current_team_id = ?, turn_phase = ? WHERE id = ?").run(teamId, turnPhase, gameId);
}

function primeDeck(gameId: string, cardIds: string[]): void {
  getDb().prepare("UPDATE deck_order SET pointer = 0, cards = ? WHERE game_id = ?").run(JSON.stringify(cardIds), gameId);
}

function advanceYearEnd(
  gameId: string,
  teamId: string,
  settleChoice: "pay_cash" | "roll_to_loan" = "pay_cash",
): void {
  let guard = 0;
  while (guard < 20) {
    const pending = queries.yearEndPendingByTeam(teamId);
    if (!pending) break;
    const payload = pending.payload as { currentStep: number; steps: { kind: string }[] };
    const step = payload.steps[payload.currentStep];
    if (!step || step.kind === "done") break;
    const choice: "pay_cash" | "roll_to_loan" | "continue" = step.kind === "settle_ap" ? settleChoice : "continue";
    resolveYearEndStep(gameId, teamId, choice);
    guard++;
  }
}

const apiBase = () => `http://127.0.0.1:${port}`;
async function postJson(path: string, body: unknown, token?: string) {
  const r = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
}

describe("Phase 4 — accrual mode", () => {
  it("rent on credit creates A/P for debtor and A/R for creditor; schedule shows both sides", () => {
    const s = makeAccrualGame(2);
    const debtor = s.teamIds[0]!;
    const creditor = s.teamIds[1]!;
    seedPlayerCreditRent(s.gameId, debtor, creditor, 120);

    expect(balanceOf(debtor, "Accounts Payable")).toBe(120);
    expect(balanceOf(debtor, "Rent Expense")).toBe(120);
    expect(balanceOf(creditor, "Accounts Receivable")).toBe(120);
    expect(balanceOf(creditor, "Rent Revenue")).toBe(120);

    const schedule = accounting.generateARAPSchedule(
      debtor,
      queries.teamsByGame(s.gameId),
      queries.creditBalancesByGame(s.gameId),
    );
    expect(schedule.rows.find((r) => r.type === "payable")).toBeTruthy();
    const credSchedule = accounting.generateARAPSchedule(
      creditor,
      queries.teamsByGame(s.gameId),
      queries.creditBalancesByGame(s.gameId),
    );
    expect(credSchedule.rows.find((r) => r.type === "receivable")).toBeTruthy();
  });

  it("credit limit exceeded → rejected; teacher override raises limit → allowed", () => {
    const s = makeAccrualGame(2);
    const debtor = s.teamIds[0]!;
    const creditor = s.teamIds[1]!;
    // Default credit limit is 500 (from settings).
    seedPlayerCreditRent(s.gameId, debtor, creditor, 400);
    // Force a property landing → rent_due with amount 200 (total AP would be 600 > 500).
    const props = queries.propertiesByGame(s.gameId);
    const prop = props.find((p) => !p.ownerTeamId)!;
    getDb().prepare("UPDATE properties SET owner_team_id = ? WHERE id = ?").run(creditor, prop.id);
    // Fake a rent_due pending.
    getDb()
      .prepare(
        `INSERT INTO pending_actions (id, game_id, team_id, kind, payload, expected_entries, status, attempts, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        crypto.randomUUID(),
        s.gameId,
        debtor,
        "rent_due",
        JSON.stringify({ propertyId: prop.id, rent: 200, ownerTeamId: creditor }),
        JSON.stringify([]),
        "awaiting_choice",
        0,
        new Date().toISOString(),
      );
    expect(() => resolveChoice(s.gameId, debtor, { choice: "player_credit" })).toThrowError(/exceed limit/i);

    // Teacher raises limit.
    queries.setTeamCreditLimit(debtor, 1000);
    // Should now succeed (pending advances to awaiting_journal — entry posts at submit time).
    resolveChoice(s.gameId, debtor, { choice: "player_credit" });
    const pending = queries.pendingByGame(s.gameId);
    expect(pending?.status).toBe("awaiting_journal");
  });

  it("full year-end: mixed A/P choices, prepaid recognition, closing entries, balances", () => {
    const s = makeAccrualGame(2);
    const debtor = s.teamIds[0]!;
    const creditor = s.teamIds[1]!;

    // Seed open A/P / A/R between the two teams.
    seedPlayerCreditRent(s.gameId, debtor, creditor, 100);
    // Seed a prepaid internet plan ($120) for the debtor.
    postExpectedAsSystem(s.gameId, debtor, "seed", accounting.prepaidPurchase(debtor, 120, "Internet plan"), 1);
    getDb()
      .prepare(
        `INSERT INTO deferred_settlements (id, game_id, team_id, kind, amount, account_name, counter_account_name, source_event_id, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        crypto.randomUUID(),
        s.gameId,
        debtor,
        "recognize_prepaid",
        120,
        "Prepaid Services",
        "Internet Expense",
        "seed-prepaid",
        "open",
        new Date().toISOString(),
      );

    // Run the debtor's year-end.
    startYearEnd(s.gameId, debtor);
    const steps = buildYearEndSteps(s.gameId, debtor);
    // Expect: collect_ar(0), settle_ap(1), recognize_prepaid(1), snapshot, closing, done.
    expect(steps.some((x) => x.kind === "settle_ap")).toBe(true);
    expect(steps.some((x) => x.kind === "recognize_prepaid")).toBe(true);

    // Walk every step; settle_ap → pay_cash (cash > 100 so allowed).
    advanceYearEnd(s.gameId, debtor, "pay_cash");

    // After year-end: debtor's Accounts Payable should be 0.
    expect(balanceOf(debtor, "Accounts Payable")).toBe(0);
    // Prepaid Services should be 0 (recognized).
    expect(balanceOf(debtor, "Prepaid Services")).toBe(0);
    // Revenue/Expense accounts are closed to Retained Earnings → all zero.
    expect(balanceOf(debtor, "Rent Expense")).toBe(0);
    expect(balanceOf(debtor, "Internet Expense")).toBe(0);
    // Balance sheet balances.
    const accounts = queries.accountsByTeam(debtor);
    const lines = queries.linesForTeam(debtor);
    const bs = accounting.generateBalanceSheet(accounts, lines);
    expect(bs.balances).toBe(true);
    // Year was bumped.
    const team = queries.teamsByGame(s.gameId).find((t) => t.id === debtor)!;
    expect(team.currentYear).toBe(2);
    // Snapshot was written.
    const snap = getDb().prepare("SELECT * FROM year_snapshots WHERE team_id = ?").get(debtor) as any;
    expect(snap).toBeTruthy();
    const statements = JSON.parse(snap.statements);
    expect(statements.balanceSheet).toBeTruthy();
  });

  it("rolling A/P to loan at year-end: loan absorbs the payable, creditor still collects", () => {
    const s = makeAccrualGame(2);
    const debtor = s.teamIds[0]!;
    const creditor = s.teamIds[1]!;
    seedPlayerCreditRent(s.gameId, debtor, creditor, 150);

    startYearEnd(s.gameId, debtor);
    advanceYearEnd(s.gameId, debtor, "roll_to_loan");
    expect(balanceOf(debtor, "Accounts Payable")).toBe(0);
    expect(balanceOf(debtor, "Loan Payable")).toBe(150);
    // Creditor collected cash via the bank settlement.
    expect(balanceOf(creditor, "Accounts Receivable")).toBe(0);
  });

  it("cash mode rejects accrual accounts at journal validation", () => {
    const game = createGame({
      teacherPin: "1234",
      difficulty: "cash",
      numberOfTeams: 2,
      propertyAllocationRatio: 0,
      startingCash: 1500,
      startingLoanLimit: 500,
    });
    const teams = queries.teamsByGame(game.id);
    for (const t of teams) createTeamSession(game.id, t.id, "tester");
    startGame(game.id, "1234");
    const teamId = teams[0]!.id;
    // Build a pending action with an expected entry referencing an accrual account.
    getDb()
      .prepare(
        `INSERT INTO pending_actions (id, game_id, team_id, kind, payload, expected_entries, status, attempts, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        crypto.randomUUID(),
        game.id,
        teamId,
        "event_card",
        JSON.stringify({}),
        JSON.stringify([
          {
            teamId,
            description: "test",
            lines: [
              { accountName: "Repair Expense", debit: 100, credit: 0 },
              { accountName: "Accounts Payable", debit: 0, credit: 100 },
            ],
          },
        ]),
        "awaiting_journal",
        0,
        new Date().toISOString(),
      );
    const result = submitJournalEntry(game.id, teamId, {
      debitAccount: "Repair Expense",
      creditAccount: "Accounts Payable",
      amount: 100,
    });
    expect(result.correct).toBe(false);
  });

  it("loan-for-fee softlock fix: stuck team can take a loan and then journal", () => {
    const s = makeAccrualGame(2);
    const teamId = s.teamIds[0]!;
    // Drain cash.
    postExpectedAsSystem(
      s.gameId,
      teamId,
      "drain",
      accounting.fromLines(teamId, "drain", [
        { accountName: "Event Expense", debit: 1490, credit: 0 },
        { accountName: "Cash", debit: 0, credit: 1490 },
      ]),
      1,
    );
    // Create a space_fee pending for $100.
    getDb()
      .prepare(
        `INSERT INTO pending_actions (id, game_id, team_id, kind, payload, expected_entries, status, attempts, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        crypto.randomUUID(),
        s.gameId,
        teamId,
        "space_fee",
        JSON.stringify({ amount: 100 }),
        JSON.stringify([
          {
            teamId,
            description: "fee",
            lines: [
              { accountName: "Repair Expense", debit: 100, credit: 0 },
              { accountName: "Cash", debit: 0, credit: 100 },
            ],
          },
        ]),
        "awaiting_journal",
        0,
        new Date().toISOString(),
      );
    expect(balanceOf(teamId, "Cash")).toBe(10);
    // Take a $100 loan → cash becomes $110.
    takeLoanForPendingFee(s.gameId, teamId, 100);
    expect(balanceOf(teamId, "Cash")).toBe(110);
    // Now the journal entry can succeed.
    const result = submitJournalEntry(s.gameId, teamId, {
      debitAccount: "Repair Expense",
      creditAccount: "Cash",
      amount: 100,
    });
    expect(result.correct).toBe(true);
  });

  it("creditor-first year-end: creditor collect rolls debtor A/P to loan; both sheets balance", () => {
    const s = makeAccrualGame(2);
    const debtor = s.teamIds[0]!;
    const creditor = s.teamIds[1]!;
    seedPlayerCreditRent(s.gameId, debtor, creditor, 100);

    startYearEnd(s.gameId, creditor);
    advanceYearEnd(s.gameId, creditor);

    expect(balanceOf(creditor, "Accounts Receivable")).toBe(0);
    expect(balanceOf(debtor, "Accounts Payable")).toBe(0);
    expect(balanceOf(debtor, "Loan Payable")).toBe(100);
    const cb = queries.creditBalancesByGame(s.gameId)[0]!;
    expect(cb.status).toBe("rolled_to_loan");

    for (const teamId of [debtor, creditor]) {
      const accounts = queries.accountsByTeam(teamId);
      const lines = queries.linesForTeam(teamId);
      expect(accounting.generateBalanceSheet(accounts, lines).balances).toBe(true);
    }
  });

  it("passing GO on a rest landing opens year-end checklist the same turn", () => {
    const s = makeAccrualGame(2);
    const teamId = s.teamIds[0]!;
    setCurrentTeam(s.gameId, teamId);
    setTeamPosition(teamId, 23);
    const spy = mockDice(6, 6);
    roll(s.gameId, teamId);
    spy.mockRestore();

    expect(queries.yearEndPendingByTeam(teamId)).toBeTruthy();
    expect(queries.gameById(s.gameId)?.turnPhase).toBe("awaiting_end");
  });

  it("concurrency: team B plays while team A is in year-end; team A roll blocked", () => {
    const s = makeAccrualGame(2);
    const teamA = s.teamIds[0]!;
    const teamB = s.teamIds[1]!;
    startYearEnd(s.gameId, teamA);
    expect(queries.yearEndPendingByTeam(teamA)).toBeTruthy();

    setCurrentTeam(s.gameId, teamB);
    setTeamPosition(teamB, 9);
    const spy = mockDice(1, 1);
    roll(s.gameId, teamB);
    spy.mockRestore();
    endTurn(s.gameId);

    setCurrentTeam(s.gameId, teamA);
    expect(() => roll(s.gameId, teamA)).toThrowError(/year-end checklist/i);

    setCurrentTeam(s.gameId, teamB);
    expect(() => resolveYearEndStep(s.gameId, teamA, "continue")).not.toThrow();
  });

  it("credit_method_modifier card resolves without softlock", () => {
    const s = makeAccrualGame(2);
    const teamId = s.teamIds[0]!;
    primeDeck(s.gameId, ["accrual_player_rent_credit"]);
    setCurrentTeam(s.gameId, teamId);
    setTeamPosition(teamId, 4);
    const spy = mockDice(1, 1);
    roll(s.gameId, teamId);
    spy.mockRestore();

    const pending = queries.pendingByGame(s.gameId);
    expect(pending).toBeNull();
    expect(queries.gameById(s.gameId)?.turnPhase).toBe("awaiting_end");
    expect(() => endTurn(s.gameId)).not.toThrow();
  });

  it("forceNextTurn past an accrual card leaves no orphan deferred row", () => {
    const s = makeAccrualGame(2);
    const teamId = s.teamIds[0]!;
    primeDeck(s.gameId, ["accrual_software_subscription"]);
    setCurrentTeam(s.gameId, teamId);
    setTeamPosition(teamId, 4);
    const spy = mockDice(1, 1);
    roll(s.gameId, teamId);
    spy.mockRestore();

    expect(queries.pendingByGame(s.gameId)?.status).toBe("awaiting_journal");
    expect((getDb().prepare("SELECT COUNT(*) AS c FROM deferred_settlements").get() as { c: number }).c).toBe(0);
    forceNextTurn(s.gameId);
    expect((getDb().prepare("SELECT COUNT(*) AS c FROM deferred_settlements").get() as { c: number }).c).toBe(0);
  });

  it("year-end auth: display/other team rejected; teacher allowed", async () => {
    const s = makeAccrualGame(2);
    const teamA = s.teamIds[0]!;
    const teamB = s.teamIds[1]!;
    const displayToken = createDisplaySession(s.gameId).token;

    const displayStart = await postJson(`/api/games/${s.gameId}/year-end/start`, { teamId: teamA }, displayToken);
    expect(displayStart.status).toBe(401);

    const otherTeamStart = await postJson(`/api/games/${s.gameId}/year-end/start`, { teamId: teamA }, s.teamTokens[teamB]);
    expect(otherTeamStart.status).toBe(401);

    startYearEnd(s.gameId, teamA);
    const otherResolve = await postJson(
      `/api/games/${s.gameId}/year-end/resolve-step`,
      { teamId: teamA, choice: "continue" },
      s.teamTokens[teamB],
    );
    expect(otherResolve.status).toBe(401);

    const teacherResolve = await postJson(
      `/api/games/${s.gameId}/year-end/resolve-step`,
      { teamId: teamA, choice: "continue" },
      s.teacherToken,
    );
    expect(teacherResolve.status).toBe(200);
  });
});
