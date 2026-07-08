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

export interface JournalEntryLineInput {
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntryLinesInput {
  lines: JournalEntryLineInput[];
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function isPositiveInteger(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

function matchLines(
  expected: { accountName: string; amount: number }[],
  actual: { accountName: string; amount: number }[],
  side: "debit" | "credit",
): ValidationErrorCode[] {
  const errors: ValidationErrorCode[] = [];
  const pool = [...actual];
  for (const exp of expected) {
    const idx = pool.findIndex((a) => eq(a.accountName, exp.accountName) && a.amount === exp.amount);
    if (idx >= 0) {
      pool.splice(idx, 1);
      continue;
    }
    const accountMatch = pool.find((a) => eq(a.accountName, exp.accountName));
    if (accountMatch) {
      errors.push("wrong_amount");
      pool.splice(pool.indexOf(accountMatch), 1);
    } else {
      errors.push(side === "debit" ? "wrong_debit_account" : "wrong_credit_account");
    }
  }
  for (const leftover of pool) {
    errors.push(leftover.accountName ? (side === "debit" ? "wrong_debit_account" : "wrong_credit_account") : "invalid_line");
  }
  return errors;
}

export function validateJournalEntryLines(
  input: JournalEntryLinesInput,
  expected: ExpectedEntry,
  difficulty: Difficulty,
): ValidationResult {
  const errors: ValidationErrorCode[] = [];

  if (input.lines.length !== expected.lines.length) {
    errors.push("wrong_line_count");
  }

  const accountsUsed = new Set<string>();
  let totalDebit = 0;
  let totalCredit = 0;
  const actualDebits: { accountName: string; amount: number }[] = [];
  const actualCredits: { accountName: string; amount: number }[] = [];

  for (const line of input.lines) {
    const key = line.accountName.trim().toLowerCase();
    if (accountsUsed.has(key)) errors.push("same_account");
    accountsUsed.add(key);

    const hasDebit = line.debit > 0;
    const hasCredit = line.credit > 0;
    if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
      errors.push("invalid_line");
      continue;
    }
    if (hasDebit && !isPositiveInteger(line.debit)) errors.push("wrong_amount");
    if (hasCredit && !isPositiveInteger(line.credit)) errors.push("wrong_amount");

    if (hasDebit) {
      totalDebit += line.debit;
      actualDebits.push({ accountName: line.accountName, amount: line.debit });
    } else {
      totalCredit += line.credit;
      actualCredits.push({ accountName: line.accountName, amount: line.credit });
    }

    if (!isAccountInMode(line.accountName, difficulty)) {
      errors.push("account_not_in_mode");
    }
  }

  if (totalDebit !== totalCredit) {
    errors.push("unbalanced_entry");
  }

  const expectedDebits = expected.lines
    .filter((l) => l.debit > 0)
    .map((l) => ({ accountName: l.accountName, amount: l.debit }));
  const expectedCredits = expected.lines
    .filter((l) => l.credit > 0)
    .map((l) => ({ accountName: l.accountName, amount: l.credit }));

  errors.push(...matchLines(expectedDebits, actualDebits, "debit"));
  errors.push(...matchLines(expectedCredits, actualCredits, "credit"));

  const uniqueErrors = [...new Set(errors)];
  const correct = uniqueErrors.length === 0;
  const description = correct ? expected.description : undefined;
  return {
    correct,
    errors: uniqueErrors,
    feedback: correct
      ? `Correct. ${expected.description}`
      : "Not quite. Check each debit and credit line — accounts and amounts must match.",
    feedbackKey: correct ? "validation.correct" : "validation.incorrectMultiline",
    feedbackParams: description ? { description } : undefined,
  };
}

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
  if (expected.lines.length > 2) {
    return getMultiLineHint(expected, level);
  }
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

function getMultiLineHint(
  expected: ExpectedEntry,
  level: 1 | 2 | 3 | 4,
): { key: string; params?: Record<string, string | number> } {
  const debits = expected.lines.filter((l) => l.debit > 0);
  const credits = expected.lines.filter((l) => l.credit > 0);
  switch (level) {
    case 1: {
      const debitType = getAccountType(debits[0]!.accountName, "accrual");
      const creditType = getAccountType(credits[0]!.accountName, "accrual");
      return {
        key: "validation.hint1Multi",
        params: {
          debitCount: debits.length,
          creditCount: credits.length,
          vowel1: vowel(debitType?.type),
          type1: debitType?.type ?? "account",
          vowel2: vowel(creditType?.type),
          type2: creditType?.type ?? "account",
        },
      };
    }
    case 2: {
      const parts = expected.lines
        .map((line) => {
          const side: "debit" | "credit" = line.debit > 0 ? "debit" : "credit";
          const increases = sideIncreasesBalance(line.accountName, side, "accrual");
          return `${line.accountName} ${balanceChangeWord(increases)}`;
        })
        .join("; ");
      return { key: "validation.hint2Multi", params: { parts } };
    }
    case 3:
      return {
        key: "validation.hint3Multi",
        params: {
          debitCount: debits.length,
          creditCount: credits.length,
        },
      };
    case 4: {
      const accounts = expected.lines.map((l) => getAccountKey(l.accountName)).join(", ");
      const amounts = expected.lines.map((l) => (l.debit > 0 ? l.debit : l.credit)).join(", ");
      return { key: "validation.hint4Multi", params: { accounts, amounts } };
    }
  }
}
