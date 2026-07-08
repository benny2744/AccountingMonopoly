import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createApp } from "../app.js";
import { openDb, closeDb, getDb } from "../db/client.js";
import { runMigrations } from "../db/schema.js";
import { queries } from "../db/queries.js";
import { createGame, startGame } from "./gameService.js";
import { balanceOf } from "./accountingService.js";
import {
  proposeTrade,
  cancelTrade,
  resolveChoice,
  submitJournalEntry,
} from "./turnService.js";
import { GameError } from "./gameService.js";

let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  openDb(":memory:");
  runMigrations();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
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

function setCurrentTeam(
  gameId: string,
  teamId: string,
  turnPhase: "awaiting_roll" | "awaiting_end" | "resolving" = "awaiting_end",
): void {
  getDb().prepare("UPDATE games SET current_team_id = ?, turn_phase = ? WHERE id = ?").run(teamId, turnPhase, gameId);
}

function setupTwoTeamGame(): { gameId: string; sellerId: string; buyerId: string } {
  const game = createGame({
    difficulty: "cash",
    numberOfTeams: 2,
    propertyAllocationRatio: 0.5,
    startingCash: 1500,
    startingLoanLimit: 500,
  });
  startGame(game.id, { overrideMinTeams: true });
  const teams = queries.teamsByGame(game.id);
  return { gameId: game.id, sellerId: teams[0]!.id, buyerId: teams[1]!.id };
}

function sellerOwnedProperty(gameId: string, sellerId: string, bookValue?: number): { id: string; name: string } {
  const prop = queries.propertiesByGame(gameId).find((p) => p.ownerTeamId === sellerId);
  if (!prop) throw new Error("No seller property in fixture");
  if (bookValue != null) {
    getDb().prepare("UPDATE properties SET cost_basis = ? WHERE id = ?").run(bookValue, prop.id);
  }
  return { id: prop.id, name: prop.name };
}

function journalPending(gameId: string, teamId: string): void {
  const pending = queries.pendingByGame(gameId);
  if (!pending || pending.status !== "awaiting_journal") throw new Error("No journal pending");
  const entries = pending.expectedEntries as Array<{
    teamId: string;
    lines: Array<{ accountName: string; debit: number; credit: number }>;
  }>;
  const expected = entries.find((e) => e.teamId === teamId) ?? entries[0]!;
  if (expected.lines.length > 2) {
    submitJournalEntry(gameId, teamId, {
      lines: expected.lines.map((l: any) => ({
        accountName: l.accountName,
        debit: l.debit,
        credit: l.credit,
      })),
    });
  } else {
    const debit = expected.lines.find((l) => l.debit > 0)!;
    const credit = expected.lines.find((l) => l.credit > 0)!;
    submitJournalEntry(gameId, teamId, {
      debitAccount: debit.accountName,
      creditAccount: credit.accountName,
      amount: debit.debit,
    });
  }
}

describe("property trading", () => {
  it("sell offer → accept → gain journal → ownership and cost basis updated", () => {
    const { gameId, sellerId, buyerId } = setupTwoTeamGame();
    const prop = sellerOwnedProperty(gameId, sellerId, 200);
    setCurrentTeam(gameId, sellerId, "awaiting_end");

    const cashBefore = balanceOf(sellerId, "Cash");
    const buyerCashBefore = balanceOf(buyerId, "Cash");
    const propertyBefore = balanceOf(sellerId, "Property");
    const buyerPropertyBefore = balanceOf(buyerId, "Property");

    proposeTrade(gameId, sellerId, { propertyId: prop.id, price: 300, counterpartyTeamId: buyerId });
    resolveChoice(gameId, buyerId, { choice: "accept" });
    journalPending(gameId, buyerId);
    journalPending(gameId, sellerId);

    const updated = queries.propertiesByGame(gameId).find((p) => p.id === prop.id)!;
    expect(updated.ownerTeamId).toBe(buyerId);
    expect(updated.costBasis).toBe(300);

    expect(balanceOf(sellerId, "Cash")).toBe(cashBefore + 300);
    expect(balanceOf(sellerId, "Property")).toBe(propertyBefore - 200);
    expect(balanceOf(sellerId, "Gain on Sale")).toBe(100);
    expect(balanceOf(buyerId, "Cash")).toBe(buyerCashBefore - 300);
    expect(balanceOf(buyerId, "Property")).toBe(buyerPropertyBefore + 300);
  });

  it("loss case: seller records Loss on Sale", () => {
    const { gameId, sellerId, buyerId } = setupTwoTeamGame();
    const prop = sellerOwnedProperty(gameId, sellerId, 200);
    setCurrentTeam(gameId, sellerId, "awaiting_end");

    proposeTrade(gameId, sellerId, { propertyId: prop.id, price: 150, counterpartyTeamId: buyerId });
    resolveChoice(gameId, buyerId, { choice: "accept" });
    journalPending(gameId, buyerId);
    journalPending(gameId, sellerId);

    expect(balanceOf(sellerId, "Loss on Sale")).toBe(50);
    expect(balanceOf(sellerId, "Gain on Sale")).toBe(0);
  });

  it("decline restores awaiting_end with no pending", () => {
    const { gameId, sellerId, buyerId } = setupTwoTeamGame();
    const prop = sellerOwnedProperty(gameId, sellerId);
    setCurrentTeam(gameId, sellerId, "awaiting_end");

    proposeTrade(gameId, sellerId, { propertyId: prop.id, price: 200, counterpartyTeamId: buyerId });
    resolveChoice(gameId, buyerId, { choice: "decline" });

    expect(queries.pendingByGame(gameId)).toBeNull();
    expect(queries.gameById(gameId)?.turnPhase).toBe("awaiting_end");
    expect(queries.propertiesByGame(gameId).find((p) => p.id === prop.id)?.ownerTeamId).toBe(sellerId);
  });

  it("cancel by proposer restores awaiting_end", () => {
    const { gameId, sellerId, buyerId } = setupTwoTeamGame();
    const prop = sellerOwnedProperty(gameId, sellerId);
    setCurrentTeam(gameId, sellerId, "awaiting_end");

    proposeTrade(gameId, sellerId, { propertyId: prop.id, price: 200, counterpartyTeamId: buyerId });
    cancelTrade(gameId, sellerId);

    expect(queries.pendingByGame(gameId)).toBeNull();
    expect(queries.gameById(gameId)?.turnPhase).toBe("awaiting_end");
  });

  it("rejects accept when buyer has insufficient cash", () => {
    const { gameId, sellerId, buyerId } = setupTwoTeamGame();
    const prop = sellerOwnedProperty(gameId, sellerId, 100);
    setCurrentTeam(gameId, sellerId, "awaiting_end");

    proposeTrade(gameId, sellerId, { propertyId: prop.id, price: 5000, counterpartyTeamId: buyerId });
    expect(() => resolveChoice(gameId, buyerId, { choice: "accept" })).toThrow(GameError);
    try {
      resolveChoice(gameId, buyerId, { choice: "accept" });
    } catch (e) {
      expect((e as GameError).code).toBe("INSUFFICIENT_CASH");
    }
  });

  it("rejects trade on mortgaged or built-up property", () => {
    const { gameId, sellerId, buyerId } = setupTwoTeamGame();
    const prop = sellerOwnedProperty(gameId, sellerId);
    setCurrentTeam(gameId, sellerId, "awaiting_end");

    getDb().prepare("UPDATE properties SET is_mortgaged = 1 WHERE id = ?").run(prop.id);
    expect(() =>
      proposeTrade(gameId, sellerId, { propertyId: prop.id, price: 200, counterpartyTeamId: buyerId }),
    ).toThrow(GameError);

    getDb().prepare("UPDATE properties SET is_mortgaged = 0, houses = 1 WHERE id = ?").run(prop.id);
    expect(() =>
      proposeTrade(gameId, sellerId, { propertyId: prop.id, price: 200, counterpartyTeamId: buyerId }),
    ).toThrow(GameError);
  });

  it("rejects legacy single-pair submit for 3-line expected entry", () => {
    const { gameId, sellerId, buyerId } = setupTwoTeamGame();
    const prop = sellerOwnedProperty(gameId, sellerId, 200);
    setCurrentTeam(gameId, sellerId, "awaiting_end");

    proposeTrade(gameId, sellerId, { propertyId: prop.id, price: 300, counterpartyTeamId: buyerId });
    resolveChoice(gameId, buyerId, { choice: "accept" });
    journalPending(gameId, buyerId);

    expect(() =>
      submitJournalEntry(gameId, sellerId, {
        debitAccount: "Cash",
        creditAccount: "Property",
        amount: 300,
      }),
    ).toThrow(GameError);
    try {
      submitJournalEntry(gameId, sellerId, {
        debitAccount: "Cash",
        creditAccount: "Property",
        amount: 300,
      });
    } catch (e) {
      expect((e as GameError).code).toBe("BAD_INPUT");
    }
  });
});
