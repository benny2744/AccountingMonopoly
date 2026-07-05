// REST client + shared types matching the server's response shapes.
import type { AccountType } from "@amono/shared";

export interface GameSettings {
  propertyAllocationRatio: number;
  startingCash: number;
  startingLoanLimit: number;
  boardPreset: "simple";
  journalEntryMode: "activeTeamOnly" | "bothTeams" | "autoPostCounterparty";
}

export interface Game {
  id: string;
  roomCode: string;
  difficulty: "cash" | "accrual";
  status: "lobby" | "active" | "paused" | "ended";
  currentTeamId: string | null;
  currentTurnNumber: number;
  turnPhase: "awaiting_roll" | "resolving" | "awaiting_end";
  settings: GameSettings;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  position: number;
  currentYear: number;
  creditLimit: number;
  isActive: boolean;
}

export interface TeamView {
  team: Team;
  cash: number;
  loanPayable: number;
  propertyCount: number;
  accountsPayable: number;
  accountsReceivable: number;
}

export interface BoardSpace {
  id: string;
  index: number;
  name: string;
  type: string;
  propertyId?: string;
  deckType?: "cash" | "accrual";
}

export interface Property {
  id: string;
  name: string;
  purchasePrice: number;
  rent: number;
  ownerTeamId: string | null;
  isMortgaged: boolean;
}

export interface PendingAction {
  kind: string;
  payload: any;
  expectedEntries: any[];
  status: string;
  attempts: number;
  teamId: string;
}

export interface GameEvent {
  id: string;
  type: string;
  payload: any;
  createdAt: string;
}

export interface GameState {
  game: Game;
  teams: TeamView[];
  spaces: BoardSpace[];
  properties: Property[];
  pending: PendingAction | null;
  events: GameEvent[];
}

export interface TAccountRow {
  accountName: string;
  type: AccountType;
  debits: { amount: number; counterAccountName: string; description: string }[];
  credits: { amount: number; counterAccountName: string; description: string }[];
  balance: number;
  balanceSide: "debit" | "credit";
}

export interface IncomeStatement {
  revenue: { accountName: string; amount: number }[];
  expenses: { accountName: string; amount: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}
export interface BalanceSheet {
  assets: { accountName: string; amount: number }[];
  liabilities: { accountName: string; amount: number }[];
  equity: { accountName: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balances: boolean;
}
export interface CashSummary {
  beginning: number;
  inflows: { description: string; amount: number }[];
  outflows: { description: string; amount: number }[];
  totalInflows: number;
  totalOutflows: number;
  ending: number;
}
export interface StatementsView {
  income: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashSummary: CashSummary;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(data?.error?.message ?? `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  createGame: (input: {
    teacherPin: string;
    difficulty: "cash" | "accrual";
    numberOfTeams: number;
    propertyAllocationRatio: number;
    startingCash: number;
    startingLoanLimit: number;
  }) => req<{ game: Game }>("/games", { method: "POST", body: JSON.stringify(input) }),

  getState: (gameId: string) => req<GameState>(`/games/${gameId}`),

  startGame: (gameId: string, teacherPin: string) =>
    req<GameState>(`/games/${gameId}/start`, { method: "POST", body: JSON.stringify({ teacherPin }) }),

  roll: (gameId: string, teamId: string) =>
    req<{ result: any; state: GameState }>(`/games/${gameId}/roll`, {
      method: "POST",
      body: JSON.stringify({ teamId }),
    }),

  resolveEvent: (gameId: string, teamId: string, choice: string, amount?: number) =>
    req<{ state: GameState }>(`/games/${gameId}/resolve-event`, {
      method: "POST",
      body: JSON.stringify({ teamId, choice, amount }),
    }),

  submitJournal: (gameId: string, teamId: string, debitAccount: string, creditAccount: string, amount: number) =>
    req<{ result: { correct: boolean; feedback: string; errors: string[]; attempts: number }; state: GameState }>(
      `/games/${gameId}/submit-journal-entry`,
      { method: "POST", body: JSON.stringify({ teamId, debitAccount, creditAccount, amount }) },
    ),

  endTurn: (gameId: string) => req<{ state: GameState }>(`/games/${gameId}/end-turn`, { method: "POST", body: "{}" }),

  ledger: (gameId: string, teamId: string) =>
    req<{ accounts: any[]; tAccounts: TAccountRow[]; balances: any[] }>(`/games/${gameId}/teams/${teamId}/ledger`),

  statements: (gameId: string, teamId: string) =>
    req<StatementsView>(`/games/${gameId}/teams/${teamId}/statements`),
};
