import { describe, expect, it } from "vitest";
import type { ExpectedEntry } from "../types.js";
import { isAccountInMode } from "./accounts.js";
import { getHint, validateJournalEntry } from "./validation.js";
import { loanPrincipalRepaid, rentPaidCash } from "./entryRules.js";

const expected = (over: Partial<ExpectedEntry> = {}): ExpectedEntry => ({
  teamId: "t-red",
  description: "Paid rent in cash.",
  lines: [
    { accountName: "Rent Expense", debit: 120, credit: 0 },
    { accountName: "Cash", debit: 0, credit: 120 },
  ],
  ...over,
});

describe("validateJournalEntry — PRD §17.2", () => {
  it("accepts a correct entry", () => {
    const r = validateJournalEntry(
      { debitAccount: "Rent Expense", creditAccount: "Cash", amount: 120 },
      expected(),
      "cash",
    );
    expect(r.correct).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("flags wrong debit account", () => {
    const r = validateJournalEntry(
      { debitAccount: "Repair Expense", creditAccount: "Cash", amount: 120 },
      expected(),
      "cash",
    );
    expect(r.correct).toBe(false);
    expect(r.errors).toContain("wrong_debit_account");
  });

  it("flags wrong credit account", () => {
    const r = validateJournalEntry(
      { debitAccount: "Rent Expense", creditAccount: "Loan Payable", amount: 120 },
      expected(),
      "cash",
    );
    expect(r.errors).toContain("wrong_credit_account");
  });

  it("flags wrong amount", () => {
    const r = validateJournalEntry(
      { debitAccount: "Rent Expense", creditAccount: "Cash", amount: 50 },
      expected(),
      "cash",
    );
    expect(r.errors).toContain("wrong_amount");
  });

  it("flags same account on both sides", () => {
    const r = validateJournalEntry(
      { debitAccount: "Cash", creditAccount: "Cash", amount: 120 },
      expected(),
      "cash",
    );
    expect(r.errors).toContain("same_account");
  });

  it("flags accrual-only account used in cash mode", () => {
    const r = validateJournalEntry(
      { debitAccount: "Accounts Receivable", creditAccount: "Cash", amount: 120 },
      expected({ lines: [{ accountName: "Accounts Receivable", debit: 120, credit: 0 }, { accountName: "Cash", debit: 0, credit: 120 }] }),
      "cash",
    );
    expect(r.errors).toContain("account_not_in_mode");
  });
});

describe("isAccountInMode", () => {
  it("Cash is in both modes", () => {
    expect(isAccountInMode("Cash", "cash")).toBe(true);
    expect(isAccountInMode("Cash", "accrual")).toBe(true);
  });
  it("Accounts Receivable is accrual only", () => {
    expect(isAccountInMode("Accounts Receivable", "cash")).toBe(false);
    expect(isAccountInMode("Accounts Receivable", "accrual")).toBe(true);
  });
});

describe("getHint — PRD §17.4 four levels", () => {
  const e = rentPaidCash("t-red", "t-blue", 100)[0]!;
  it("level 1: statement effect (mentions types)", () => {
    const h = getHint(e, 1);
    expect(h).toMatch(/expense/i);
    expect(h).toMatch(/asset/i);
  });
  it("level 2: account directions", () => {
    const h = getHint(e, 2);
    expect(h).toContain("Rent Expense");
    expect(h).toContain("Cash");
    expect(h).toBe("Rent Expense increases. Cash decreases.");
  });
  it("level 2: debiting a credit-normal account says it decreases", () => {
    // Regression: debit side must not blindly say "increases" (e.g. loan repayment).
    const repay = loanPrincipalRepaid("t-red", 200);
    const h = getHint(repay, 2);
    expect(h).toBe("Loan Payable decreases. Cash decreases.");
  });
  it("level 3: debit/credit rule", () => {
    const h = getHint(e, 3);
    expect(h.toLowerCase()).toMatch(/debit/);
  });
  it("level 4: full answer", () => {
    const h = getHint(e, 4);
    expect(h).toBe("Dr Rent Expense 100, Cr Cash 100.");
  });
});
