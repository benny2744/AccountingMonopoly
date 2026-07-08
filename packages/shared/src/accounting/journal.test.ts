import { describe, expect, it } from "vitest";
import type { Account, JournalEntry, JournalEntryLine } from "../types.js";
import {
  buildTAccounts,
  calculateAccountBalance,
  postJournalEntry,
  sumCredits,
  sumDebits,
  UnbalancedEntryError,
} from "./journal.js";
import { propertySaleSeller } from "./entryRules.js";

function line(
  journalEntryId: string,
  accountName: string,
  side: "d" | "c",
  amount: number,
): JournalEntryLine {
  return {
    id: `${journalEntryId}-${accountName}`,
    journalEntryId,
    accountId: accountName,
    accountName,
    debit: side === "d" ? amount : 0,
    credit: side === "c" ? amount : 0,
  };
}

const accounts: Account[] = [
  { id: "a1", gameId: "g", teamId: "t", name: "Cash", type: "asset", normalBalance: "debit" },
  { id: "a2", gameId: "g", teamId: "t", name: "Owner Capital", type: "equity", normalBalance: "credit" },
  { id: "a3", gameId: "g", teamId: "t", name: "Rent Revenue", type: "revenue", normalBalance: "credit" },
  { id: "a4", gameId: "g", teamId: "t", name: "Rent Expense", type: "expense", normalBalance: "debit" },
];

describe("sum helpers", () => {
  it("sums debits and credits", () => {
    const lines = [line("e1", "Cash", "d", 100), line("e1", "Owner Capital", "c", 100)];
    expect(sumDebits(lines)).toBe(100);
    expect(sumCredits(lines)).toBe(100);
  });
});

describe("postJournalEntry", () => {
  it("posts a balanced entry", () => {
    const lines = [line("e1", "Cash", "d", 100), line("e1", "Owner Capital", "c", 100)];
    const posted = postJournalEntry(lines);
    expect(posted).toHaveLength(2);
  });

  it("rejects an unbalanced entry", () => {
    const lines = [line("e1", "Cash", "d", 100), line("e1", "Owner Capital", "c", 90)];
    expect(() => postJournalEntry(lines)).toThrow(UnbalancedEntryError);
  });

  it("rejects a zero entry", () => {
    const lines = [line("e1", "Cash", "d", 0), line("e1", "Owner Capital", "c", 0)];
    expect(() => postJournalEntry(lines)).toThrow(UnbalancedEntryError);
  });

  it("rejects a line that has both debit and credit", () => {
    const bad: JournalEntryLine = {
      id: "x",
      journalEntryId: "e1",
      accountId: "Cash",
      accountName: "Cash",
      debit: 50,
      credit: 50,
    };
    expect(() => postJournalEntry([bad])).toThrow(UnbalancedEntryError);
  });

  it("posts a 3-line property sale entry", () => {
    const expected = propertySaleSeller("t", 300, 200, "Boardwalk");
    const lines = expected.lines.map((l, i) =>
      line("e-sale", l.accountName, l.debit > 0 ? "d" : "c", l.debit > 0 ? l.debit : l.credit),
    );
    lines.forEach((l, i) => {
      l.id = `e-sale-${i}`;
    });
    const posted = postJournalEntry(lines);
    expect(posted).toHaveLength(3);
    expect(sumDebits(posted)).toBe(300);
    expect(sumCredits(posted)).toBe(300);
  });
});

describe("calculateAccountBalance", () => {
  it("computes debit-normal balance", () => {
    const lines = [
      line("e1", "Cash", "d", 1500),
      line("e2", "Cash", "d", 100),
      line("e3", "Cash", "c", 80),
    ];
    const bal = calculateAccountBalance(accounts[0]!, lines);
    expect(bal.balance).toBe(1520);
    expect(bal.side).toBe("debit");
  });

  it("computes credit-normal balance", () => {
    const lines = [line("e1", "Owner Capital", "c", 1500), line("e2", "Owner Capital", "c", 200)];
    const bal = calculateAccountBalance(accounts[1]!, lines);
    expect(bal.balance).toBe(1700);
    expect(bal.side).toBe("credit");
  });
});

describe("buildTAccounts", () => {
  it("builds T-account view with counter-account names", () => {
    const entries: JournalEntry[] = [
      {
        id: "e1",
        gameId: "g",
        teamId: "t",
        turnId: "turn1",
        description: "Owner invested cash",
        sourceEventId: "ev1",
        createdAt: "",
        year: 1,
        isStudentSubmitted: false,
        isCorrect: true,
        lines: [],
      },
    ];
    const lines = [line("e1", "Cash", "d", 1500), line("e1", "Owner Capital", "c", 1500)];
    const t = buildTAccounts(accounts.slice(0, 2), entries, lines);
    expect(t).toHaveLength(2);
    const cash = t.find((x) => x.accountName === "Cash")!;
    expect(cash.debits).toHaveLength(1);
    expect(cash.debits[0]!.counterAccountName).toBe("Owner Capital");
    expect(cash.credits).toHaveLength(0);
    expect(cash.balance).toBe(1500);
  });

  it("filters by year", () => {
    const entries: JournalEntry[] = [
      { ...entryShell("e1", 1), lines: [] },
      { ...entryShell("e2", 2), lines: [] },
    ];
    const lines = [
      line("e1", "Cash", "d", 1500),
      line("e1", "Owner Capital", "c", 1500),
      line("e2", "Cash", "d", 100),
      line("e2", "Rent Revenue", "c", 100),
    ];
    const t = buildTAccounts(accounts.slice(0, 2), entries, lines, { year: 1 });
    const cash = t.find((x) => x.accountName === "Cash")!;
    expect(cash.debits).toHaveLength(1);
    expect(cash.debits[0]!.amount).toBe(1500);
    expect(cash.balance).toBe(1500);
  });
});

function entryShell(id: string, year: number): JournalEntry {
  return {
    id,
    gameId: "g",
    teamId: "t",
    turnId: "turn",
    description: "",
    sourceEventId: "",
    createdAt: "",
    year,
    isStudentSubmitted: false,
    isCorrect: null,
    lines: [],
  };
}
