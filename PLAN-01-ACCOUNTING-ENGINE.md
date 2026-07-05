# Phase 1 — Monorepo Scaffold + Shared Accounting Engine

Goal (PRD §26.1, §32): a pure TypeScript accounting engine in `packages/shared` with no React/Express dependencies, fully unit-tested against the PRD's Scenario A (cash) and Scenario B (accrual) before any game or UI code exists.

## 1. Workspace scaffold

Create:

```txt
accounting-monopoly/            (repo root, already exists)
  package.json                  (private, workspaces via pnpm)
  pnpm-workspace.yaml           (apps/*, packages/*)
  tsconfig.base.json            (strict, ES2022, moduleResolution bundler)
  .gitignore                    (node_modules, dist, *.db)
  apps/client/                  (placeholder until Phase 2)
  apps/server/                  (placeholder until Phase 2)
  packages/shared/
    package.json                (name: @amono/shared, type: module)
    tsconfig.json
    vitest.config.ts
    src/
```

Root scripts: `test` (vitest run across workspaces), `build` (tsc -b), `lint` if a linter is added later. Keep Phase 1 dependency-light: only `typescript`, `vitest`.

## 2. `packages/shared/src/types.ts`

Copy the PRD §18 interfaces verbatim as the single source of truth:

- `Difficulty`, `GameStatus`, `Game` (with `settings` including `propertyAllocationRatio`, `startingCash`, `startingLoanLimit`, `boardPreset`, `journalEntryMode`)
- `Team`, `BoardSpaceType`, `BoardSpace`, `Property`
- `AccountType`, `Account`
- `JournalEntry`, `JournalEntryLine`
- `GameEventType`, `GameEvent`
- `CreditBalance`

Add engine-only types not in §18 but implied by §21/§22:

```ts
interface ExpectedEntryLine { accountName: string; debit: number; credit: number }
interface ExpectedEntry { teamId: string; description: string; lines: ExpectedEntryLine[] }
interface ValidationResult {
  correct: boolean;
  errors: Array<"wrong_debit_account" | "wrong_credit_account" | "wrong_amount" | "same_account" | "account_not_in_mode">;
  feedback: string;            // student-facing sentence (PRD §17.3)
}
interface AccountBalance { accountName: string; type: AccountType; balance: number; side: "debit" | "credit" }
interface TAccount { accountName: string; debits: LedgerLineView[]; credits: LedgerLineView[]; balance: number; balanceSide: "debit" | "credit" }
```

## 3. `accounting/accounts.ts` (PRD §10)

- `CASH_BASIS_ACCOUNTS` and `ACCRUAL_EXTRA_ACCOUNTS` exactly as listed in PRD §10.1/§10.2; `ACCRUAL_BASIS_ACCOUNTS = [...cash, ...extra]`.
- `getChartOfAccounts(difficulty: Difficulty)` returns the right list.
- `isAccountInMode(accountName, difficulty)` — used by validation rule 5 (PRD §17.2).

## 4. `accounting/normalBalances.ts` (PRD §21.2)

```ts
getNormalBalance(type: AccountType): "debit" | "credit"
// asset, expense -> debit; liability, equity, revenue -> credit
```

## 5. `accounting/journal.ts` (PRD §21.1, §21.3)

Pure functions over in-memory data (persistence is Phase 2's job):

- `postJournalEntry(entry, lines)` — asserts total debits === total credits (>0), returns the posted lines. Throws on imbalance; the engine never posts unbalanced entries.
- `calculateAccountBalance(account, allLines)` — debit-normal: `debits - credits`; credit-normal: `credits - debits`.
- `buildTAccounts(accounts, entries, lines, filter?)` — produces the `TAccount[]` view for PRD §16, with optional filters (year, account type, single account). Each side's line items carry the counter-account name so the UI can render "Owner Capital 1500" on Cash's debit side like the PRD example.

## 6. `accounting/entryRules.ts` (PRD §22)

The rule library mapping game events to expected entries. One exported function per transaction type, all returning `ExpectedEntry[]` (one element per affected team):

| Function | Entries (per PRD sections) |
| --- | --- |
| `propertyAssignedAtSetup` | Dr Property / Cr Owner Capital (§7.2) |
| `propertyPurchase` | Dr Property / Cr Cash (§23) |
| `rentPaidCash` | payer: Dr Rent Expense / Cr Cash; owner: Dr Cash / Cr Rent Revenue (§9.2) |
| `rentPaidCredit` | payer: Dr Rent Expense / Cr Accounts Payable; owner: Dr Accounts Receivable / Cr Rent Revenue |
| `rentPaidCreditLine` | payer: Dr Rent Expense / Cr Credit Line Payable; owner: Dr Cash / Cr Rent Revenue |
| `cashEventRevenue` | Dr Cash / Cr Event Revenue |
| `cashEventExpense` | Dr <expense account from card> / Cr Cash |
| `ownerCapitalContribution` | Dr Cash / Cr Owner Capital (§11.1 Inherit/Investor cards) |
| `repairPaidCash` | Dr Repair Expense / Cr Cash |
| `repairBillPayable` | Dr Repair Expense / Cr Accounts Payable |
| `expensePayable` | generic Dr <expense> / Cr Accounts Payable (charity pledge, road closure fee) |
| `revenueReceivable` | Dr Accounts Receivable / Cr <revenue> (conference collect-later) |
| `prepaidPurchase` | Dr Prepaid Services / Cr Cash (internet, maintenance, software) |
| `prepaidRecognition` | Dr <Internet/Maintenance Expense> / Cr Prepaid Services (year-end) |
| `loanTaken` | Dr Cash / Cr Loan Payable |
| `loanPrincipalRepaid` | Dr Loan Payable / Cr Cash |
| `interestPaidCash` | Dr Interest Expense / Cr Cash |
| `interestAddedToLoan` | Dr Interest Expense / Cr Loan Payable (§13.3 insufficient cash) |
| `apPaidCash` | debtor: Dr A/P / Cr Cash; creditor: Dr Cash / Cr A/R (§12.3) |
| `apRolledToLoan` | debtor: Dr A/P / Cr Loan Payable; creditor: Dr Cash / Cr A/R (§12.3) |
| `multiTeamEventPay` / `multiTeamEventCollect` | Neighborhood Promotion / Local Festival cards (§11.1): payer uses total, each counterparty uses per-team amount |

Each `ExpectedEntry` carries a `description` string reused as the transaction card text and the "correct" feedback explanation.

## 7. `accounting/validation.ts` (PRD §17)

- `validateJournalEntry(input: {debitAccount, creditAccount, amount}, expected: ExpectedEntry, difficulty): ValidationResult` implementing all five checks in §17.2 (debit account, credit account, amount, same-account, account-available-in-mode). MVP expected entries always have exactly one debit and one credit line, matching the single-dropdown form (§17.1).
- `getHint(expected: ExpectedEntry, level: 1|2|3|4): string` — the four hint levels of §17.4: (1) statement effect, (2) account types and directions, (3) debit/credit rule, (4) full answer. Derive hints from account types + `getNormalBalance` so they work for every rule without per-card hint text.
- Feedback strings per §17.3: correct → affirmation + the entry's description rationale; incorrect → generic nudge about cash direction and element type.

## 8. `accounting/statements.ts` (PRD §15, §21.1)

All functions take `(accounts, journalLines, period?)` and return plain data objects:

- `generateIncomeStatement` — revenue lines, expense lines, `netIncome` (§15.1). Accrual-only accounts appear only when they have activity.
- `generateBalanceSheet` — asset/liability/equity sections, `totalAssets`, `totalLiabilitiesAndEquity`, and `balances: boolean` flag (§15.2). Include current-period net income inside equity so the sheet balances before closing entries.
- `generateCashSummary` — beginning cash, inflows, outflows, ending cash, computed purely from Cash-account journal lines (§15.3). Skip operating/investing/financing classification (optional in PRD).
- `generateARAPSchedule(creditBalances, teams)` — rows of `{type: "receivable"|"payable", otherTeam, amount, source, status}` (§15.4). Driven by `CreditBalance` records, not journal lines, so it shows who-owes-whom.

## 9. Game data modules (`game/`)

Data-driven per PRD §30.4 — needed now so Phase 1 tests can reference real board/card data:

- `game/boardPresets.ts` — the 24-space "simple" board of §8.1 as `BoardSpace[]` plus a parallel property definition list (`name, purchasePrice, rent`) for the 11 property spaces (A–K). Pick round numbers scaled like Monopoly (e.g. price 100–350 stepping up around the board, rent = ~20% of price).
- `game/eventCards.ts` — both decks as data objects with `{id, mode, title, description, amount, eventType, accounts, yearEndFollowUp?}` covering every card in §11.1 and §11.2, including per-team cards (promotion/festival) and cards with year-end follow-ups (A/R collect, A/P pay, prepaid recognition).
- `game/rules.ts` — pure helpers: `calculateInterestCharge(loanBalance)` (`ceil(balance * 0.01)`, min 10 when balance > 0, §13.3), `canTakeCredit(currentAP, amount, creditLimit)` (§12.2), default game settings object (§7.1).

## 10. Tests (PRD §27.1, §32)

Colocated `*.test.ts` in `packages/shared/src`:

1. `normalBalances.test.ts` — all five account types.
2. `journal.test.ts` — balanced posting, imbalance rejection, balance calc for both normal sides, T-account construction.
3. `entryRules.test.ts` — expected entries for rent cash/credit/credit-line, prepaid, interest (cash and rolled-to-loan), A/P settlement both options, multi-team cards.
4. `validation.test.ts` — each of the five §17.2 failure modes plus success; hint text at all four levels.
5. `statements.test.ts` — income statement, balance sheet balances flag, cash summary, A/R-A/P schedule.
6. `scenarioA.test.ts` — the PRD §32 cash-basis walkthrough asserting the exact expected balances: Cash 1350? (compute: 1500 +100 −80 −150 +500 −20 = 1850), Property 200, Loan 500, Rent Revenue 100, Rent Expense 80, Repair 150, Interest 20, balance sheet balances, net income = 100 − 250 = −150.
7. `scenarioB.test.ts` — the accrual walkthrough: A/R, A/P, Prepaid all clear to 0 after year-end; Event Revenue 250, Repair 150, Internet 120; cash reflects actual movements; balance sheet balances.

## Acceptance (PRD §26.1)

- `pnpm test` green: debits equal credits everywhere, balances correct, income statement and balance sheet correct, T-account view data correct.
- `packages/shared` imports nothing from React, Express, or Node-only APIs (keep it isomorphic — the client will import it in later phases).
