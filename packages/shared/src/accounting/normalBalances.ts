import type { AccountType, NormalBalance } from "../types.js";

// PRD §21.2 — normal balances by account type.
export function getNormalBalance(type: AccountType): NormalBalance {
  switch (type) {
    case "asset":
    case "expense":
      return "debit";
    case "liability":
    case "equity":
    case "revenue":
      return "credit";
  }
}
