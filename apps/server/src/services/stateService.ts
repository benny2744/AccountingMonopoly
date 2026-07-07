import type { Account, BoardSpace, CreditBalance, Game, GameEvent, JournalEntryLine, Property, Team } from "@amono/shared";
import { accounting } from "@amono/shared";
import { queries } from "../db/queries.js";
import { getDb } from "../db/client.js";
import { balancesFor } from "./accountingService.js";
import { GameError } from "./gameService.js";
import {
  beginningCashForYear,
  entriesForCashSummary,
  linesForBalanceSheet,
  linesForCashSummary,
  linesForIncomeStatement,
} from "./statementScope.js";
import { pendingToView } from "./yearEndService.js";

const { calculateAccountBalance } = accounting;

export interface TeamView {
  team: Team;
  cash: number;
  loanPayable: number;
  propertyCount: number;
  accountsPayable: number;
  accountsReceivable: number;
}

export interface GameState {
  game: Omit<Game, "teacherPinHash">;
  teams: TeamView[];
  spaces: BoardSpace[];
  properties: Property[];
  pending: ReturnType<typeof pendingToView> | null;
  yearEndPendings: ReturnType<typeof pendingToView>[];
  events: GameEvent[];
  creditBalances: CreditBalance[];
}

export function getGameState(gameId: string): GameState {
  const game = queries.gameById(gameId);
  if (!game) throw new Error("Game not found");
  const { teacherPinHash: _pin, ...gamePublic } = game;
  const teams = queries.teamsByGame(gameId);
  const props = queries.propertiesByGame(gameId);
  const cbs = queries.creditBalancesByGame(gameId);

  const teamViews: TeamView[] = teams.map((t) => {
    const bal = balancesFor(t.id);
    return {
      team: t,
      cash: bal.get("Cash") ?? 0,
      loanPayable: bal.get("Loan Payable") ?? 0,
      propertyCount: props.filter((p) => p.ownerTeamId === t.id).length,
      accountsPayable: bal.get("Accounts Payable") ?? 0,
      accountsReceivable: bal.get("Accounts Receivable") ?? 0,
    };
  });

  const pending = queries.pendingByGame(gameId);
  const yearEndPendings = queries.yearEndPendingsByGame(gameId);

  return {
    game: gamePublic,
    teams: teamViews,
    spaces: queries.spacesByGame(gameId),
    properties: props,
    pending: pending ? pendingToView(pending) : null,
    yearEndPendings: yearEndPendings.map(pendingToView),
    events: queries.eventsByGame(gameId, 30),
    creditBalances: cbs,
  };
}

export interface LedgerView {
  accounts: Account[];
  tAccounts: ReturnType<typeof accounting.buildTAccounts>;
  balances: { accountName: string; type: string; balance: number }[];
}

export function ledgerView(teamId: string): LedgerView {
  const accounts = queries.accountsByTeam(teamId);
  const entries = queries.entriesByTeam(teamId);
  const lines = queries.linesForTeam(teamId);
  const tAccounts = accounting.buildTAccounts(accounts, entries, lines);
  const balances = accounts.map((a) => ({
    accountName: a.name,
    type: a.type,
    balance: calculateAccountBalance(a, lines).balance,
  }));
  return { accounts, tAccounts, balances };
}

export interface StatementsView {
  income: ReturnType<typeof accounting.generateIncomeStatement>;
  balanceSheet: ReturnType<typeof accounting.generateBalanceSheet>;
  cashSummary: ReturnType<typeof accounting.generateCashSummary>;
}

export function statementsView(teamId: string, year?: number): StatementsView {
  const teamRow = getDb().prepare("SELECT current_year FROM teams WHERE id = ?").get(teamId) as
    | { current_year: number }
    | undefined;
  if (!teamRow) throw new GameError("NOT_FOUND", "Team not found");
  const targetYear = year ?? teamRow.current_year;
  if (!Number.isInteger(targetYear) || targetYear < 1 || targetYear > teamRow.current_year) {
    throw new GameError("VALIDATION", `year must be 1..${teamRow.current_year}`);
  }

  const accounts = queries.accountsByTeam(teamId);
  const incomeLines = linesForIncomeStatement(teamId, targetYear);
  const balanceLines = linesForBalanceSheet(teamId, targetYear);
  const cashEntries = entriesForCashSummary(teamId, targetYear);
  const cashLines = linesForCashSummary(teamId, targetYear);
  const beginning = beginningCashForYear(teamId, targetYear);
  return {
    income: accounting.generateIncomeStatement(accounts, incomeLines),
    balanceSheet: accounting.generateBalanceSheet(accounts, balanceLines),
    cashSummary: accounting.generateCashSummary(accounts, cashLines, cashEntries, beginning),
  };
}
