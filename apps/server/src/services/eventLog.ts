import type { GameEvent, GameEventType } from "@amono/shared";
import { getDb } from "../db/client.js";
import { queries } from "../db/queries.js";
import { now, uuid } from "../util/ids.js";

function nextSeq(gameId: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM game_events WHERE game_id = ?")
    .get(gameId) as { n: number };
  return row.n;
}

export function logEvent(
  gameId: string,
  turnId: string | null,
  type: GameEventType,
  payload: unknown,
): GameEvent {
  const id = uuid();
  const ts = now();
  getDb()
    .prepare(
      `INSERT INTO game_events (id, game_id, turn_id, type, payload, created_at, seq) VALUES (?,?,?,?,?,?,?)`,
    )
    .run(id, gameId, turnId, type, JSON.stringify(payload ?? {}), ts, nextSeq(gameId));
  return queries.eventsByGame(gameId, 1)[0]!;
}

export function recentEvents(gameId: string, limit = 40): GameEvent[] {
  return queries.eventsByGame(gameId, limit);
}
