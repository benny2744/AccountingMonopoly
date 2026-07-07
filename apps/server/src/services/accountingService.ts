import type { Account, ExpectedEntry, JournalEntry, JournalEntryLine } from "@amono/shared";
import { accounting } from "@amono/shared";
import { getDb } from "../db/client.js";
import { queries } from "../db/queries.js";
import { now, uuid } from "../util/ids.js";

const { calculateAccountBalance } = accounting;

export class AccountingError extends Error {
  constructor(
    public code: string,
    message: string,
    public params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "AccountingError";
  }
}

function accountIdFor(teamId: string, accountName: string): string {
  const acct = queries.accountByTeamAndName(teamId, accountName);
  if (!acct) throw new AccountingError("ACCOUNT_NOT_FOUND", `Account not found: ${accountName}`);
  return acct.id;
}

/** Reject entries that would drive Cash below zero (PRD §27.3). */
function assertNonNegativeCash(
  teamId: string,
  lines: readonly { accountName: string; debit: number; credit: number }[],
): void {
  const cashLine = lines.find((l) => l.accountName === "Cash");
  if (!cashLine) return;
  const currentCash = balanceOf(teamId, "Cash");
  const newCash = currentCash + cashLine.debit - cashLine.credit;
  if (newCash < 0) {
    throw new AccountingError(
      "INSUFFICIENT_CASH",
      `This entry would make cash negative (current $${currentCash}, change ${cashLine.credit > 0 ? "-" : "+"}$${cashLine.debit > 0 ? cashLine.debit : cashLine.credit}).`,
    );
  }
}

/** Insert a journal entry + its lines (no validation here; caller picks the lines). */
export function postEntry(input: {
  gameId: string;
  teamId: string;
  turnId: string;
  description: string;
  descriptionParams?: Record<string, unknown>;
  sourceEventId: string;
  year: number;
  isStudentSubmitted: boolean;
  isCorrect: boolean | null;
  attemptOutcome?: string;
  lines: { accountName: string; debit: number; credit: number }[];
}): JournalEntry {
  assertNonNegativeCash(input.teamId, input.lines);

  const db = getDb();
  const entryId = uuid();
  const ts = now();
  const insertEntry = db.prepare(
    `INSERT INTO journal_entries (id, game_id, team_id, turn_id, description, description_params, source_event_id, created_at, year, is_student_submitted, is_correct, attempt_outcome)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  insertEntry.run(
    entryId,
    input.gameId,
    input.teamId,
    input.turnId,
    input.description,
    input.descriptionParams ? JSON.stringify(input.descriptionParams) : null,
    input.sourceEventId,
    ts,
    input.year,
    input.isStudentSubmitted ? 1 : 0,
    input.isCorrect === null ? null : input.isCorrect ? 1 : 0,
    input.attemptOutcome ?? null,
  );
  const insertLine = db.prepare(
    `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, account_name, debit, credit) VALUES (?,?,?,?,?,?)`,
  );
  for (const l of input.lines) {
    insertLine.run(uuid(), entryId, accountIdFor(input.teamId, l.accountName), l.accountName, l.debit, l.credit);
  }
  return queries.linesForEntry(entryId).length
    ? ({
        id: entryId,
        gameId: input.gameId,
        teamId: input.teamId,
        turnId: input.turnId,
        description: input.description,
        descriptionParams: input.descriptionParams,
        sourceEventId: input.sourceEventId,
        createdAt: ts,
        year: input.year,
        isStudentSubmitted: input.isStudentSubmitted,
        isCorrect: input.isCorrect,
        lines: queries.linesForEntry(entryId),
      } as JournalEntry)
    : ({} as JournalEntry);
}

/** Post an ExpectedEntry (resolved against the team's accounts) as a system entry. */
export function postExpectedAsSystem(
  gameId: string,
  teamId: string,
  turnId: string,
  expected: ExpectedEntry,
  year: number,
): JournalEntry {
  return postEntry({
    gameId,
    teamId,
    turnId,
    description: expected.description,
    descriptionParams: expected.descriptionParams,
    sourceEventId: `system-${turnId}`,
    year,
    isStudentSubmitted: false,
    isCorrect: true,
    attemptOutcome: "system",
    lines: expected.lines,
  });
}

/** Team's account-name → balance map (positive numbers). */
export function balancesFor(teamId: string): Map<string, number> {
  const accounts = queries.accountsByTeam(teamId);
  const lines = queries.linesForTeam(teamId);
  return balancesFromLines(accounts, lines);
}

/** Compute balances from pre-loaded accounts and lines (no I/O). */
export function balancesFromLines(
  accounts: readonly Account[],
  lines: readonly JournalEntryLine[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of accounts) {
    m.set(a.name, calculateAccountBalance(a, lines).balance);
  }
  return m;
}

export function balanceOf(teamId: string, accountName: string): number {
  const accounts = queries.accountsByTeam(teamId);
  const acct = accounts.find((a) => a.name === accountName);
  if (!acct) return 0;
  const lines = queries.linesForTeam(teamId);
  return calculateAccountBalance(acct, lines).balance;
}

export interface LedgerView {
  accounts: Account[];
  entries: JournalEntry[];
  lines: JournalEntryLine[];
}

export function ledgerForTeam(teamId: string): LedgerView {
  return {
    accounts: queries.accountsByTeam(teamId),
    entries: queries.entriesByTeam(teamId),
    lines: queries.linesForTeam(teamId),
  };
}
