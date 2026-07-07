import type {
  Difficulty,
  ExpectedEntry,
  ValidationErrorCode,
  ValidationResult,
} from "../types.js";
import { getAccountType, isAccountInMode } from "./accounts.js";
import { getNormalBalance } from "./normalBalances.js";
import { getAccountKey } from "../i18n/labels.js";

export interface JournalEntryInput {
  debitAccount: string;
  creditAccount: string;
  amount: number;
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function sideIncreasesBalance(accountName: string, side: "debit" | "credit", difficulty: Difficulty): boolean {
  const accountType = getAccountType(accountName, difficulty)?.type;
  if (!accountType) return side === "debit";
  const normal = getNormalBalance(accountType);
  return (side === "debit" && normal === "debit") || (side === "credit" && normal === "credit");
}

function balanceChangeWord(increases: boolean): string {
  return increases ? "validation.increase" : "validation.decrease";
}

function accountTypeKey(type?: string): string {
  return `validation.plural${type ? type[0]!.toUpperCase() + type.slice(1) : "Account"}` as string;
}

export function validateJournalEntry(
  input: JournalEntryInput,
  expected: ExpectedEntry,
  difficulty: Difficulty,
): ValidationResult {
  const errors: ValidationErrorCode[] = [];

  const expectedDebit = expected.lines.find((l) => l.debit > 0);
  const expectedCredit = expected.lines.find((l) => l.credit > 0);

  if (!expectedDebit || !expectedCredit) {
    return {
      correct: false,
      errors: ["wrong_debit_account"],
      feedback: "This transaction has no expected entry configured.",
      feedbackKey: "validation.noExpectedEntry",
    };
  }

  if (eq(input.debitAccount, input.creditAccount)) {
    errors.push("same_account");
  }

  if (!eq(input.debitAccount, expectedDebit.accountName)) {
    errors.push("wrong_debit_account");
  }
  if (!eq(input.creditAccount, expectedCredit.accountName)) {
    errors.push("wrong_credit_account");
  }

  if (input.amount !== expectedDebit.debit) {
    errors.push("wrong_amount");
  }

  if (!isAccountInMode(input.debitAccount, difficulty)) {
    errors.push("account_not_in_mode");
  }
  if (!isAccountInMode(input.creditAccount, difficulty)) {
    errors.push("account_not_in_mode");
  }

  const correct = errors.length === 0;
  const description = correct ? expected.description : undefined;
  return {
    correct,
    errors,
    feedback: correct
      ? `Correct. ${expected.description}`
      : "Not quite. Think about whether cash increased or decreased, and whether this is revenue, expense, asset, liability, or equity.",
    feedbackKey: correct ? "validation.correct" : "validation.incorrect",
    feedbackParams: description ? { description } : undefined,
  };
}

export function getHint(expected: ExpectedEntry, level: 1 | 2 | 3 | 4): { key: string; params?: Record<string, string | number> } {
  const debit = expected.lines.find((l) => l.debit > 0)!;
  const credit = expected.lines.find((l) => l.credit > 0)!;
  const amount = debit.debit;
  const debitType = getAccountType(debit.accountName, "accrual");
  const creditType = getAccountType(credit.accountName, "accrual");

  switch (level) {
    case 1:
      return {
        key: "validation.hint1",
        params: {
          vowel1: vowel(debitType?.type),
          type1: debitType?.type ?? "account",
          vowel2: vowel(creditType?.type),
          type2: creditType?.type ?? "account",
        },
      };
    case 2: {
      const debitIncreases = sideIncreasesBalance(debit.accountName, "debit", "accrual");
      const creditIncreases = sideIncreasesBalance(credit.accountName, "credit", "accrual");
      return {
        key: "validation.hint2",
        params: {
          debitAccount: getAccountKey(debit.accountName),
          debitChange: balanceChangeWord(debitIncreases),
          creditAccount: getAccountKey(credit.accountName),
          creditChange: balanceChangeWord(creditIncreases),
        },
      };
    }
    case 3: {
      const dSide = debitType ? getNormalBalance(debitType.type) : "debit";
      const cSide = creditType ? getNormalBalance(creditType.type) : "credit";
      return {
        key: "validation.hint3",
        params: {
          debitType: accountTypeKey(debitType?.type),
          debitSide: dSide,
          creditType: accountTypeKey(creditType?.type),
          creditSide: cSide,
        },
      };
    }
    case 4:
      return {
        key: "validation.hint4",
        params: {
          debitAccount: getAccountKey(debit.accountName),
          creditAccount: getAccountKey(credit.accountName),
          amount,
        },
      };
  }
}

const vowel = (s?: string) => (s && /^[aeiou]/.test(s) ? "n" : "");
