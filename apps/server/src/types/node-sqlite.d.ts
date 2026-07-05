// Minimal type shim for the experimental node:sqlite built-in (Node 22+).
declare module "node:sqlite" {
  export interface StatementResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }
  export class DatabaseSync {
    constructor(location: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    open(): void;
    close(): void;
    backup(file: string): Promise<void>;
    function(name: string, fn: (...args: unknown[]) => unknown): void;
    aggregate(name: string, options: unknown): void;
  }
  export interface StatementSync {
    run(...params: unknown[]): StatementResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    iterate(...params: unknown[]): IterableIterator<unknown>;
    sourceSQL: string;
    expandedSQL: string;
    setAllowBareNamedParameters(enabled: boolean): void;
    setReadBigInts(enabled: boolean): void;
  }
  export const constants: Record<string, number>;
}
