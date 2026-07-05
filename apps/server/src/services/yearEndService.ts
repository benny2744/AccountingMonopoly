import type { ExpectedEntry } from "@amono/shared";
import { accounting } from "@amono/shared";
import { getDb } from "../db/client.js";
import { queries, type DeferredSettlementRow, type PendingActionRow } from "../db/queries.js";
import { logEvent } from "./eventLog.js";
import { postEntry, postExpectedAsSystem, balanceOf, balancesFor } from "./accountingService.js";
import { GameError } from "./gameService.js";
import { now, uuid } from "../util/ids.js";

const { apPaidCash, apRolledToLoan, prepaidRecognition, calculateAccountBalance } = accounting;

/**
 * Phase 4 — year-end flow (PRD §14).
 *
 * Each team owns a concurrent `year_end` pending action independent of the
 * turn loop. Steps auto-post as system entries; completion bumps `current_year`.
 */

export type YearEndStep =
  | { kind: "collect_ar"; debitAccount: string; creditAccount: string; amount: number; source: string; deferredId?: string; creditBalanceId?: string }
  | { kind: "settle_ap"; debitAccount: string; amount: number; otherTeamId: string; source: string; creditBalanceId: string; choices: ("pay_cash" | "roll_to_loan")[] }
  | { kind: "recognize_prepaid"; debitAccount: string; amount: number; deferredId: string }
  | { kind: "snapshot_statements" }
  | { kind: "closing_entries" }
  | { kind: "done" };

export interface YearEndPayload {
  currentStep: number;
  steps: YearEndStep[];
}

/** Build the year-end checklist for a team. Pure — does not mutate. */
export function buildYearEndSteps(gameId: string, teamId: string): YearEndStep[] {
  const steps: YearEndStep[] = [];

  for (const d of queries.deferredByTeam(teamId, true)) {
    if (d.kind === "collect_ar") {
      steps.push({
        kind: "collect_ar",
        debitAccount: "Cash",
        creditAccount: d.accountName,
        amount: d.amount,
        source: d.sourceEventId,
        deferredId: d.id,
      });
    }
  }
  for (const cb of queries.creditBalancesByGame(gameId).filter((c) => c.creditorTeamId === teamId && c.status === "open")) {
    steps.push({
      kind: "collect_ar",
      debitAccount: "Cash",
      creditAccount: "Accounts Receivable",
      amount: cb.amount,
      source: cb.sourceEventId,
      creditBalanceId: cb.id,
    });
  }

  for (const cb of queries.creditBalancesByGame(gameId).filter((c) => c.debtorTeamId === teamId && c.status === "open")) {
    steps.push({
      kind: "settle_ap",
      debitAccount: "Accounts Payable",
      amount: cb.amount,
      otherTeamId: cb.creditorTeamId,
      source: cb.sourceEventId,
      creditBalanceId: cb.id,
      choices: ["pay_cash", "roll_to_loan"],
    });
  }

  for (const d of queries.deferredByTeam(teamId, true)) {
    if (d.kind === "recognize_prepaid") {
      steps.push({
        kind: "recognize_prepaid",
        debitAccount: d.counterAccountName ?? "Internet Expense",
        amount: d.amount,
        deferredId: d.id,
      });
    }
  }

  steps.push({ kind: "snapshot_statements" });
  steps.push({ kind: "closing_entries" });
  steps.push({ kind: "done" });
  return steps;
}

/** Create the year_end pending for a team (idempotent). Does not touch turnPhase. */
export function activateYearEnd(gameId: string, teamId: string, turnId: string): void {
  if (queries.yearEndPendingByTeam(teamId)) return;
  const steps = buildYearEndSteps(gameId, teamId);
  const payload: YearEndPayload = { currentStep: 0, steps };
  getDb()
    .prepare(
      `INSERT INTO pending_actions (id, game_id, team_id, kind, payload, expected_entries, status, attempts, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(uuid(), gameId, teamId, "year_end", JSON.stringify(payload), JSON.stringify([]), "awaiting_choice", 0, now());
  logEvent(gameId, turnId, "year_end_started", { teamId, stepCount: steps.length });
}

/** Manual trigger (teacher / team request). */
export function startYearEnd(gameId: string, teamId: string): void {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`);
  const team = queries.teamsByGame(gameId).find((t) => t.id === teamId);
  if (!team) throw new GameError("NOT_FOUND", "Team not found");
  if (queries.yearEndPendingByTeam(teamId)) throw new GameError("YEAR_END_OPEN", "Year-end checklist already open");
  activateYearEnd(gameId, teamId, String(game.currentTurnNumber));
}

export function resolveYearEndStep(
  gameId: string,
  teamId: string,
  choice: "pay_cash" | "roll_to_loan" | "continue",
): { completed: boolean } {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`);
  const pending = queries.yearEndPendingByTeam(teamId);
  if (!pending || pending.kind !== "year_end") throw new GameError("NO_PENDING", "No year-end pending");
  const payload = pending.payload as YearEndPayload;
  const step = payload.steps[payload.currentStep];
  if (!step) throw new GameError("WRONG_STATE", "Year-end already complete");
  const turnId = String(game.currentTurnNumber);
  const team = queries.teamsByGame(gameId).find((t) => t.id === teamId)!;

  switch (step.kind) {
    case "collect_ar": {
      if (step.creditBalanceId) {
        const cb = queries.creditBalancesByGame(gameId).find((c) => c.id === step.creditBalanceId);
        if (!cb) throw new GameError("NOT_FOUND", "Credit balance not found");
        const debtor = queries.teamsByGame(gameId).find((t) => t.id === cb.debtorTeamId)!;
        const expected = apRolledToLoan(cb.debtorTeamId, teamId, step.amount);
        for (const e of expected) {
          const yr = e.teamId === teamId ? team.currentYear : debtor.currentYear;
          postExpectedAsSystem(gameId, e.teamId, turnId, e, yr);
        }
        getDb()
          .prepare("UPDATE credit_balances SET status = 'rolled_to_loan', settled_at = ? WHERE id = ?")
          .run(now(), step.creditBalanceId);
        logEvent(gameId, turnId, "year_end_ar_collected", {
          creditorTeamId: teamId,
          debtorTeamId: cb.debtorTeamId,
          amount: step.amount,
          rolledToLoan: true,
        });
      } else if (step.deferredId) {
        postEntry({
          gameId,
          teamId,
          turnId,
          description: `Year-end: collected $${step.amount} previously recorded as Accounts Receivable.`,
          sourceEventId: `ye-${step.deferredId}`,
          year: team.currentYear,
          isStudentSubmitted: false,
          isCorrect: true,
          attemptOutcome: "system",
          lines: [
            { accountName: "Cash", debit: step.amount, credit: 0 },
            { accountName: "Accounts Receivable", debit: 0, credit: step.amount },
          ],
        });
        queries.markDeferredSettled(step.deferredId, "paid", now());
      }
      break;
    }
    case "settle_ap": {
      if (choice === "continue") {
        throw new GameError("BAD_CHOICE", "Choose pay cash or roll to loan");
      }
      const amount = step.amount;
      const creditorId = step.otherTeamId;
      const creditor = queries.teamsByGame(gameId).find((t) => t.id === creditorId)!;
      let expected: ExpectedEntry[];
      let status: string;
      if (choice === "roll_to_loan") {
        expected = apRolledToLoan(teamId, creditorId, amount);
        status = "rolled_to_loan";
      } else {
        const cash = balanceOf(teamId, "Cash");
        if (cash < amount) {
          expected = apRolledToLoan(teamId, creditorId, amount);
          status = "rolled_to_loan";
        } else {
          expected = apPaidCash(teamId, creditorId, amount);
          status = "paid";
        }
      }
      for (const e of expected) {
        const yr = e.teamId === teamId ? team.currentYear : creditor.currentYear;
        postExpectedAsSystem(gameId, e.teamId, turnId, e, yr);
      }
      getDb().prepare("UPDATE credit_balances SET status = ?, settled_at = ? WHERE id = ?").run(status, now(), step.creditBalanceId);
      break;
    }
    case "recognize_prepaid": {
      postExpectedAsSystem(
        gameId,
        teamId,
        turnId,
        prepaidRecognition(teamId, step.amount, step.debitAccount),
        team.currentYear,
      );
      queries.markDeferredSettled(step.deferredId, "recognized", now());
      break;
    }
    case "snapshot_statements": {
      snapshotStatements(gameId, teamId, team.currentYear);
      break;
    }
    case "closing_entries": {
      postClosingEntries(gameId, teamId, team.currentYear);
      break;
    }
    case "done": {
      finishYearEnd(gameId, teamId, turnId, team.currentYear);
      return { completed: true };
    }
  }

  const nextStep = payload.currentStep + 1;
  const updated: YearEndPayload = { currentStep: nextStep, steps: payload.steps };
  getDb().prepare("UPDATE pending_actions SET payload = ? WHERE id = ?").run(JSON.stringify(updated), pending.id);

  if (payload.steps[nextStep]?.kind === "done") {
    finishYearEnd(gameId, teamId, turnId, team.currentYear);
    return { completed: true };
  }
  return { completed: false };
}

function beginningCashForYear(teamId: string, year: number): number {
  const accounts = queries.accountsByTeam(teamId);
  const cashAcct = accounts.find((a) => a.name === "Cash");
  if (!cashAcct) return 0;
  const entries = queries.entriesByTeam(teamId);
  const priorLines = queries.linesForTeam(teamId).filter((l) => {
    const entry = entries.find((e) => e.id === l.journalEntryId);
    return entry != null && entry.year < year;
  });
  return calculateAccountBalance(cashAcct, priorLines).balance;
}

function snapshotStatements(gameId: string, teamId: string, year: number): void {
  const accounts = queries.accountsByTeam(teamId);
  const entries = queries.entriesByTeam(teamId);
  const lines = queries.linesForTeam(teamId);
  const beginning = beginningCashForYear(teamId, year);
  const statements = {
    income: accounting.generateIncomeStatement(accounts, lines),
    balanceSheet: accounting.generateBalanceSheet(accounts, lines),
    cashSummary: accounting.generateCashSummary(accounts, lines, entries, beginning),
  };
  queries.upsertYearSnapshot(teamId, gameId, year, statements, now());
}

function postClosingEntries(gameId: string, teamId: string, year: number): void {
  const bal = balancesFor(teamId);
  for (const acct of queries.accountsByTeam(teamId)) {
    if (acct.type !== "revenue" && acct.type !== "expense") continue;
    const amount = bal.get(acct.name) ?? 0;
    if (amount === 0) continue;
    const isRev = acct.type === "revenue";
    postEntry({
      gameId,
      teamId,
      turnId: `ye-close-${year}`,
      description: `Year-end close: ${acct.name} → Retained Earnings.`,
      sourceEventId: `ye-close-${acct.name}-${year}`,
      year,
      isStudentSubmitted: false,
      isCorrect: true,
      attemptOutcome: "system",
      lines: isRev
        ? [
            { accountName: acct.name, debit: amount, credit: 0 },
            { accountName: "Retained Earnings", debit: 0, credit: amount },
          ]
        : [
            { accountName: "Retained Earnings", debit: amount, credit: 0 },
            { accountName: acct.name, debit: 0, credit: amount },
          ],
    });
  }
}

function finishYearEnd(gameId: string, teamId: string, turnId: string, year: number): void {
  const pending = queries.yearEndPendingByTeam(teamId);
  if (!pending) return;
  getDb().prepare("UPDATE pending_actions SET status = 'done' WHERE id = ?").run(pending.id);
  getDb().prepare("UPDATE teams SET current_year = current_year + 1 WHERE id = ?").run(teamId);
  logEvent(gameId, turnId, "year_end_completed", { teamId, year });
}

/** Read-only view of the deferred settlements for a team (UI + tests). */
export function deferredForTeam(teamId: string): DeferredSettlementRow[] {
  return queries.deferredByTeam(teamId, false);
}

export function pendingToView(p: PendingActionRow) {
  return {
    kind: p.kind,
    payload: p.payload,
    expectedEntries: p.expectedEntries as unknown[],
    status: p.status,
    attempts: p.attempts,
    teamId: p.teamId,
  };
}
