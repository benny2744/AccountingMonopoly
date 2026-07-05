import type { Account, BoardSpace, CreditBalance, Game, GameEvent, JournalEntryLine, Property, Team } from "@amono/shared";
import { accounting } from "@amono/shared";
import { queries } from "../db/queries.js";
import { balancesFor } from "./accountingService.js";

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
  game: Game;
  teams: TeamView[];
  spaces: BoardSpace[];
  properties: Property[];
  pending: {
    kind: string;
    payload: unknown;
    expectedEntries: unknown[];
    status: string;
    attempts: number;
    teamId: string;
  } | null;
  events: GameEvent[];
  creditBalances: CreditBalance[];
}

export function getGameState(gameId: string): GameState {
  const game = queries.gameById(gameId);
  if (!game) throw new Error("Game not found");
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

  return {
    game,
    teams: teamViews,
    spaces: queries.spacesByGame(gameId),
    properties: props,
    pending: pending
      ? {
          kind: pending.kind,
          payload: pending.payload,
          expectedEntries: pending.expectedEntries as unknown[],
          status: pending.status,
          attempts: pending.attempts,
          teamId: pending.teamId,
        }
      : null,
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

export function statementsView(teamId: string): StatementsView {
  const accounts = queries.accountsByTeam(teamId);
  const entries = queries.entriesByTeam(teamId);
  const lines: JournalEntryLine[] = queries.linesForTeam(teamId);
  return {
    income: accounting.generateIncomeStatement(accounts, lines),
    balanceSheet: accounting.generateBalanceSheet(accounts, lines),
    cashSummary: accounting.generateCashSummary(accounts, lines, entries, 0),
  };
}
