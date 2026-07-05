import { describe, expect, it } from "vitest";
import type { Account, JournalEntry, JournalEntryLine } from "../types.js";
import {
  cashEventExpense,
  interestPaidCash,
  loanTaken,
  ownerCapitalContribution,
  propertyAssignedAtSetup,
  rentPaidCash,
  repairPaidCash,
} from "./entryRules.js";
import { generateBalanceSheet, generateIncomeStatement } from "./statements.js";
import { calculateAccountBalance } from "./journal.js";
import { CASH_BASIS_ACCOUNTS } from "./accounts.js";

// Builds a synthetic team accounting book from a list of (rule-produced) entries.
interface Book {
  accounts: Account[];
  entries: JournalEntry[];
  lines: JournalEntryLine[];
}

let entryCounter = 0;
function post(
  book: Book,
  teamId: string,
  description: string,
  ruleLines: { accountName: string; debit: number; credit: number }[],
): void {
  const entryId = `je-${entryCounter++}`;
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

function newBook(teamId: string): Book {
  const accounts: Account[] = CASH_BASIS_ACCOUNTS.map((a, i) => ({
    id: `acc-${i}`,
    gameId: "g",
    teamId,
    name: a.name,
    type: a.type,
    normalBalance: a.type === "asset" || a.type === "expense" ? "debit" : "credit",
  }));
  return { accounts, entries: [], lines: [] };
}

describe("PRD §32 Scenario A — Cash Basis walkthrough", () => {
  const TEAM = "t-red";
  const book = newBook(TEAM);

  // 1. Owner capital 1500 cash.
  post(book, TEAM, "Owner capital", ownerCapitalContribution(TEAM, 1500, "starting cash").lines);
  // 2. Property 200 at setup.
  post(book, TEAM, "Property assigned at setup", propertyAssignedAtSetup(TEAM, 200, "Property A").lines);
  // 3. Receive rent 100.
  const rentRecv = rentPaidCash("t-other", TEAM, 100).find((e) => e.teamId === TEAM)!;
  post(book, TEAM, "Rent received", rentRecv.lines);
  // 4. Pay rent 80.
  const rentPay = rentPaidCash(TEAM, "t-other2", 80).find((e) => e.teamId === TEAM)!;
  post(book, TEAM, "Rent paid", rentPay.lines);
  // 5. Pay repair 150.
  post(book, TEAM, "Repair paid", repairPaidCash(TEAM, 150).lines);
  // 6. Take loan 500.
  post(book, TEAM, "Loan taken", loanTaken(TEAM, 500).lines);
  // 7. Pay interest 20.
  post(book, TEAM, "Interest paid", interestPaidCash(TEAM, 20).lines);

  const bal = (name: string) =>
    calculateAccountBalance(book.accounts.find((a) => a.name === name)!, book.lines).balance;

  it("Cash = 1850", () => expect(bal("Cash")).toBe(1850));
  it("Property = 200", () => expect(bal("Property")).toBe(200));
  it("Loan Payable = 500", () => expect(bal("Loan Payable")).toBe(500));
  it("Rent Revenue = 100", () => expect(bal("Rent Revenue")).toBe(100));
  it("Rent Expense = 80", () => expect(bal("Rent Expense")).toBe(80));
  it("Repair Expense = 150", () => expect(bal("Repair Expense")).toBe(150));
  it("Interest Expense = 20", () => expect(bal("Interest Expense")).toBe(20));

  it("Balance sheet balances", () => {
    const s = generateBalanceSheet(book.accounts, book.lines);
    expect(s.balances).toBe(true);
    expect(s.totalAssets).toBe(2050);
  });

  it("Net income = -150", () => {
    const s = generateIncomeStatement(book.accounts, book.lines);
    expect(s.netIncome).toBe(-150);
  });
});
