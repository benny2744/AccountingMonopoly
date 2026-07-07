import type { JournalEntry, JournalEntryLine } from "@amono/shared";
import { accounting } from "@amono/shared";
import { queries } from "../db/queries.js";

const { calculateAccountBalance } = accounting;

function isClosingEntry(entry: JournalEntry): boolean {
  return entry.sourceEventId.startsWith("ye-close-");
}

function entriesById(teamId: string): Map<string, JournalEntry> {
  return new Map(queries.entriesByTeam(teamId).map((e) => [e.id, e]));
}

/** Cash balance at the start of `year` (entries with year strictly before). */
export function beginningCashForYear(teamId: string, year: number): number {
  const accounts = queries.accountsByTeam(teamId);
  const cashAcct = accounts.find((a) => a.name === "Cash");
  if (!cashAcct) return 0;
  const entryById = entriesById(teamId);
  const priorLines = queries.linesForTeam(teamId).filter((l) => {
    const entry = entryById.get(l.journalEntryId);
    return entry != null && entry.year < year;
  });
  return calculateAccountBalance(cashAcct, priorLines).balance;
}

/** Income-statement lines for one fiscal year (excludes year-end closing entries). */
export function linesForIncomeStatement(teamId: string, year: number): JournalEntryLine[] {
  const entryById = entriesById(teamId);
  return queries.linesForTeam(teamId).filter((l) => {
    const entry = entryById.get(l.journalEntryId);
    return entry != null && entry.year === year && !isClosingEntry(entry);
  });
}

/** Balance-sheet lines cumulative through `year` (includes closing entries). */
export function linesForBalanceSheet(teamId: string, year: number): JournalEntryLine[] {
  const entryById = entriesById(teamId);
  return queries.linesForTeam(teamId).filter((l) => {
    const entry = entryById.get(l.journalEntryId);
    return entry != null && entry.year <= year;
  });
}

/** Journal entries for cash summary in one fiscal year (excludes closing). */
export function entriesForCashSummary(teamId: string, year: number): JournalEntry[] {
  return queries.entriesByTeam(teamId).filter((e) => e.year === year && !isClosingEntry(e));
}

/** Journal lines scoped to cash-summary entries for one fiscal year. */
export function linesForCashSummary(teamId: string, year: number): JournalEntryLine[] {
  const entryIds = new Set(entriesForCashSummary(teamId, year).map((e) => e.id));
  return queries.linesForTeam(teamId).filter((l) => entryIds.has(l.journalEntryId));
}
