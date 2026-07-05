import type {
  Difficulty,
  ExpectedEntry,
  ValidationErrorCode,
  ValidationResult,
} from "../types.js";
import { getAccountType, isAccountInMode } from "./accounts.js";
import { getNormalBalance } from "./normalBalances.js";

export interface JournalEntryInput {
  debitAccount: string;
  creditAccount: string;
  amount: number;
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether debiting/crediting an account increases its balance given normal balance rules. */
function sideIncreasesBalance(accountName: string, side: "debit" | "credit", difficulty: Difficulty): boolean {
  const accountType = getAccountType(accountName, difficulty)?.type;
  if (!accountType) return side === "debit";
  const normal = getNormalBalance(accountType);
  return (side === "debit" && normal === "debit") || (side === "credit" && normal === "credit");
}

function balanceChangeWord(increases: boolean): string {
  return increases ? "increases" : "decreases";
}

/**
 * Validate a student's single-debit/single-credit submission against the
 * expected entry for the acting team. Implements all five checks of PRD §17.2.
 */
export function validateJournalEntry(
  input: JournalEntryInput,
  expected: ExpectedEntry,
  difficulty: Difficulty,
): ValidationResult {
  const errors: ValidationErrorCode[] = [];

  // Account normalization happens against the expected entry (one debit + one credit line per PRD §17.1).
  const expectedDebit = expected.lines.find((l) => l.debit > 0);
  const expectedCredit = expected.lines.find((l) => l.credit > 0);

  if (!expectedDebit || !expectedCredit) {
    // Should never happen for our rule library, but be defensive.
    return {
      correct: false,
      errors: ["wrong_debit_account"],
      feedback: "This transaction has no expected entry configured.",
    };
  }

  // Rule 4: same account on both sides.
  if (eq(input.debitAccount, input.creditAccount)) {
    errors.push("same_account");
  }

  // Rule 1/2: correct debit / credit account.
  if (!eq(input.debitAccount, expectedDebit.accountName)) {
    errors.push("wrong_debit_account");
  }
  if (!eq(input.creditAccount, expectedCredit.accountName)) {
    errors.push("wrong_credit_account");
  }

  // Rule 3: amount.
  if (input.amount !== expectedDebit.debit) {
    errors.push("wrong_amount");
  }

  // Rule 5: accounts available in mode.
  if (!isAccountInMode(input.debitAccount, difficulty)) {
    errors.push("account_not_in_mode");
  }
  if (!isAccountInMode(input.creditAccount, difficulty)) {
    errors.push("account_not_in_mode");
  }

  const correct = errors.length === 0;
  return {
    correct,
    errors,
    feedback: feedbackFor(correct, expected),
  };
}

function feedbackFor(correct: boolean, expected: ExpectedEntry): string {
  if (correct) {
    return `Correct. ${expected.description}`;
  }
  return "Not quite. Think about whether cash increased or decreased, and whether this is revenue, expense, asset, liability, or equity.";
}

/**
 * Four hint levels per PRD §17.4, derived from account types + normal balances
 * so they work for every rule without per-card hint text.
 */
export function getHint(expected: ExpectedEntry, level: 1 | 2 | 3 | 4): string {
  const debit = expected.lines.find((l) => l.debit > 0)!;
  const credit = expected.lines.find((l) => l.credit > 0)!;
  const amount = debit.debit;
  const debitType = getAccountType(debit.accountName, "accrual");
  const creditType = getAccountType(credit.accountName, "accrual");

  switch (level) {
    case 1:
      return `This affects a${vowel(debitType?.type)} ${debitType?.type ?? "account"} and a${vowel(creditType?.type)} ${creditType?.type ?? "account"}.`;
    case 2: {
      const debitIncreases = sideIncreasesBalance(debit.accountName, "debit", "accrual");
      const creditIncreases = sideIncreasesBalance(credit.accountName, "credit", "accrual");
      return `${debit.accountName} ${balanceChangeWord(debitIncreases)}. ${credit.accountName} ${balanceChangeWord(creditIncreases)}.`;
    }
    case 3: {
      const dSide = debitType ? getNormalBalance(debitType.type) : "debit";
      const cSide = creditType ? getNormalBalance(creditType.type) : "credit";
      return `${capitalize(pluralType(debitType?.type))} increase with ${dSide}s. ${capitalize(pluralType(creditType?.type))} increase with ${cSide}s.`;
    }
    case 4:
      return `Dr ${debit.accountName} ${amount}, Cr ${credit.accountName} ${amount}.`;
  }
}

const vowel = (s?: string) => (s && /^[aeiou]/.test(s) ? "n" : "");
const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const pluralType = (t?: string) => (t ? (t.endsWith("y") ? t.slice(0, -1) + "ies" : t + "s") : "accounts");
