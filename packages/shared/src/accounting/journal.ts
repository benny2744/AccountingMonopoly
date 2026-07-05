import type {
  Account,
  AccountType,
  ExpectedEntryLine,
  JournalEntry,
  JournalEntryLine,
  LedgerLineView,
  NormalBalance,
  TAccount,
} from "../types.js";
import { getNormalBalance } from "./normalBalances.js";

export class UnbalancedEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnbalancedEntryError";
  }
}

/** Sum of debits in a list of lines. */
export function sumDebits(lines: readonly { debit: number }[]): number {
  return lines.reduce((acc, l) => acc + l.debit, 0);
}

/** Sum of credits in a list of lines. */
export function sumCredits(lines: readonly { credit: number }[]): number {
  return lines.reduce((acc, l) => acc + l.credit, 0);
}

/**
 * Validate and "post" a journal entry's lines. Pure: it returns the lines as
 * the authoritative posted lines. Throws on imbalance. PRD §21.1.
 */
export function postJournalEntry(lines: readonly JournalEntryLine[]): JournalEntryLine[] {
  const debitTotal = sumDebits(lines);
  const creditTotal = sumCredits(lines);
  if (debitTotal !== creditTotal) {
    throw new UnbalancedEntryError(
      `Unbalanced entry: debits ${debitTotal} !== credits ${creditTotal}`,
    );
  }
  if (debitTotal <= 0) {
    throw new UnbalancedEntryError("Entry must have a positive amount.");
  }
  // Reject lines that have both debit and credit populated.
  for (const l of lines) {
    if (l.debit > 0 && l.credit > 0) {
      throw new UnbalancedEntryError(
        `Line for ${l.accountName} has both debit and credit.`,
      );
    }
  }
  return [...lines];
}

/**
 * Compute the balance of a single account given all journal lines affecting it.
 * PRD §21.3 — debit-normal: debits − credits; credit-normal: credits − debits.
 */
export function calculateAccountBalance(
  account: { name: string; type: AccountType },
  allLines: readonly JournalEntryLine[],
): { balance: number; side: NormalBalance } {
  const myLines = allLines.filter((l) => l.accountName === account.name);
  const debits = sumDebits(myLines);
  const credits = sumCredits(myLines);
  const normal = getNormalBalance(account.type);
  const raw = normal === "debit" ? debits - credits : credits - debits;
  return { balance: raw, side: normal };
}

/**
 * Build a T-account view across the given accounts from posted journal lines.
 * PRD §16. Each side's line items carry the counter-account name so the UI can
 * render entries like "Owner Capital 1500" on Cash's debit side.
 */
export function buildTAccounts(
  accounts: readonly Account[],
  entries: readonly JournalEntry[],
  lines: readonly JournalEntryLine[],
  filter?: {
    year?: number;
    accountType?: AccountType;
    accountName?: string;
  },
): TAccount[] {
  const filteredAccounts = accounts.filter((a) => {
    if (filter?.accountType && a.type !== filter.accountType) return false;
    if (filter?.accountName && a.name !== filter.accountName) return false;
    return true;
  });

  const entriesById = new Map(entries.map((e) => [e.id, e]));

  return filteredAccounts.map((account) => {
    const myLines = lines.filter((l) => l.accountName === account.name);
    const filteredLines =
      filter?.year !== undefined
        ? myLines.filter((l) => {
            const entry = entriesById.get(l.journalEntryId);
            return entry && entry.year === filter.year;
          })
        : myLines;
    const debits: LedgerLineView[] = [];
    const credits: LedgerLineView[] = [];

    for (const l of filteredLines) {
      const entry = entriesById.get(l.journalEntryId);
      const description = entry?.description ?? "";
      const counterAccountName = deriveCounterAccount(l, lines);
      const view: LedgerLineView = {
        journalEntryId: l.journalEntryId,
        amount: l.debit > 0 ? l.debit : l.credit,
        counterAccountName,
        description,
      };
      if (l.debit > 0) debits.push(view);
      else if (l.credit > 0) credits.push(view);
    }

    const { balance, side } = calculateAccountBalance(account, filteredLines);
    return {
      accountName: account.name,
      type: account.type,
      debits,
      credits,
      balance,
      balanceSide: side,
    };
  });
}

function deriveCounterAccount(line: JournalEntryLine, allLines: readonly JournalEntryLine[]): string {
  const siblings = allLines.filter(
    (l) => l.journalEntryId === line.journalEntryId && l.id !== line.id,
  );
  if (siblings.length === 1) return siblings[0]!.accountName;
  return siblings.map((s) => s.accountName).join(", ");
}

/**
 * Helper to convert an ExpectedEntryLine[] (used by entryRules) into raw lines
 * ready to be materialized with ids by the persistence layer.
 */
export function expectedToRaw(
  teamId: string,
  entryId: string,
  expected: readonly ExpectedEntryLine[],
  counterAccountOverride?: string,
): JournalEntryLine[] {
  return expected.map((l, i) => ({
    id: `${entryId}-l${i}`,
    journalEntryId: entryId,
    accountId: l.accountName,
    accountName: l.accountName,
    debit: l.debit,
    credit: l.credit,
    counterAccountName: counterAccountOverride,
    teamId,
  }));
}
