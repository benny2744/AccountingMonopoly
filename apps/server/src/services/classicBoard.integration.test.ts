import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, closeDb, getDb } from "../db/client.js";
import { runMigrations } from "../db/schema.js";
import { createGame, startGame } from "./gameService.js";
import { queries } from "../db/queries.js";
import { createTeamSession } from "./sessionsService.js";
import { roll, buildHouse, submitJournalEntry } from "./turnService.js";
import { game as gameData } from "@amono/shared";

beforeAll(() => {
  openDb(":memory:");
  runMigrations();
});

afterAll(() => closeDb());

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

function makeStartedGame(): { gameId: string; teamIds: string[] } {
  const game = createGame({
    difficulty: "cash",
    numberOfTeams: 2,
    propertyAllocationRatio: 0,
    startingCash: 5000,
    startingLoanLimit: 500,
  });
  const teams = queries.teamsByGame(game.id);
  for (const t of teams) createTeamSession(game.id, t.id, "tester");
  startGame(game.id);
  return { gameId: game.id, teamIds: teams.map((t) => t.id) };
}

function setCurrentTeam(gameId: string, teamId: string): void {
  getDb().prepare("UPDATE games SET current_team_id = ?, turn_phase = 'awaiting_roll' WHERE id = ?").run(teamId, gameId);
}

function setTeamPosition(teamId: string, position: number): void {
  getDb().prepare("UPDATE teams SET position = ? WHERE id = ?").run(position, teamId);
}

function ownProperty(gameId: string, teamId: string, slug: string): void {
  const prop = queries.propertiesByGame(gameId).find((p) => p.id.endsWith(`-prop-${slug}`))!;
  getDb().prepare("UPDATE properties SET owner_team_id = ? WHERE id = ?").run(teamId, prop.id);
}

function mockDice(a: number, b: number) {
  const spy = vi.spyOn(Math, "random");
  spy.mockReturnValueOnce((a - 1) / 6).mockReturnValueOnce((b - 1) / 6);
  return spy;
}

describe("Classic board gameplay", () => {
  it("landing on GO without wrapping does not trigger year-end", () => {
    const { gameId, teamIds } = makeStartedGame();
    const teamId = teamIds[0]!;
    setCurrentTeam(gameId, teamId);
    setTeamPosition(teamId, 0);
    const spy = mockDice(1, 1);
    roll(gameId, teamId);
    spy.mockRestore();
    expect(queries.yearEndPendingByTeam(teamId)).toBeNull();
  });

  it("passing GO triggers year-end", () => {
    const { gameId, teamIds } = makeStartedGame();
    const teamId = teamIds[0]!;
    setCurrentTeam(gameId, teamId);
    setTeamPosition(teamId, 38);
    const spy = mockDice(1, 1);
    roll(gameId, teamId);
    spy.mockRestore();
    expect(queries.yearEndPendingByTeam(teamId)).toBeTruthy();
  });

  it("buildHouse requires full color group and increments houses on correct journal", () => {
    const { gameId, teamIds } = makeStartedGame();
    const teamId = teamIds[0]!;
    setCurrentTeam(gameId, teamId);
    ownProperty(gameId, teamId, "med");
    const med = queries.propertiesByGame(gameId).find((p) => p.id.endsWith("-prop-med"))!;
    expect(() => buildHouse(gameId, teamId, med.id)).toThrow(/full color group/i);
    ownProperty(gameId, teamId, "bal");
    buildHouse(gameId, teamId, med.id);
    const pending = queries.pendingByGame(gameId)!;
    expect(pending.kind).toBe("build_house");
    submitJournalEntry(gameId, teamId, { debitAccount: "Buildings", creditAccount: "Cash", amount: med.houseCost! });
    expect(queries.propertiesByGame(gameId).find((p) => p.id === med.id)!.houses).toBe(1);
  });

  it("railroad rent in rent_due payload scales with owner railroad count", () => {
    const { gameId, teamIds } = makeStartedGame();
    const owner = teamIds[0]!;
    const payer = teamIds[1]!;
    ownProperty(gameId, owner, "rr1");
    ownProperty(gameId, owner, "rr2");
    setCurrentTeam(gameId, payer);
    setTeamPosition(payer, 13);
    const spy = mockDice(1, 1); // total 2 -> index 15 Pennsylvania RR
    roll(gameId, payer);
    spy.mockRestore();
    const pending = queries.pendingByGame(gameId)!;
    expect(pending.kind).toBe("rent_due");
    expect((pending.payload as { rent: number }).rent).toBe(50);
  });

  it("effectiveRent applies house multiplier on streets", () => {
    const { gameId } = makeStartedGame();
    const med = queries.propertiesByGame(gameId).find((p) => p.id.endsWith("-prop-med"))!;
    expect(gameData.effectiveRent({ ...med, houses: 2 }, 0)).toBe(med.rent * 3);
  });
});
