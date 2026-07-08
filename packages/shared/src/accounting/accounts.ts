import type { AccountDefinition, Difficulty } from "../types.js";

// PRD §10.1 — Cash Basis chart of accounts.
export const CASH_BASIS_ACCOUNTS: readonly AccountDefinition[] = [
  { name: "Cash", type: "asset" },
  { name: "Property", type: "asset" },
  { name: "Buildings", type: "asset" },

  { name: "Loan Payable", type: "liability" },

  { name: "Owner Capital", type: "equity" },
  { name: "Retained Earnings", type: "equity" },

  { name: "Rent Revenue", type: "revenue" },
  { name: "Event Revenue", type: "revenue" },
  { name: "Gain on Sale", type: "revenue" },

  { name: "Rent Expense", type: "expense" },
  { name: "Loss on Sale", type: "expense" },
  { name: "Repair Expense", type: "expense" },
  { name: "Interest Expense", type: "expense" },
  { name: "Event Expense", type: "expense" },
];

// PRD §10.2 — additional accounts for Accrual mode.
export const ACCRUAL_EXTRA_ACCOUNTS: readonly AccountDefinition[] = [
  { name: "Accounts Receivable", type: "asset" },
  { name: "Prepaid Services", type: "asset" },

  { name: "Accounts Payable", type: "liability" },
  { name: "Credit Line Payable", type: "liability" },
  { name: "Interest Payable", type: "liability" },

  { name: "Internet Expense", type: "expense" },
  { name: "Maintenance Expense", type: "expense" },
];

export const ACCRUAL_BASIS_ACCOUNTS: readonly AccountDefinition[] = [
  ...CASH_BASIS_ACCOUNTS,
  ...ACCRUAL_EXTRA_ACCOUNTS,
];

export function getChartOfAccounts(difficulty: Difficulty): readonly AccountDefinition[] {
  return difficulty === "cash" ? CASH_BASIS_ACCOUNTS : ACCRUAL_BASIS_ACCOUNTS;
}

const accountNameEqual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function isAccountInMode(accountName: string, difficulty: Difficulty): boolean {
  return getChartOfAccounts(difficulty).some((a) => accountNameEqual(a.name, accountName));
}

export function getAccountType(accountName: string, difficulty: Difficulty): AccountDefinition | undefined {
  return getChartOfAccounts(difficulty).find((a) => accountNameEqual(a.name, accountName));
}
