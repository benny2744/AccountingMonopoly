import { describe, expect, it } from "vitest";
import type { Account, CreditBalance, JournalEntry, JournalEntryLine, Team } from "../types.js";
import { generateARAPSchedule, generateBalanceSheet, generateCashSummary, generateIncomeStatement } from "./statements.js";

const accounts: Account[] = [
  { id: "1", gameId: "g", teamId: "t-red", name: "Cash", type: "asset", normalBalance: "debit" },
  { id: "2", gameId: "g", teamId: "t-red", name: "Property", type: "asset", normalBalance: "debit" },
  { id: "3", gameId: "g", teamId: "t-red", name: "Loan Payable", type: "liability", normalBalance: "credit" },
  { id: "4", gameId: "g", teamId: "t-red", name: "Owner Capital", type: "equity", normalBalance: "credit" },
  { id: "5", gameId: "g", teamId: "t-red", name: "Rent Revenue", type: "revenue", normalBalance: "credit" },
  { id: "6", gameId: "g", teamId: "t-red", name: "Rent Expense", type: "expense", normalBalance: "debit" },
  { id: "7", gameId: "g", teamId: "t-red", name: "Repair Expense", type: "expense", normalBalance: "debit" },
];

function line(je: string, account: string, side: "d" | "c", amount: number): JournalEntryLine {
  return {
    id: `${je}-${account}`,
    journalEntryId: je,
    accountId: account,
    accountName: account,
    debit: side === "d" ? amount : 0,
    credit: side === "c" ? amount : 0,
  };
}

const lines: JournalEntryLine[] = [
  line("e1", "Cash", "d", 1500),
  line("e1", "Owner Capital", "c", 1500),
  line("e2", "Property", "d", 200),
  line("e2", "Owner Capital", "c", 200),
  line("e3", "Cash", "d", 100),
  line("e3", "Rent Revenue", "c", 100),
  line("e4", "Rent Expense", "d", 80),
  line("e4", "Cash", "c", 80),
  line("e5", "Repair Expense", "d", 150),
  line("e5", "Cash", "c", 150),
];

describe("generateIncomeStatement", () => {
  it("sums revenue and expenses", () => {
    const s = generateIncomeStatement(accounts, lines);
    expect(s.totalRevenue).toBe(100);
    expect(s.totalExpenses).toBe(230);
    expect(s.netIncome).toBe(-130);
  });
});

describe("generateBalanceSheet", () => {
  it("balances (Assets = Liabilities + Equity)", () => {
    const s = generateBalanceSheet(accounts, lines);
    // Assets: Cash 1370 + Property 200 = 1570
    expect(s.totalAssets).toBe(1570);
    // Liabilities: 0
    expect(s.totalLiabilities).toBe(0);
    // Equity: Owner Capital 1700 + net income (-130) = 1570
    expect(s.totalEquity).toBe(1570);
    expect(s.balances).toBe(true);
  });
});

describe("generateCashSummary", () => {
  it("computes inflows, outflows, ending", () => {
    const entries: JournalEntry[] = [
      { id: "e1", gameId: "g", teamId: "t-red", turnId: "t1", description: "Capital", sourceEventId: "", createdAt: "", year: 1, isStudentSubmitted: false, isCorrect: null, lines: [] },
      { id: "e3", gameId: "g", teamId: "t-red", turnId: "t3", description: "Rent received", sourceEventId: "", createdAt: "", year: 1, isStudentSubmitted: false, isCorrect: null, lines: [] },
      { id: "e4", gameId: "g", teamId: "t-red", turnId: "t4", description: "Rent paid", sourceEventId: "", createdAt: "", year: 1, isStudentSubmitted: false, isCorrect: null, lines: [] },
      { id: "e5", gameId: "g", teamId: "t-red", turnId: "t5", description: "Repairs", sourceEventId: "", createdAt: "", year: 1, isStudentSubmitted: false, isCorrect: null, lines: [] },
    ];
    const summary = generateCashSummary(accounts, lines, entries, 0);
    expect(summary.totalInflows).toBe(1600);
    expect(summary.totalOutflows).toBe(230);
    expect(summary.ending).toBe(1370);
  });
});

describe("generateARAPSchedule", () => {
  it("lists receivables and payables for a team", () => {
    const teams: Team[] = [
      { id: "t-red", gameId: "g", name: "Red", color: "red", position: 0, currentYear: 1, creditLimit: 500, isActive: true },
      { id: "t-blue", gameId: "g", name: "Blue", color: "blue", position: 0, currentYear: 1, creditLimit: 500, isActive: true },
    ];
    const cbs: CreditBalance[] = [
      { id: "cb1", gameId: "g", debtorTeamId: "t-blue", creditorTeamId: "t-red", amount: 100, sourceEventId: "rent", status: "open", createdAt: "" },
      { id: "cb2", gameId: "g", debtorTeamId: "t-red", creditorTeamId: "t-blue", amount: 80, sourceEventId: "event", status: "open", createdAt: "" },
    ];
    const schedule = generateARAPSchedule("t-red", teams, cbs);
    expect(schedule.rows).toHaveLength(2);
    expect(schedule.rows.some((r) => r.type === "receivable" && r.amount === 100)).toBe(true);
    expect(schedule.rows.some((r) => r.type === "payable" && r.amount === 80)).toBe(true);
  });
});
