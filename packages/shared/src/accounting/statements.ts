import type {
  Account,
  AccountType,
  CreditBalance,
  JournalEntry,
  JournalEntryLine,
  Team,
} from "../types.js";
import { calculateAccountBalance } from "./journal.js";

export interface IncomeStatement {
  revenue: AccountLineRow[];
  expenses: AccountLineRow[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export interface AccountLineRow {
  accountName: string;
  amount: number;
}

export interface BalanceSheet {
  assets: AccountLineRow[];
  liabilities: AccountLineRow[];
  equity: AccountLineRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balances: boolean;
}

export interface CashSummaryLine {
  description: string;
  descriptionParams?: Record<string, unknown>;
  amount: number;
}

export interface CashSummary {
  beginning: number;
  inflows: CashSummaryLine[];
  outflows: CashSummaryLine[];
  totalInflows: number;
  totalOutflows: number;
  ending: number;
}

export interface ARAPRow {
  type: "receivable" | "payable";
  otherTeam: string | null;
  amount: number;
  source: string;
  status: string;
}

export interface ARAPSchedule {
  rows: ARAPRow[];
}

const matches = (a: string, b: string) => a === b;

function accountByName(accounts: readonly Account[], name: string): Account | undefined {
  return accounts.find((a) => matches(a.name, name));
}

/** Compute one account's balance over the given lines. */
function balanceOf(accountName: string, accounts: readonly Account[], lines: readonly JournalEntryLine[]): number {
  const acct = accountByName(accounts, accountName);
  if (!acct) return 0;
  return calculateAccountBalance(acct, lines).balance;
}

/** Lines for a single team (lines array may be pre-filtered; this just routes by account name). */
function linesForTeam(lines: readonly JournalEntryLine[], _teamId: string): readonly JournalEntryLine[] {
  // Lines are pre-filtered to a team upstream; this is a no-op passthrough.
  return lines;
}

/** PRD §15.1 Income Statement. */
export function generateIncomeStatement(
  accounts: readonly Account[],
  lines: readonly JournalEntryLine[],
): IncomeStatement {
  const teamLines = linesForTeam(lines, "");
  const revenueRows: AccountLineRow[] = [];
  const expenseRows: AccountLineRow[] = [];
  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const acct of accounts) {
    const { balance } = calculateAccountBalance(acct, teamLines);
    if (balance === 0) continue;
    if (acct.type === "revenue") {
      revenueRows.push({ accountName: acct.name, amount: balance });
      totalRevenue += balance;
    } else if (acct.type === "expense") {
      expenseRows.push({ accountName: acct.name, amount: balance });
      totalExpenses += balance;
    }
  }
  return {
    revenue: revenueRows,
    expenses: expenseRows,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
  };
}

/** PRD §15.2 Balance Sheet. Includes current-period net income inside equity so it balances pre-closing. */
export function generateBalanceSheet(
  accounts: readonly Account[],
  lines: readonly JournalEntryLine[],
): BalanceSheet {
  const teamLines = linesForTeam(lines, "");
  const assets: AccountLineRow[] = [];
  const liabilities: AccountLineRow[] = [];
  const equity: AccountLineRow[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  const income = generateIncomeStatement(accounts, teamLines);

  for (const acct of accounts) {
    const { balance } = calculateAccountBalance(acct, teamLines);
    if (balance === 0) continue;
    if (acct.type === "asset") {
      assets.push({ accountName: acct.name, amount: balance });
      totalAssets += balance;
    } else if (acct.type === "liability") {
      liabilities.push({ accountName: acct.name, amount: balance });
      totalLiabilities += balance;
    } else if (acct.type === "equity") {
      equity.push({ accountName: acct.name, amount: balance });
      totalEquity += balance;
    }
  }

  // Current-period net income flows into equity before closing entries (PRD §15.2).
  if (income.netIncome !== 0) {
    equity.push({ accountName: "Current Year Net Income", amount: income.netIncome });
    totalEquity += income.netIncome;
  }

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity,
    balances: totalAssets === totalLiabilitiesAndEquity,
  };
}

/** PRD §15.3 simplified Cash Summary from Cash-account journal lines. */
export function generateCashSummary(
  accounts: readonly Account[],
  lines: readonly JournalEntryLine[],
  entries: readonly JournalEntry[],
  beginningCash = 0,
): CashSummary {
  const entriesById = new Map(entries.map((e) => [e.id, e]));
  const inflows: CashSummaryLine[] = [];
  const outflows: CashSummaryLine[] = [];
  let totalInflows = 0;
  let totalOutflows = 0;

  for (const l of lines) {
    if (l.accountName !== "Cash") continue;
    const entry = entriesById.get(l.journalEntryId);
    const description = entry?.description ?? "";
    const descriptionParams = entry?.descriptionParams;
    if (l.debit > 0) {
      inflows.push({ description, descriptionParams, amount: l.debit });
      totalInflows += l.debit;
    } else if (l.credit > 0) {
      outflows.push({ description, descriptionParams, amount: l.credit });
      totalOutflows += l.credit;
    }
  }

  return {
    beginning: beginningCash,
    inflows,
    outflows,
    totalInflows,
    totalOutflows,
    ending: beginningCash + totalInflows - totalOutflows,
  };
}

/** PRD §15.4 A/R & A/P Schedule driven by CreditBalance records. */
export function generateARAPSchedule(
  teamId: string,
  teams: readonly Team[],
  creditBalances: readonly CreditBalance[],
): ARAPSchedule {
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? null;
  const rows: ARAPRow[] = [];
  for (const cb of creditBalances) {
    if (cb.status === "paid" || cb.status === "rolled_to_loan") continue;
    if (cb.creditorTeamId === teamId) {
      rows.push({
        type: "receivable",
        otherTeam: teamName(cb.debtorTeamId),
        amount: cb.amount,
        source: cb.sourceEventId,
        status: cb.status,
      });
    } else if (cb.debtorTeamId === teamId) {
      rows.push({
        type: "payable",
        otherTeam: teamName(cb.creditorTeamId),
        amount: cb.amount,
        source: cb.sourceEventId,
        status: cb.status,
      });
    }
  }
  return { rows };
}

export type { AccountType };
