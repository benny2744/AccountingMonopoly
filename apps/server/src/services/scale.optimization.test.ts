import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type express from "express";
import { openDb, closeDb, getDb } from "../db/client.js";
import { runMigrations } from "../db/schema.js";
import { createApp } from "../app.js";
import * as stateService from "../services/stateService.js";
import type { GameState } from "../services/stateService.js";

let port: number;
let server: ReturnType<typeof createServer>;
let app: express.Express;

beforeAll(async () => {
  openDb(":memory:");
  runMigrations();
  app = createApp();
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

afterEach(() => {
  vi.restoreAllMocks();
  app.set("broadcastState", undefined);
});

const B = () => `http://127.0.0.1:${port}`;
async function post(path: string, body: unknown, token?: string): Promise<{ ok: boolean; status: number; json: unknown }> {
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

describe("scale optimizations", () => {
  it("schema includes game_id indexes for concurrent-room queries", () => {
    const names = new Set(
      (getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map(
        (r) => r.name,
      ),
    );
    for (const idx of [
      "idx_teams_game",
      "idx_properties_game",
      "idx_board_spaces_game",
      "idx_pending_actions_game_status",
      "idx_credit_balances_game",
      "idx_journal_entries_game",
    ]) {
      expect(names.has(idx), idx).toBe(true);
    }
  });

  it("uses PRAGMA synchronous=NORMAL", () => {
    const sync = getDb().prepare("PRAGMA synchronous").get() as { synchronous: number };
    expect(sync.synchronous).toBe(1);
  });

  it("mutation routes build state once and broadcast the same object", async () => {
    let broadcastState: GameState | undefined;
    app.set("broadcastState", (_gameId: string, state: GameState) => {
      broadcastState = state;
    });

    const getStateSpy = vi.spyOn(stateService, "getGameState");

    const { json: createJson } = await post("/api/games", {
      teacherPin: "1234",
      difficulty: "cash",
      numberOfTeams: 2,
      propertyAllocationRatio: 0.25,
      startingCash: 1500,
      startingLoanLimit: 500,
    });
    const gameId = (createJson as { game: { id: string } }).game.id;
    const token = (createJson as { sessionToken: string }).sessionToken;

    await post(`/api/games/${gameId}/start`, { teacherPin: "1234", override: true }, token);

    getStateSpy.mockClear();
    broadcastState = undefined;

    const pauseRes = await post(`/api/games/${gameId}/pause`, {}, token);
    expect(pauseRes.ok).toBe(true);
    expect(getStateSpy).toHaveBeenCalledTimes(1);
    expect(broadcastState).toBeDefined();
    expect(getStateSpy.mock.results[0]?.value).toBe(broadcastState);
    expect((pauseRes.json as GameState).game.status).toBe("paused");
  });
});
