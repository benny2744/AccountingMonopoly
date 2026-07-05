import type { ExpectedEntry, ExpectedEntryLine } from "../types.js";

// PRD §22 — rule library mapping game events to expected journal entries.
// Each function returns one or more ExpectedEntry objects (one per affected team).

const desc = (s: string) => s;

// §7.2 Property assigned at setup
export function propertyAssignedAtSetup(teamId: string, amount: number, propertyName: string): ExpectedEntry {
  return {
    teamId,
    description: desc(`Received ${propertyName} at setup; invested into the business as owner capital.`),
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
    description: desc(`Bought ${propertyName} for cash.`),
    lines: [
      { accountName: "Property", debit: amount, credit: 0 },
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
      description: desc("Paid rent to another team in cash; using another team's property is an expense."),
      lines: [
        { accountName: "Rent Expense", debit: amount, credit: 0 },
        { accountName: "Cash", debit: 0, credit: amount },
      ],
    },
    {
      teamId: ownerTeamId,
      description: desc("Received rent in cash; earning from renting property is revenue."),
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
      description: desc("Owed rent to another team on credit; the obligation is Accounts Payable."),
      lines: [
        { accountName: "Rent Expense", debit: amount, credit: 0 },
        { accountName: "Accounts Payable", debit: 0, credit: amount },
      ],
    },
    {
      teamId: ownerTeamId,
      description: desc("Earned rent on credit; the amount owed to us is Accounts Receivable."),
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
      description: desc("Used the bank credit line to pay rent; the bank paid the owner, we owe the bank."),
      lines: [
        { accountName: "Rent Expense", debit: amount, credit: 0 },
        { accountName: "Credit Line Payable", debit: 0, credit: amount },
      ],
    },
    {
      teamId: ownerTeamId,
      description: desc("Received rent in cash funded by the visitor's bank credit line."),
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
    description: desc(`Received cash from an event (${reason}); this is event revenue.`),
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
    description: desc(`Paid cash for an event (${reason}); recorded as ${expenseAccount}.`),
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
    description: desc(`Owner contribution (${reason}); cash invested by owners increases equity, not revenue.`),
    lines: [
      { accountName: "Cash", debit: amount, credit: 0 },
      { accountName: "Owner Capital", debit: 0, credit: amount },
    ],
  };
}

export function repairPaidCash(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: desc("Paid cash for repairs; costs of maintaining property are Repair Expense."),
    lines: [
      { accountName: "Repair Expense", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function repairBillPayable(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: desc("Received a repair bill due at year-end; recognize the expense now, owe later."),
    lines: [
      { accountName: "Repair Expense", debit: amount, credit: 0 },
      { accountName: "Accounts Payable", debit: 0, credit: amount },
    ],
  };
}

export function expensePayable(teamId: string, amount: number, expenseAccount: string, reason: string): ExpectedEntry {
  return {
    teamId,
    description: desc(`${reason}; recognize the expense now and record a payable for later payment.`),
    lines: [
      { accountName: expenseAccount, debit: amount, credit: 0 },
      { accountName: "Accounts Payable", debit: 0, credit: amount },
    ],
  };
}

export function revenueReceivable(teamId: string, amount: number, revenueAccount: string, reason: string): ExpectedEntry {
  return {
    teamId,
    description: desc(`${reason}; revenue is earned now even though cash arrives later (accrual).`),
    lines: [
      { accountName: "Accounts Receivable", debit: amount, credit: 0 },
      { accountName: revenueAccount, debit: 0, credit: amount },
    ],
  };
}

export function prepaidPurchase(teamId: string, amount: number, reason: string): ExpectedEntry {
  return {
    teamId,
    description: desc(`Paid cash in advance (${reason}); record a Prepaid Services asset until used.`),
    lines: [
      { accountName: "Prepaid Services", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function prepaidRecognition(teamId: string, amount: number, expenseAccount: string): ExpectedEntry {
  return {
    teamId,
    description: desc(`Year-end: the prepaid service has been used; recognize ${expenseAccount}.`),
    lines: [
      { accountName: expenseAccount, debit: amount, credit: 0 },
      { accountName: "Prepaid Services", debit: 0, credit: amount },
    ],
  };
}

export function loanTaken(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: desc("Borrowed from the bank; cash increases and a Loan Payable liability is created."),
    lines: [
      { accountName: "Cash", debit: amount, credit: 0 },
      { accountName: "Loan Payable", debit: 0, credit: amount },
    ],
  };
}

export function loanPrincipalRepaid(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: desc("Repaid loan principal with cash."),
    lines: [
      { accountName: "Loan Payable", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function interestPaidCash(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: desc("Paid interest on outstanding loan in cash."),
    lines: [
      { accountName: "Interest Expense", debit: amount, credit: 0 },
      { accountName: "Cash", debit: 0, credit: amount },
    ],
  };
}

export function interestAddedToLoan(teamId: string, amount: number): ExpectedEntry {
  return {
    teamId,
    description: desc("Interest accrued but cash was insufficient; added to the loan balance."),
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
      description: desc("Year-end: settled Accounts Payable with cash."),
      lines: [
        { accountName: "Accounts Payable", debit: amount, credit: 0 },
        { accountName: "Cash", debit: 0, credit: amount },
      ],
    },
    {
      teamId: creditorTeamId,
      description: desc("Year-end: collected the Accounts Receivable owed to us in cash."),
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
      description: desc("Year-end: rolled Accounts Payable into a bank loan; we now owe the bank instead."),
      lines: [
        { accountName: "Accounts Payable", debit: amount, credit: 0 },
        { accountName: "Loan Payable", debit: 0, credit: amount },
      ],
    },
    {
      teamId: creditorTeamId,
      description: desc("Year-end: bank paid the Accounts Receivable owed to us; collected in cash."),
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
      description: desc(`Paid each other team $${perTeamAmount} (${reason}); total event expense.`),
      lines: [
        { accountName: "Event Expense", debit: total, credit: 0 },
        { accountName: "Cash", debit: 0, credit: total },
      ],
    },
  ];
  for (const recipId of recipientTeamIds) {
    entries.push({
      teamId: recipId,
      description: desc(`Received $${perTeamAmount} from another team (${reason}); event revenue.`),
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
      description: desc(`Collected $${perTeamAmount} from each other team (${reason}); total event revenue.`),
      lines: [
        { accountName: "Cash", debit: total, credit: 0 },
        { accountName: "Event Revenue", debit: 0, credit: total },
      ],
    },
  ];
  for (const payerId of payerTeamIds) {
    entries.push({
      teamId: payerId,
      description: desc(`Paid $${perTeamAmount} to another team (${reason}); event expense.`),
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
