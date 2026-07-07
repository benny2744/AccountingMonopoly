import type { ExpectedEntry, ExpectedEntryLine } from "../types.js";
import { getAccountKey, getPropertyKey } from "../i18n/labels.js";

// PRD §22 — rule library mapping game events to expected journal entries.
// Each function returns one or more ExpectedEntry objects (one per affected team).
// Descriptions are i18n keys; params may contain other i18n keys which are
// translated at display time by the i18n format() helper.

// §7.2 Property assigned at setup
export function propertyAssignedAtSetup(teamId: string, amount: number, propertyName: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.propertyAssignedAtSetup",
    descriptionParams: { propertyName: getPropertyKey(propertyName) },
    lines: [
      { accountName: "Property", debit: amount, credit: 0 },
      { accountName: "Owner Capital", debit: 0, credit: amount },
    ],
  };
}

// §23 Property purchase
export function propertyPurchase(teamId: string, amount: number, propertyName: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.propertyPurchase",
    descriptionParams: { propertyName: getPropertyKey(propertyName) },
    lines: [
      { accountName: "Property", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function buildingPurchase(teamId: string, amount: number, propertyName: string, levelLabel: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.buildingPurchase",
    descriptionParams: { propertyName: getPropertyKey(propertyName), levelLabel: levelLabel === "hotel" ? "common.hotel" : "common.house" },
    lines: [
      { accountName: "Buildings", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

// §9.2 Rent paid cash
export function rentPaidCash(
  payerTeamId: string,
  ownerTeamId: string,
  amount: number,
): ExpectedEntry[] {
  return [
    {
      teamId: payerTeamId,
      description: "entryRules.paidRentCash",
      lines: [
        { accountName: "Rent Expense", debit: amount, credit: 0 },
        { accountName: "Cash", debit: 0, credit: amount },
      ],
    },
    {
      teamId: ownerTeamId,
      description: "entryRules.receivedRentCash",
      lines: [
        { accountName: "Cash", debit: amount, credit: 0 },
        { accountName: "Rent Revenue", debit: 0, credit: amount },
      ],
    },
  ];
}

// §9.2 Rent paid on player credit (accrual)
export function rentPaidCredit(
  payerTeamId: string,
  ownerTeamId: string,
  amount: number,
): ExpectedEntry[] {
  return [
    {
      teamId: payerTeamId,
      description: "entryRules.owedRentCredit",
      lines: [
        { accountName: "Rent Expense", debit: amount, credit: 0 },
        { accountName: "Accounts Payable", debit: 0, credit: amount },
      ],
    },
    {
      teamId: ownerTeamId,
      description: "entryRules.earnedRentCredit",
      lines: [
        { accountName: "Accounts Receivable", debit: amount, credit: 0 },
        { accountName: "Rent Revenue", debit: 0, credit: amount },
      ],
    },
  ];
}

// §9.2 Rent paid with bank credit line (accrual)
export function rentPaidCreditLine(
  payerTeamId: string,
  ownerTeamId: string,
  amount: number,
): ExpectedEntry[] {
  return [
    {
      teamId: payerTeamId,
      description: "entryRules.usedCreditLine",
      lines: [
        { accountName: "Rent Expense", debit: amount, credit: 0 },
        { accountName: "Credit Line Payable", debit: 0, credit: amount },
      ],
    },
    {
      teamId: ownerTeamId,
      description: "entryRules.receivedRentCreditLine",
      lines: [
        { accountName: "Cash", debit: amount, credit: 0 },
        { accountName: "Rent Revenue", debit: 0, credit: amount },
      ],
    },
  ];
}

// Generic cash event revenue (§11.1 Major Conference etc.)
export function cashEventRevenue(teamId: string, amount: number, reason: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.cashEventRevenue",
    descriptionParams: { reason },
    lines: [
      { accountName: "Cash", debit: amount, credit: 0 },
      { accountName: "Event Revenue", debit: 0, credit: amount },
    ],
  };
}

// Generic cash event expense (e.g. Utility Bill → Event Expense, Cleaning → Repair Expense).
export function cashEventExpense(
  teamId: string,
  amount: number,
  expenseAccount: string,
  reason: string,
): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.cashEventExpense",
    descriptionParams: { reason, expenseAccount: getAccountKey(expenseAccount) },
    lines: [
      { accountName: expenseAccount, debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

// §11.1 Inherit / Investor Contribution
export function ownerCapitalContribution(teamId: string, amount: number, reason: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.ownerCapitalContribution",
    descriptionParams: { reason },
    lines: [
      { accountName: "Cash", debit: amount, credit: 0 },
      { accountName: "Owner Capital", debit: 0, credit: amount },
    ],
  };
}

export function repairPaidCash(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.repairPaidCash",
    lines: [
      { accountName: "Repair Expense", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function repairBillPayable(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.repairBillPayable",
    lines: [
      { accountName: "Repair Expense", debit: amount, credit: 0 },
      { accountName: "Accounts Payable", debit: 0, credit: amount },
    ],
  };
}

export function expensePayable(teamId: string, amount: number, expenseAccount: string, reason: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.expensePayable",
    descriptionParams: { reason, expenseAccount: getAccountKey(expenseAccount) },
    lines: [
      { accountName: expenseAccount, debit: amount, credit: 0 },
      { accountName: "Accounts Payable", debit: 0, credit: amount },
    ],
  };
}

export function revenueReceivable(teamId: string, amount: number, revenueAccount: string, reason: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.revenueReceivable",
    descriptionParams: { reason },
    lines: [
      { accountName: "Accounts Receivable", debit: amount, credit: 0 },
      { accountName: revenueAccount, debit: 0, credit: amount },
    ],
  };
}

export function prepaidPurchase(teamId: string, amount: number, reason: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.prepaidPurchase",
    descriptionParams: { reason },
    lines: [
      { accountName: "Prepaid Services", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function prepaidRecognition(teamId: string, amount: number, expenseAccount: string): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.prepaidRecognition",
    descriptionParams: { expenseAccount: getAccountKey(expenseAccount) },
    lines: [
      { accountName: expenseAccount, debit: amount, credit: 0 },
      { accountName: "Prepaid Services", debit: 0, credit: amount },
    ],
  };
}

export function loanTaken(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.loanTaken",
    lines: [
      { accountName: "Cash", debit: amount, credit: 0 },
      { accountName: "Loan Payable", debit: 0, credit: amount },
    ],
  };
}

export function loanPrincipalRepaid(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.loanPrincipalRepaid",
    lines: [
      { accountName: "Loan Payable", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function interestPaidCash(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.interestPaidCash",
    lines: [
      { accountName: "Interest Expense", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function interestAddedToLoan(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: "entryRules.interestAddedToLoan",
    lines: [
      { accountName: "Interest Expense", debit: amount, credit: 0 },
      { accountName: "Loan Payable", debit: 0, credit: amount },
    ],
  };
}

// §12.3 Settle A/P with cash
export function apPaidCash(debtorTeamId: string, creditorTeamId: string, amount: number): ExpectedEntry[] {
  return [
    {
      teamId: debtorTeamId,
      description: "entryRules.apPaidCash",
      lines: [
        { accountName: "Accounts Payable", debit: amount, credit: 0 },
        { accountName: "Cash", debit: 0, credit: amount },
      ],
    },
    {
      teamId: creditorTeamId,
      description: "entryRules.arCollectedCash",
      lines: [
        { accountName: "Cash", debit: amount, credit: 0 },
        { accountName: "Accounts Receivable", debit: 0, credit: amount },
      ],
    },
  ];
}

// §12.3 Roll A/P into bank loan
export function apRolledToLoan(debtorTeamId: string, creditorTeamId: string, amount: number): ExpectedEntry[] {
  return [
    {
      teamId: debtorTeamId,
      description: "entryRules.apRolledToLoan",
      lines: [
        { accountName: "Accounts Payable", debit: amount, credit: 0 },
        { accountName: "Loan Payable", debit: 0, credit: amount },
      ],
    },
    {
      teamId: creditorTeamId,
      description: "entryRules.arRolledToLoan",
      lines: [
        { accountName: "Cash", debit: amount, credit: 0 },
        { accountName: "Accounts Receivable", debit: 0, credit: amount },
      ],
    },
  ];
}

// §11.1 Neighborhood Promotion — pay each other team perTeamAmount
export function multiTeamEventPay(
  payerTeamId: string,
  recipientTeamIds: readonly string[],
  perTeamAmount: number,
  reason: string,
): ExpectedEntry[] {
  const total = perTeamAmount * recipientTeamIds.length;
  const entries: ExpectedEntry[] = [
    {
      teamId: payerTeamId,
      description: "entryRules.multiTeamPayPayer",
      descriptionParams: { perTeamAmount, reason },
      lines: [
        { accountName: "Event Expense", debit: total, credit: 0 },
        { accountName: "Cash", debit: 0, credit: total },
      ],
    },
  ];
  for (const recipId of recipientTeamIds) {
    entries.push({
      teamId: recipId,
      description: "entryRules.multiTeamPayRecipient",
      descriptionParams: { perTeamAmount, reason },
      lines: [
        { accountName: "Cash", debit: perTeamAmount, credit: 0 },
        { accountName: "Event Revenue", debit: 0, credit: perTeamAmount },
      ],
    });
  }
  return entries;
}

// §11.1 Local Festival Boost — collect perTeamAmount from each other team
export function multiTeamEventCollect(
  collectorTeamId: string,
  payerTeamIds: readonly string[],
  perTeamAmount: number,
  reason: string,
): ExpectedEntry[] {
  const total = perTeamAmount * payerTeamIds.length;
  const entries: ExpectedEntry[] = [
    {
      teamId: collectorTeamId,
      description: "entryRules.multiTeamCollectCollector",
      descriptionParams: { perTeamAmount, reason },
      lines: [
        { accountName: "Cash", debit: total, credit: 0 },
        { accountName: "Event Revenue", debit: 0, credit: total },
      ],
    },
  ];
  for (const payerId of payerTeamIds) {
    entries.push({
      teamId: payerId,
      description: "entryRules.multiTeamCollectPayer",
      descriptionParams: { perTeamAmount, reason },
      lines: [
        { accountName: "Event Expense", debit: perTeamAmount, credit: 0 },
        { accountName: "Cash", debit: 0, credit: perTeamAmount },
      ],
    });
  }
  return entries;
}

// Convenience: build a single-team expected entry from arbitrary lines (used by tests).
export function fromLines(teamId: string, description: string, lines: ExpectedEntryLine[]): ExpectedEntry {
  return { teamId, description, lines };
}
