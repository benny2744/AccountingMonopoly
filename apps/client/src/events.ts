import type { GameEvent } from "./api.js";

/** `GameState.events` is newest-first (server `ORDER BY seq DESC`). */
export function latestEvent(events: GameEvent[], type: string): GameEvent | undefined {
  return events.find((e) => e.type === type);
}

export function latestEventWhere(
  events: GameEvent[],
  pred: (e: GameEvent) => boolean,
): GameEvent | undefined {
  return events.find(pred);
}
