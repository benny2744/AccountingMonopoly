# Phase 5 — Classroom Polish

Goal (PRD §26.5): a teacher can run a 40–80 minute session unaided; students understand what to do without developer help; the teacher can recover from any mistake. This phase is UX, feedback, scoring, and export — no new accounting.

Depends on: Phase 4 complete.

## 1. Hints (PRD §17.4)

- Wire the Phase 1 `getHint(expected, level)` into the JournalEntryPanel: a Hint button that steps through levels 1→4 (statement effect → account types → debit/credit direction → full answer), one level per click, levels already used shown as a stack. **Level 2 direction logic is already fixed** in the shared engine (`sideIncreasesBalance` in `packages/shared/src/accounting/validation.ts`) — no engine work needed before wiring UI.
- Level 4 (full answer) is gated by a teacher setting `allowStudentFullHint: boolean` (default false — full answers go through teacher Reveal instead).
- Hint usage is recorded on the pending action (feeds scoring). **Schema task:** add `hints_used INTEGER NOT NULL DEFAULT 0` (or a JSON array of levels shown) on `pending_actions`; increment on each hint click in the journal flow.

## 2. Teacher reveal & recovery polish (PRD §24, §28.2)

- Reveal answer already exists (Phase 3); add a confirmation and a projector-friendly "Answer revealed" card showing the correct entry with a one-line explanation (from the entry rule's description).
- "Stuck team" detection surfaced as a badge with elapsed time on the teacher dashboard team table.
- Game reset: teacher can end a game (`status: "ended"`) and clone its settings into a fresh room in one click ("Play again with same settings").

## 3. Scoring & leaderboard (PRD §25)

- On each year-end snapshot compute:
  `score = netIncome + cashBalance * 0.1 − loanPayable * 0.1 + cleanBooksBonus`
  where cleanBooksBonus per year = +100 if all required entries that year were correct first try, +50 if all correct within one retry, 0 if any teacher reveal was needed.

**Data already collected (Phase 2+):**

- `journal_entries.attempt_outcome` records `first_try`, `retry`, or `system` on each posted entry (`apps/server/src/services/turnService.ts`).
- `pending_actions.attempts` counts wrong journal submissions before success.
- Phase 3 adds `attempt_outcome: "revealed"` for teacher reveal; Phase 5 adds `hints_used` on pending actions (section 1).

- Store per-year and cumulative score in `year_snapshots`.
- Leaderboard component: ranked team cards with score breakdown tooltip. Shown on SharedBoardPage and TeacherDashboard; teacher toggle `showScores` hides it everywhere including student dashboards (PRD §25).

## 4. Export (PRD §19.1 export endpoint, §5.1)

- `GET /api/games/:gameId/export?format=json|csv`:
  - JSON: full event log, all journal entries with lines, per-team year snapshots, final statements — enough to reconstruct the session (event-sourcing payoff, §4.2).
  - CSV: a zip (or multi-section CSV) with `journal_entries.csv` (team, turn, description, debit acct, credit acct, amount, correct-on-attempt), `balances.csv`, `scores.csv` — designed for a teacher to open in Excel and grade participation. **`journal_entry_lines.account_id` already stores real account UUIDs** (Phase 1–2 review fix in `apps/server/src/services/accountingService.ts`), so CSV joins to the accounts table work without ad-hoc name matching.
- Export button on TeacherDashboard, available during and after the game.

## 5. Projector display polish (PRD §5.3, §20.4)

- Big-type pass on SharedBoardPage: current team banner with team color, oversized dice result, event card takeover animation (simple fade/scale only, §28.3 low priority on fancy effects), transaction ticker with plain-language entries, year-end celebration banner, leaderboard panel (respects `showScores`).
- Contrast/legibility check at 1280×720 from the back of a classroom (manual test).

## 6. Student clarity pass (PRD §28.1)

Audit every student-facing state against the §28.1 checklist — students should always know: whose turn, what happened, what to record, which accounts exist, whether they were right, and how it changed their accounts. Concretely:

- Persistent status strip on TeamDashboard: "Your turn — roll!", "Team Blue is rolling…", "Record your journal entry", "Waiting for year-end tasks".
- After a correct entry, show a mini before/after of the two affected T-accounts ("Cash 1350 → 1250") before returning to the board.
- Account dropdowns grouped by type (Assets / Liabilities / Equity / Revenue / Expenses) with normal-balance captions.
- Empty/edge states: disconnected banner with auto-retry, "game paused" overlay, "waiting for players" lobby states.

## 7. README & teacher runbook (PRD §30.5)

Repo-root `README.md`:

- Install (`pnpm install`), dev (`pnpm dev`), classroom run (`pnpm build && pnpm start`), finding the LAN IP, firewall note.
- Creating a room, projecting `/display/:code`, students joining `/join?code=…`.
- Resetting the database (delete `data/game.db`).
- Implemented features vs known limitations (no auctions/houses/trades, single board preset, etc.).

## 8. Optional (only if time remains, PRD marks optional)

- Event card editor: teacher CRUD over a `custom_cards` table merged into the deck at game start. Explicitly optional (§26.5); skip unless everything above is done.

## 9. Final gate

- Full test suite green including §27.3 edge cases end-to-end. **Already done in Phase 2:** negative-cash prevention (`assertNonNegativeCash`, buy/rent pre-checks, integration tests in `apps/server/src/services/game.integration.test.ts`). **Still to verify in later phases:** credit limit, wrong entries (partially covered), override, refresh, reconnect.
- Dry-run a complete 4-team accrual session (scripted manual test, ~30 min) covering: setup with 50% allocation → several rounds with rent on cash and credit → an event card of each timing type → one team's year-end with a loan rollover → export → verify the CSV against on-screen statements.
- Walk the PRD §31 MVP acceptance list (all 21 items) and check each one off in the README.
