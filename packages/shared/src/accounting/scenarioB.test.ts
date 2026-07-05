import { describe, expect, it } from "vitest";
import type { Account, JournalEntry, JournalEntryLine } from "../types.js";
import {
  apPaidCash,
  ownerCapitalContribution,
  prepaidPurchase,
  prepaidRecognition,
  repairBillPayable,
  revenueReceivable,
} from "./entryRules.js";
import { ACCRUAL_BASIS_ACCOUNTS } from "./accounts.js";
import { calculateAccountBalance } from "./journal.js";
import { generateBalanceSheet, generateIncomeStatement } from "./statements.js";

interface Book {
  accounts: Account[];
  entries: JournalEntry[];
  lines: JournalEntryLine[];
}

let counter = 0;
function post(
  book: Book,
  teamId: string,
  description: string,
  ruleLines: { accountName: string; debit: number; credit: number }[],
): void {
  const entryId = `b-je-${counter++}`;
  const entry: JournalEntry = {
    id: entryId,
    gameId: "g",
    teamId,
    turnId: "t",
    description,
    sourceEventId: "",
    createdAt: "",
    year: 1,
    isStudentSubmitted: false,
    isCorrect: true,
    lines: [],
  };
  const newLines: JournalEntryLine[] = ruleLines.map((l, i) => ({
    id: `${entryId}-${i}`,
    journalEntryId: entryId,
    accountId: l.accountName,
    accountName: l.accountName,
    debit: l.debit,
    credit: l.credit,
  }));
  book.entries.push(entry);
  book.lines.push(...newLines);
}

function newAccrualBook(teamId: string): Book {
  const accounts: Account[] = ACCRUAL_BASIS_ACCOUNTS.map((a, i) => ({
    id: `acc-${i}`,
    gameId: "g",
    teamId,
    name: a.name,
    type: a.type,
    normalBalance: a.type === "asset" || a.type === "expense" ? "debit" : "credit",
  }));
  return { accounts, entries: [], lines: [] };
}

describe("PRD §32 Scenario B — Accrual Basis walkthrough", () => {
  const TEAM = "t-red";
  const BANK = "t-bank"; // not a real team; bank-side handled via apPaidCash creditor side
  const book = newAccrualBook(TEAM);

  // 1. Start with 1500 cash (owner capital).
  post(book, TEAM, "Owner capital", ownerCapitalContribution(TEAM, 1500, "starting").lines);
  // 2. Earn 250 event revenue, collect later.
  post(book, TEAM, "Conference collect later", revenueReceivable(TEAM, 250, "Event Revenue", "conference").lines);
  // 3. Repair bill 150 due year-end.
  post(book, TEAM, "Repair bill payable", repairBillPayable(TEAM, 150).lines);
  // 4. Pay 120 prepaid internet.
  post(book, TEAM, "Prepaid internet", prepaidPurchase(TEAM, 120, "internet").lines);
  // 5. Year-end: collect A/R (TEAM is the creditor).
  post(book, TEAM, "Year-end collect A/R", apPaidCash("t-other", TEAM, 250).find((e) => e.teamId === TEAM)!.lines);
  // 6. Year-end: pay A/P (TEAM is the debtor).
  post(book, TEAM, "Year-end pay A/P", apPaidCash(TEAM, "t-other", 150).find((e) => e.teamId === TEAM)!.lines);
  // 7. Year-end: recognize internet expense.
  post(book, TEAM, "Year-end recognize prepaid", prepaidRecognition(TEAM, 120, "Internet Expense").lines);

  const bal = (name: string) =>
    calculateAccountBalance(book.accounts.find((a) => a.name === name)!, book.lines).balance;

  it("Accounts Receivable clears to 0", () => expect(bal("Accounts Receivable")).toBe(0));
  it("Accounts Payable clears to 0", () => expect(bal("Accounts Payable")).toBe(0));
  it("Prepaid Services clears to 0", () => expect(bal("Prepaid Services")).toBe(0));
  it("Event Revenue = 250", () => expect(bal("Event Revenue")).toBe(250));
  it("Repair Expense = 150", () => expect(bal("Repair Expense")).toBe(150));
  it("Internet Expense = 120", () => expect(bal("Internet Expense")).toBe(120));
  it("Cash = 1480 (1500 - 120 + 250 - 150)", () => expect(bal("Cash")).toBe(1480));

  it("Balance sheet balances", () => {
    const s = generateBalanceSheet(book.accounts, book.lines);
    expect(s.balances).toBe(true);
  });
  it("Net income = -20 (250 - 150 - 120)", () => {
    const s = generateIncomeStatement(book.accounts, book.lines);
    expect(s.netIncome).toBe(-20);
  });
});
