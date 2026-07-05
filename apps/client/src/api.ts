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
  updatedAt?: string;
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
  const token = localStorage.getItem("amono.sessionToken");
  const r = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const err = new Error(data?.error?.message ?? `HTTP ${r.status}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = r.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data as T;
}

export interface SessionInfo {
  token: string;
  gameId: string;
  role: "teacher" | "team" | "display";
  teamId: string | null;
  displayName: string | null;
}

export interface RoomLookup {
  gameId: string;
  roomCode: string;
  status: Game["status"];
  difficulty: Game["difficulty"];
  settings: Game["settings"];
  joinedTeams: number;
  teams: { id: string; name: string; color: string; joinedCount: number }[];
}

export interface LanInfo {
  lanIps: string[];
  port: number;
}

export const api = {
  createGame: (input: {
    teacherPin: string;
    difficulty: "cash" | "accrual";
    numberOfTeams: number;
    propertyAllocationRatio: number;
    startingCash: number;
    startingLoanLimit: number;
  }) => req<{ game: Game; sessionToken: string }>("/games", { method: "POST", body: JSON.stringify(input) }),

  lookupRoom: (roomCode: string) =>
    req<RoomLookup>(`/games/by-code/${roomCode.toUpperCase()}`),

  lanInfo: () => req<LanInfo>("/games/meta/lan-info"),

  teacherJoin: (roomCode: string, teacherPin: string) =>
    req<{ sessionToken: string; gameId: string }>(`/games/by-code/${roomCode.toUpperCase()}/teacher-join`, {
      method: "POST",
      body: JSON.stringify({ teacherPin }),
    }),

  joinTeam: (gameId: string, teamId: string, displayName?: string) =>
    req<{ sessionToken: string; gameId: string; teamId: string }>(`/games/${gameId}/join`, {
      method: "POST",
      body: JSON.stringify({ teamId, displayName }),
    }),

  joinDisplay: (gameId: string) =>
    req<{ sessionToken: string; gameId: string }>(`/games/${gameId}/display-join`, {
      method: "POST",
      body: "{}",
    }),

  getSession: () => req<{ session: SessionInfo }>("/games/session"),

  getState: (gameId: string) => req<GameState>(`/games/${gameId}`),

  startGame: (gameId: string, teacherPin: string, override?: boolean) =>
    req<GameState>(`/games/${gameId}/start`, {
      method: "POST",
      body: JSON.stringify({ teacherPin, override: override ?? false }),
    }),

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

  pause: (gameId: string) => req<GameState>(`/games/${gameId}/pause`, { method: "POST", body: "{}" }),
  resume: (gameId: string) => req<GameState>(`/games/${gameId}/resume`, { method: "POST", body: "{}" }),
  forceNextTurn: (gameId: string) => req<GameState>(`/games/${gameId}/force-next-turn`, { method: "POST", body: "{}" }),
  revealAnswer: (gameId: string) =>
    req<{ state: GameState }>(`/games/${gameId}/reveal-answer`, { method: "POST", body: "{}" }),

  ledger: (gameId: string, teamId: string) =>
    req<{ accounts: any[]; tAccounts: TAccountRow[]; balances: any[] }>(`/games/${gameId}/teams/${teamId}/ledger`),

  statements: (gameId: string, teamId: string) =>
    req<StatementsView>(`/games/${gameId}/teams/${teamId}/statements`),
};

export function saveSession(token: string): void {
  localStorage.setItem("amono.sessionToken", token);
}
export function clearSession(): void {
  localStorage.removeItem("amono.sessionToken");
}
