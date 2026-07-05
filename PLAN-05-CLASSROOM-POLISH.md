# Phase 5 — Classroom Polish

**Status: shipped** (including review fixes). Hints, scoring, export, projector
polish, student clarity pass, teacher recovery, README §31 checklist, and
13 integration tests. See [CHANGELOG.md](CHANGELOG.md) for the full list.

Goal (PRD §26.5): a teacher can run a 40–80 minute session unaided; students understand what to do without developer help; the teacher can recover from any mistake. This phase is UX, feedback, scoring, and export — no new accounting.

Depends on: Phase 4 complete (shipped, including review fixes — see PLAN-04 "Accepted deviations"). Two Phase 4 outcomes matter throughout this phase:

- **Year-end is per-team and concurrent**: open checklists live in `yearEndPendings[]` (game state), independent of the turn loop. Status copy, projector banners, and scoring hooks must not assume year-end blocks the game.
- **Auto-posted system entries**: interest, year-end steps, closing entries, and counterparty auto-posts carry `attempt_outcome: "system"` / `is_student_submitted = 0`. Scoring and export must distinguish these from student work.

## 1. Hints (PRD §17.4)

- Wire the Phase 1 `getHint(expected, level)` into the JournalEntryPanel: a Hint button that steps through levels 1→4 (statement effect → account types → debit/credit direction → full answer), one level per click, levels already used shown as a stack. **Level 2 direction logic is already fixed** in the shared engine (`sideIncreasesBalance` in `packages/shared/src/accounting/validation.ts`, covered by `validation.test.ts`) — no engine work needed before wiring UI.
- Level 4 (full answer) is gated by a teacher setting `allowStudentFullHint: boolean` (default false — full answers go through teacher Reveal instead). **Schema/settings task:** `GameSettings` currently has `{propertyAllocationRatio, startingCash, startingLoanLimit, boardPreset, journalEntryMode}` — add the new flag in `packages/shared/src/types.ts`, `DEFAULT_GAME_SETTINGS` (`packages/shared/src/game/rules.ts`), the client `GameSettings` mirror in `apps/client/src/api.ts`, and the create-game Zod schema.
- Hint usage is recorded on the pending action (feeds scoring). **Schema task:** add `hints_used INTEGER NOT NULL DEFAULT 0` (or a JSON array of levels shown) on `pending_actions`; increment on each hint click in the journal flow.

## 2. Teacher reveal & recovery polish (PRD §24, §28.2)

- Reveal answer already exists (Phase 3, posts with `attempt_outcome: "revealed"`); add a confirmation and a projector-friendly "Answer revealed" card showing the correct entry with a one-line explanation (from the entry rule's description).
- "Stuck team" detection surfaced as a badge with elapsed time on the teacher dashboard team table (`pending_actions.created_at` gives the start time; no schema change needed).
- Game reset: teacher can end a game (`status: "ended"` exists in `GameStatus` but **no endpoint sets it yet** — add one) and clone its settings into a fresh room in one click ("Play again with same settings").
- Replace the remaining `alert()` error surfaces in `TeacherDashboard` (credit-limit and year-end trigger panels) with the standard toast/error pattern.
- Note: Phase 4 already covers two recovery paths — teacher can trigger/advance any team's year-end checklist (self-or-teacher auth), and `forceNextTurn` skips turn pendings while **preserving open year-end checklists**.

## 3. Scoring & leaderboard (PRD §25)

- On each year-end snapshot compute:
  `score = netIncome + cashBalance * 0.1 − loanPayable * 0.1 + cleanBooksBonus`
  where cleanBooksBonus per year = +100 if all required entries that year were correct first try, +50 if all correct within one retry, 0 if any teacher reveal was needed.
- **Count only student-facing work**: exclude `attempt_outcome = 'system'` when computing the bonus (keep `first_try` / `retry` / `revealed` — note revealed entries post with `is_student_submitted = 0`, so filter on `attempt_outcome`, not that flag). Phase 4 auto-posts many system entries per year: interest, year-end steps, closing entries, counterparty auto-posts.
- Hook point: `snapshotStatements` in `apps/server/src/services/yearEndService.ts` already writes the per-team `year_snapshots` row (with correct beginning cash for year 2+).

**Data already collected (Phase 2+):**

- `journal_entries.attempt_outcome` records `first_try`, `retry`, `revealed`, or `system` on each posted entry.
- `pending_actions.attempts` counts wrong journal submissions before success.
- Phase 5 adds `hints_used` on pending actions (section 1).

- **Schema task:** `year_snapshots` currently stores `{id, game_id, team_id, year, statements JSON}` with `UNIQUE(team_id, year)` — add `score` (and cumulative score) columns or fold them into the statements JSON.
- Leaderboard component: ranked team cards with score breakdown tooltip. `DisplayPage` already has a cash-ranked leaderboard — upgrade it to the score formula. Shown on DisplayPage and TeacherDashboard; teacher toggle `showScores` hides it everywhere including student dashboards (PRD §25). **Settings task:** `showScores` does not exist yet — add it alongside `allowStudentFullHint` (section 1).

## 4. Export (PRD §19.1 export endpoint, §5.1)

- `GET /api/games/:gameId/export?format=json|csv` (none exists yet):
  - JSON: full event log, all journal entries with lines, per-team year snapshots, final statements — enough to reconstruct the session (event-sourcing payoff, §4.2).
  - CSV: a zip (or multi-section CSV) with `journal_entries.csv` (team, turn, description, debit acct, credit acct, amount, correct-on-attempt), `balances.csv`, `scores.csv` — designed for a teacher to open in Excel and grade participation. **`journal_entry_lines.account_id` already stores real account UUIDs** (Phase 1–2 review fix in `apps/server/src/services/accountingService.ts`), so CSV joins to the accounts table work without ad-hoc name matching. Include `is_student_submitted` / `attempt_outcome` columns so system entries are distinguishable.
- Export button on TeacherDashboard, available during and after the game.

## 5. Projector display polish (PRD §5.3, §20.4)

The projector page is `apps/client/src/routes/DisplayPage.tsx` (route `/display/:roomCode`). It already has: current-team banner with color, big dice result, last event card highlight, a cash-ranked leaderboard, and a raw event ticker.

- Big-type pass: event card takeover animation (simple fade/scale only, §28.3 low priority on fancy effects), plain-language ticker entries (replace the raw `e.type` labels), year-end celebration banner ("Team Blue completed Year 1 — Net Income $230") driven by the `year_end_completed` event, and a "closing their books" indicator for teams with open checklists (`yearEndPendings`).
- Swap the cash leaderboard for the score-based one (section 3), respecting `showScores`.
- Contrast/legibility check at 1280×720 from the back of a classroom (manual test).

## 6. Student clarity pass (PRD §28.1)

Audit every student-facing state against the §28.1 checklist — students should always know: whose turn, what happened, what to record, which accounts exist, whether they were right, and how it changed their accounts. Already in place from Phases 3–4: "Waiting for Team X…" banner, paused banner, purple "closing their books" banners for other teams' year-ends, account dropdowns grouped by type, live cash-short loan affordance. Remaining:

- Persistent status strip on TeamDashboard: "Your turn — roll!", "Record your journal entry", "Finish your year-end checklist to roll again" (the `YEAR_END_OPEN` state — year-end is concurrent, so the team can act while others play).
- After a correct entry, show a mini before/after of the two affected T-accounts ("Cash 1350 → 1250") before returning to the board.
- Add normal-balance captions to the grouped account dropdowns (grouping already done in `JournalEntryPanel`).
- Empty/edge states: disconnected banner with auto-retry, "game paused" overlay, "waiting for players" lobby states.

## 7. README & teacher runbook (PRD §30.5)

The repo-root `README.md` and `docs/DEPLOYMENT.md` already cover install, dev, classroom/LAN run, room creation, and the display/join URLs (Phases 3–4). Remaining:

- Resetting the database (delete `data/game.db`; path overridable via `DB_PATH`).
- Implemented features vs known limitations (no auctions/houses/trades, single board preset, auto-posted year-end entries, deferred payment-method cards, etc.).
- A root `pnpm dev` / `pnpm start` convenience script if the runbook references one (today only per-package `--filter` dev commands exist).

## 8. Optional (only if time remains, PRD marks optional)

- Event card editor: teacher CRUD over a `custom_cards` table merged into the deck at game start. Explicitly optional (§26.5); skip unless everything above is done.

## 9. Final gate

- Full test suite green including §27.3 edge cases end-to-end. **Already covered:** negative-cash prevention (Phase 2: `assertNonNegativeCash`, buy/rent pre-checks), credit limit + teacher override, accrual-accounts-in-cash-mode rejection, loan-for-fee softlock, year-end concurrency/auth (Phase 4, `apps/server/src/services/accrual.integration.test.ts`, 94 tests total). **Still to verify in this phase:** wrong entries (partially covered), refresh, reconnect.
- Dry-run a complete 4-team accrual session (scripted manual test, ~30 min) covering: setup with 50% allocation → several rounds with rent on cash and credit → an event card of each timing type → one team's year-end with a loan rollover **while other teams keep playing** → export → verify the CSV against on-screen statements.
- Walk the PRD §31 MVP acceptance list (all 21 items) and check each one off in the README.
