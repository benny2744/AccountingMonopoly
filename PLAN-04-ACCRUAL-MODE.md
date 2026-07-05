# Phase 4 — Accrual Basis Mode

Goal (PRD §26.4): the full accrual feature set — accrual chart of accounts, player-to-player credit, bank credit line, prepaid services, the accrual event deck, and per-team year-end with A/R-A/P settlement and loan rollover.

Depends on: Phase 3 multiplayer. The engine pieces (accrual accounts, entry rules, A/R-A/P schedule generator, accrual deck data) already exist from Phase 1; this phase wires them into gameplay.

## 0. Pre-work — fee/event softlock (PRD §23, §27.3)

The Phase 1–2 review fixes added a hard negative-cash guard in `postEntry` (`assertNonNegativeCash` in `apps/server/src/services/accountingService.ts`). Buy and rent cash choices are pre-checked at resolve time, but **`space_fee` and expense `event_card` pendings go straight to `awaiting_journal`** with no affordability check. If a team cannot afford the fee, a *correct* journal answer throws `INSUFFICIENT_CASH`, the pending stays open, and `turnPhase: "resolving"` blocks both roll and end-turn — a softlock.

**Fix before or at the start of Phase 4:** add the PRD §23 loan-then-pay flow for fees and cash expense event cards — affordability check when creating the pending action (or an inline `take_loan_then_pay` sub-step) so the team can borrow before journaling. This is the natural home for the logic sketched in section 2's rent affordability rules.

## 1. Mode activation

- `difficulty: "accrual"` at room creation seeds each team with `ACCRUAL_BASIS_ACCOUNTS`, selects the accrual event deck (PRD §11), and unlocks credit payment options. Cash-mode games are untouched — validation rule 5 (§17.2) already rejects accrual accounts in cash mode.

## 2. Rent payment method chooser (PRD §9.2)

**Partially done in Phase 2** — the following already ship for accrual games:

- `rent_due` pending action with `choices: ["cash", "player_credit", "credit_line"]` when `difficulty === "accrual"` (`apps/server/src/services/turnService.ts`).
- Choice dispatch to `rentPaidCash` / `rentPaidCredit` / `rentPaidCreditLine` and counterparty auto-post.
- `credit_balances` row inserted for player credit.
- Client three-button rent modal with cash-affordability disabling (`apps/client/src/components/ActionModal.tsx`).

**Remaining for Phase 4:**

When rent is due in accrual mode, the visitor's pending action is already `rent_due` with the three choices above. Finish:

- Modal (richup-style prompt) with live affordability: cash option disabled if cash < rent (offer loan first per §23), player-credit disabled if it would exceed the credit limit (§12.2 `canTakeCredit`), credit line available up to loan limit.
- **Credit line** specifics: no `credit_balances` row — owed to the bank via Credit Line Payable; owner receives cash immediately (bank pays, §9.2). Verify counterparty cash-receipt auto-post matches PRD.
- **Player credit** row shape is already `{debtorTeamId, creditorTeamId, amount, sourceEventId, status: "open"}` (PRD §18.9).

## 3. Credit limit enforcement (PRD §12.2)

- Server computes team A/P exposure as the sum of open `credit_balances` where team is debtor; block new player-credit above `creditLimit`; teacher override can raise a team's limit from the dashboard (logged as `teacher_override`).

## 4. Accrual event deck in play (PRD §11.2)

Card handling extends Phase 2's `event_card` pending action:

- **Collect-later revenue / pay-later expense cards** (conference, repair bill, charity pledge, road closure fee): post the accrual entry now; also create a `credit_balances` row with the **bank as counterparty**? No — these are owed to/from non-player parties, so instead create a row in a new lightweight `deferred_settlements` table `{teamId, kind: "collect_ar" | "pay_ap", amount, accountName, sourceEventId, status}` consumed at year-end. (Player-to-player credit stays in `credit_balances`.)
- **Prepaid cards** (internet, maintenance, software): entry now (`prepaidPurchase`), plus a `deferred_settlements` row `{kind: "recognize_prepaid", expenseAccount}` for year-end recognition. Optional gameplay perks (next rent +$20, next repair −$100) become one-shot team flags in the team row, applied and cleared by `eventService` — nice-to-have; implement only if time allows, they don't affect accounting correctness.
- **Player Rent on Credit / Credit Line Payment cards**: set a one-shot team flag that pre-selects or forces the corresponding payment method on the next qualifying payment.

## 5. Year-end flow (PRD §14) — `yearEndService.ts`

**Trigger:** replace the Phase 2 stub in `roll` that currently bumps `current_year` and logs `year_end_started` when a team **passes GO or lands on a GO space** (board indices 0 and 23). `yearEndService` must intercept both paths, **defer the year bump until checklist completion**, and enqueue year-end instead of incrementing immediately.

Teacher can also trigger for one/all teams (`request_year_end` / dashboard button).

**Interaction with `turnPhase` (shipped):** The year-end checklist is a
**per-team `year_end` pending** excluded from `pendingByGame`. It does not set
`turnPhase = "resolving"` or block other teams. The rolling team finishes their
landing action normally (`awaiting_end`); checklist steps auto-post as system
entries and can be resolved at any time. A team with an open checklist cannot
roll again until it is complete (`YEAR_END_OPEN`). Game state exposes open
checklists via `yearEndPendings[]`.

The team enters this year-end checklist; gameplay for that team pauses until complete (other teams keep playing — year-end is per-team, §14). Checklist steps are generated from open items and **auto-post as system entries** (see accepted deviations below). When a creditor collects player-credit A/R first, the bank-pays model rolls the debtor's A/P to Loan Payable (`rolled_to_loan`).

1. **Collect A/R** — for each open `deferred_settlements` collect item and each open `credit_balances` where team is creditor: `Dr Cash / Cr Accounts Receivable` (`apPaidCash` creditor side).
2. **Settle A/P** — for each open payable, the debtor chooses per item (modal): **pay cash** (`Dr A/P / Cr Cash`) or **roll to loan** (`Dr A/P / Cr Loan Payable`; creditor still gets `Dr Cash / Cr A/R` auto-posted — the bank pays them immediately, §12.3). The negative-cash guard in `postEntry` naturally rejects A/P pay-cash when cash is insufficient; **rolling to loan is the forced fallback** (consistent with PRD §12.3). Both options update `credit_balances.status` to `paid` / `rolled_to_loan`.
3. **Recognize prepaids** — `Dr Internet/Maintenance Expense / Cr Prepaid Services` per open prepaid.
4. **Interest** — charge accrued interest if any is pending (usually already handled per-roll).
5. **Statements** — server generates and snapshots the team's income statement, balance sheet, cash summary, and A/R-A/P schedule into a `year_snapshots` table `{teamId, year, statements JSON, score placeholder}` — the historical record for Phase 5 scoring and export.
6. **Closing entries** — auto-posted system entry closing each revenue/expense account to Retained Earnings (§14.2 step 6). Auto (not student-submitted) to keep classroom pace; the teacher can walk through it on the projector. **Then** bump `current_year` for that team.

Cash-mode year-end (§14.1) is steps 4–6 only, with statements but no A/R-A/P schedule.

Emit `game:year_end_started` / `game:year_end_completed`; the projector shows a "Team Blue completed Year 1 — Net Income $230" banner.

**Accepted deviations (Phase 4 review):**

- Year-end checklist steps **auto-post as system journal entries** (not student-submitted). Student-submitted year-end entries are deferred to a future phase; classroom pace is preserved.
- **`credit_method_modifier` cards** (Player Rent on Credit, Credit Line Payment) are informational no-ops at draw time — they log the card and end the turn without a journal pending. The one-shot payment-method flag that would force the next qualifying payment is **deferred** (same as PRD nice-to-have perks).
- **Per-team year-end concurrency:** each team owns a separate `year_end` pending excluded from the main turn pending slot; other teams keep playing while a team works through their checklist. Year-end activates immediately in `roll()` when passing GO or landing on GO.

## 6. UI additions

- **TeamDashboard**: A/R and A/P summary card in the sidebar (accrual only, PRD §20.5); "A/R & A/P Schedule" tab in Statements (PRD §15.4 table: type, other team, amount, source, status); year-end checklist panel replacing the roll button while active, showing steps with done/pending states.
- **Rent modal**: finish disabled-state tooltips for player-credit limit and loan-first cash path (partial UI exists from Phase 2).
- **TeacherDashboard**: per-team credit exposure column; "Trigger year-end (team / all)" controls; credit-limit override input.
- **Statements screens**: accrual accounts appear in balance sheet sections; income statement includes Internet/Maintenance Expense.

## 7. Tests (PRD §27)

- Engine already covers entries (Phase 1); add service tests:
  - Rent on credit end-to-end: debtor A/P and creditor A/R balances, `credit_balances` row created, schedule endpoint shows both sides.
  - Credit limit exceeded → rejected with error; teacher override raises limit → allowed.
  - Full year-end: seed A/R + A/P + prepaid, run checklist with mixed choices (one A/P cash, one rolled to loan), assert all clearing accounts hit 0, Loan Payable includes the rollover, statements snapshot balances, closing zeroes revenue/expense and rolls into Retained Earnings.
  - Attempt to use accrual accounts in cash mode rejected (§27.3).
  - **Review-fix coverage** (also in `accrual.integration.test.ts`): creditor-first
    year-end clears debtor A/P via loan rollover; GO pass opens checklist same
    turn; per-team concurrency (other teams roll while one team is in checklist);
    `credit_method_modifier` no softlock; `forceNextTurn` past a card leaves no
    orphan deferred row; year-end auth (self/teacher only).

## Acceptance (PRD §26.4)

- Rent can be paid on credit; creditor gets A/R, debtor gets A/P; A/P can be paid or rolled into a loan at year-end; prepaid internet/maintenance adjust at year-end; accrual financial statements balance.
