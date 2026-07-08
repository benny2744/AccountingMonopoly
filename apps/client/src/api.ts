// REST client + shared types matching the server's response shapes.
import type { AccountType } from "@amono/shared";
import { getLocale } from "@amono/shared/i18n";
import { translateServerError } from "./i18n/error.js";

export interface GameSettings {
  propertyAllocationRatio: number;
  startingCash: number;
  startingLoanLimit: number;
  boardPreset: "classic";
  journalEntryMode: "activeTeamOnly" | "bothTeams" | "autoPostCounterparty";
  allowStudentFullHint?: boolean;
  showScores?: boolean;
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
  kind: "street" | "railroad";
  colorGroup?: string;
  color?: string;
  houseCost?: number;
  houses: number;
}

export interface PendingAction {
  id: string;
  kind: string;
  payload: any;
  expectedEntries: any[];
  status: string;
  attempts: number;
  teamId: string;
  createdAt?: string;
  hintsUsed?: number;
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
  yearEndPendings: PendingAction[];
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
  inflows: { description: string; descriptionParams?: Record<string, unknown>; amount: number }[];
  outflows: { description: string; descriptionParams?: Record<string, unknown>; amount: number }[];
  totalInflows: number;
  totalOutflows: number;
  ending: number;
}
export interface StatementsView {
  income: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashSummary: CashSummary;
}

const SESSION_KEY = "amono.sessionToken";
const TAB_SESSIONS_KEY = "amono.tabSessions";
const TAB_ACTIVE_GAME_KEY = "amono.tabActiveGameId";
const SESSIONS_MAP_KEY = "amono.sessions";
const ACTIVE_GAME_KEY = "amono.activeGameId";
const LEGACY_SESSION_KEY = "amono.sessionToken";
const ADMIN_TOKEN_KEY = "amono.adminToken";

let activeGameId: string | null = null;

function readSessionMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SESSIONS_MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSessionMap(map: Record<string, string>): void {
  localStorage.setItem(SESSIONS_MAP_KEY, JSON.stringify(map));
}

function readTabSessionMap(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(TAB_SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeTabSessionMap(map: Record<string, string>): void {
  sessionStorage.setItem(TAB_SESSIONS_KEY, JSON.stringify(map));
}

export function saveAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/** Set which game's session token REST/socket calls should use (per tab). */
export function setActiveGameId(gameId: string | null): void {
  activeGameId = gameId;
  if (gameId) {
    localStorage.setItem(ACTIVE_GAME_KEY, gameId);
    sessionStorage.setItem(TAB_ACTIVE_GAME_KEY, gameId);
    const tabMap = readTabSessionMap();
    if (tabMap[gameId]) {
      sessionStorage.setItem(SESSION_KEY, tabMap[gameId]!);
    } else {
      const fromMap = readSessionMap()[gameId];
      if (fromMap) {
        tabMap[gameId] = fromMap;
        writeTabSessionMap(tabMap);
        sessionStorage.setItem(SESSION_KEY, fromMap);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  } else {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    sessionStorage.removeItem(TAB_ACTIVE_GAME_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }
}

export function getActiveGameId(): string | null {
  return (
    activeGameId ??
    sessionStorage.getItem(TAB_ACTIVE_GAME_KEY) ??
    localStorage.getItem(ACTIVE_GAME_KEY)
  );
}

function getSessionToken(): string | null {
  const gid = getActiveGameId();
  if (gid) {
    const tabMap = readTabSessionMap();
    if (tabMap[gid]) return tabMap[gid]!;
    const fromMap = readSessionMap()[gid];
    if (fromMap) {
      tabMap[gid] = fromMap;
      writeTabSessionMap(tabMap);
      sessionStorage.setItem(SESSION_KEY, fromMap);
      return fromMap;
    }
  }
  return sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(LEGACY_SESSION_KEY);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const adminToken = getAdminToken();
  const r = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const code = data?.error?.code as string | undefined;
    const params = data?.error?.params as Record<string, unknown> | undefined;
    const fallback = data?.error?.message ?? `HTTP ${r.status}`;
    const err = new Error(code ? translateServerError(code, fallback, params) : fallback) as Error & {
      status?: number;
      code?: string;
      params?: Record<string, unknown>;
    };
    err.status = r.status;
    err.code = code;
    err.params = params;
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
  adminLogin: (username: string, password: string) =>
    req<{ adminToken: string }>("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  adminVerify: () => req<{ ok: boolean }>("/admin/verify"),

  createGame: (input: {
    difficulty: "cash" | "accrual";
    numberOfTeams: number;
    propertyAllocationRatio: number;
    startingCash: number;
    startingLoanLimit: number;
  }) => req<{ game: Game; sessionToken: string }>("/games", { method: "POST", body: JSON.stringify(input) }),

  lookupRoom: (roomCode: string) =>
    req<RoomLookup>(`/games/by-code/${roomCode.toUpperCase()}`),

  lanInfo: () => req<LanInfo>("/games/meta/lan-info"),

  teacherJoin: (roomCode: string) =>
    req<{ sessionToken: string; gameId: string }>(`/games/by-code/${roomCode.toUpperCase()}/teacher-join`, {
      method: "POST",
      body: "{}",
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

  startGame: (gameId: string, override?: boolean) =>
    req<GameState>(`/games/${gameId}/start`, {
      method: "POST",
      body: JSON.stringify({ override: override ?? false }),
    }),

  roll: (gameId: string, teamId: string) =>
    req<{ result: any; state: GameState }>(`/games/${gameId}/roll`, {
      method: "POST",
      body: JSON.stringify({ teamId }),
    }),

  buildHouse: (gameId: string, teamId: string, propertyId: string) =>
    req<{ state: GameState }>(`/games/${gameId}/build-house`, {
      method: "POST",
      body: JSON.stringify({ teamId, propertyId }),
    }),

  proposeTrade: (
    gameId: string,
    teamId: string,
    propertyId: string,
    price: number,
    counterpartyTeamId?: string,
  ) =>
    req<{ state: GameState }>(`/games/${gameId}/trade/propose`, {
      method: "POST",
      body: JSON.stringify({ teamId, propertyId, price, counterpartyTeamId }),
    }),

  cancelTrade: (gameId: string, teamId: string) =>
    req<{ state: GameState }>(`/games/${gameId}/trade/cancel`, {
      method: "POST",
      body: JSON.stringify({ teamId }),
    }),

  resolveEvent: (gameId: string, teamId: string, choice: string, amount?: number) =>
    req<{ state: GameState }>(`/games/${gameId}/resolve-event`, {
      method: "POST",
      body: JSON.stringify({ teamId, choice, amount }),
    }),

  submitJournal: (
    gameId: string,
    teamId: string,
    debitAccount: string,
    creditAccount: string,
    amount: number,
  ) =>
    req<{
      result: {
        correct: boolean;
        feedback: string;
        errors: string[];
        attempts: number;
        balanceChanges?: { accountName: string; before: number; after: number }[];
        chainedTo?: string;
        chainedToName?: string;
      };
      state: GameState;
    }>(
      `/games/${gameId}/submit-journal-entry`,
      { method: "POST", body: JSON.stringify({ teamId, debitAccount, creditAccount, amount }) },
    ),

  submitJournalLines: (
    gameId: string,
    teamId: string,
    lines: Array<{ accountName: string; debit: number; credit: number }>,
  ) =>
    req<{
      result: {
        correct: boolean;
        feedback: string;
        errors: string[];
        attempts: number;
        balanceChanges?: { accountName: string; before: number; after: number }[];
        chainedTo?: string;
        chainedToName?: string;
      };
      state: GameState;
    }>(
      `/games/${gameId}/submit-journal-entry`,
      { method: "POST", body: JSON.stringify({ teamId, lines }) },
    ),

  endTurn: (gameId: string) => req<{ state: GameState }>(`/games/${gameId}/end-turn`, { method: "POST", body: "{}" }),

  pause: (gameId: string) => req<GameState>(`/games/${gameId}/pause`, { method: "POST", body: "{}" }),
  resume: (gameId: string) => req<GameState>(`/games/${gameId}/resume`, { method: "POST", body: "{}" }),
  forceNextTurn: (gameId: string) => req<GameState>(`/games/${gameId}/force-next-turn`, { method: "POST", body: "{}" }),
  revealAnswer: (gameId: string) =>
    req<{ state: GameState }>(`/games/${gameId}/reveal-answer`, { method: "POST", body: "{}" }),

  // Phase 4
  loanForFee: (gameId: string, teamId: string, amount: number) =>
    req<{ state: GameState }>(`/games/${gameId}/loan-for-fee`, {
      method: "POST",
      body: JSON.stringify({ teamId, amount }),
    }),
  startYearEnd: (gameId: string, teamId: string) =>
    req<{ state: GameState }>(`/games/${gameId}/year-end/start`, {
      method: "POST",
      body: JSON.stringify({ teamId }),
    }),
  resolveYearEndStep: (gameId: string, teamId: string, choice: "pay_cash" | "roll_to_loan" | "continue") =>
    req<{ state: GameState }>(`/games/${gameId}/year-end/resolve-step`, {
      method: "POST",
      body: JSON.stringify({ teamId, choice }),
    }),
  setCreditLimit: (gameId: string, teamId: string, creditLimit: number) =>
    req<GameState>(`/games/${gameId}/credit-limit`, {
      method: "POST",
      body: JSON.stringify({ teamId, creditLimit }),
    }),
  arapSchedule: (gameId: string, teamId: string) =>
    req<{ rows: { type: "receivable" | "payable"; otherTeam: string | null; amount: number; source: string; status: string }[] }>(
      `/games/${gameId}/teams/${teamId}/arap`,
    ),

  // Phase 5
  hint: (gameId: string, level: number) =>
    req<{ level: number; text: string; hintsUsed: number; gated: boolean }>(`/games/${gameId}/hint`, {
      method: "POST",
      body: JSON.stringify({ level }),
    }),
  endGame: (gameId: string) => req<GameState>(`/games/${gameId}/end`, { method: "POST", body: "{}" }),
  cloneGame: (gameId: string) =>
    req<{ game: Game; sessionToken: string }>(`/games/${gameId}/clone`, {
      method: "POST",
      body: "{}",
    }),
  scores: (gameId: string) =>
    req<{
      scores: {
        teamId: string;
        name: string;
        color: string;
        score: number;
        yearSnapshots: { year: number; score: number; cumulative: number }[];
      }[];
    }>(`/games/${gameId}/scores`),
  exportUrl: (gameId: string, format: "json" | "csv") => `/api/games/${gameId}/export?format=${format}${format === "csv" ? `&lang=${getLocale()}` : ""}`,

  // Team management (lobby-only add/remove)
  addTeam: (gameId: string) => req<{ team: Team }>(`/games/${gameId}/teams`, { method: "POST", body: "{}" }),
  removeTeam: (gameId: string, teamId: string) =>
    req<{ ok: boolean }>(`/games/${gameId}/teams/${teamId}`, { method: "DELETE" }),

  ledger: (gameId: string, teamId: string) =>
    req<{ accounts: any[]; tAccounts: TAccountRow[]; balances: any[] }>(`/games/${gameId}/teams/${teamId}/ledger`),

  statements: (gameId: string, teamId: string, year?: number) =>
    req<StatementsView>(
      `/games/${gameId}/teams/${teamId}/statements${year != null ? `?year=${year}` : ""}`,
    ),
};

export function saveSession(token: string, gameId?: string): void {
  const gid = gameId ?? getActiveGameId();
  sessionStorage.setItem(SESSION_KEY, token);
  if (gid) {
    const tabMap = readTabSessionMap();
    tabMap[gid] = token;
    writeTabSessionMap(tabMap);
    setActiveGameId(gid);
    const map = readSessionMap();
    map[gid] = token;
    writeSessionMap(map);
  }
  localStorage.removeItem(LEGACY_SESSION_KEY);
}
export function clearSession(gameId?: string): void {
  const gid = gameId ?? getActiveGameId();
  if (gid) {
    const tabMap = readTabSessionMap();
    delete tabMap[gid];
    writeTabSessionMap(tabMap);
    const map = readSessionMap();
    delete map[gid];
    writeSessionMap(map);
  }
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
}
export function getStoredSessionToken(): string | null {
  return getSessionToken();
}
