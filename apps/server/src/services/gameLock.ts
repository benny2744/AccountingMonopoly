/** Per-game in-process mutex so concurrent mutating calls serialize cleanly. */
const gameLocks = new Map<string, Promise<unknown>>();

function noop(): void {}

export function withGameLock<T>(gameId: string, fn: () => T | Promise<T>): Promise<T> {
  const prev = gameLocks.get(gameId) ?? Promise.resolve();
  const next = prev.then(fn, fn) as Promise<T>;
  gameLocks.set(gameId, next.then(noop, noop));
  return next;
}

export function clearGameLock(gameId: string): void {
  gameLocks.delete(gameId);
}
