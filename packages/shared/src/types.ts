// PRD §18 — single source of truth for game state shapes.

export type Difficulty = "cash" | "accrual";

export type GameStatus = "lobby" | "active" | "paused" | "ended";

/** Tracks where the active team is in roll → resolve → end-turn cycle. */
export type TurnPhase = "awaiting_roll" | "resolving" | "awaiting_end";

export type JournalEntryMode = "activeTeamOnly" | "bothTeams" | "autoPostCounterparty";

export type PropertyAllocationRatio = 0 | 0.25 | 0.5 | 0.75;

export interface GameSettings {
  propertyAllocationRatio: PropertyAllocationRatio;
  startingCash: number;
  startingLoanLimit: number;
  boardPreset: "classic";
  journalEntryMode: JournalEntryMode;
  /** Phase 5: allow students to view the full-answer hint (level 4) themselves. Default false. */
  allowStudentFullHint?: boolean;
  /** Phase 5: show the score-based leaderboard on all dashboards. Default true. */
  showScores?: boolean;
}

export interface Game {
  id: string;
  roomCode: string;
  teacherPinHash: string;
  difficulty: Difficulty;
  status: GameStatus;
  currentTeamId: string | null;
  currentTurnNumber: number;
  turnPhase: TurnPhase;
  createdAt: string;
  updatedAt: string;
  settings: GameSettings;
}

export interface Team {
  id: string;
  gameId: string;
  name: string;
  color: string;
  position: number;
  currentYear: number;
  creditLimit: number;
  isActive: boolean;
  /** Phase 4: set when this team should run the year-end checklist next. */
  pendingYearEnd?: boolean;
}

export type BoardSpaceType =
  | "go"
  | "property"
  | "event"
  | "bank"
  | "rest"
  | "tax";

export interface BoardSpace {
  id: string;
  index: number;
  name: string;
  type: BoardSpaceType;
  propertyId?: string;
  deckType?: "cash" | "accrual";
}

export type PropertyKind = "street" | "railroad";

export interface Property {
  id: string;
  gameId: string;
  boardSpaceId: string;
  name: string;
  purchasePrice: number;
  rent: number;
  ownerTeamId: string | null;
  isMortgaged: boolean;
  kind: PropertyKind;
  colorGroup?: string;
  /** Display color for board UI (hex). */
  color?: string;
  houseCost?: number;
  /** 0–4 houses; 5 represents a hotel. */
  houses: number;
  /** Book value for resale; null in DB means use purchasePrice. */
  costBasis?: number;
}

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type NormalBalance = "debit" | "credit";

export interface Account {
  id: string;
  gameId: string;
  teamId: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  /** Description/label for the counter side of this line (used in T-account views). */
  counterAccountName?: string;
  turnId?: string;
}

export interface JournalEntry {
  id: string;
  gameId: string;
  teamId: string;
  turnId: string;
  description: string;
  descriptionParams?: Record<string, unknown>;
  sourceEventId: string;
  createdAt: string;
  year: number;
  isStudentSubmitted: boolean;
  isCorrect: boolean | null;
  lines: JournalEntryLine[];
}

export type GameEventType =
  | "roll"
  | "move"
  | "land_property"
  | "rent_due"
  | "rent_paid_cash"
  | "rent_paid_credit"
  | "rent_paid_credit_line"
  | "buy_property"
  | "draw_event_card"
  | "event_resolved"
  | "counterparty_pending"
  | "loan_taken"
  | "game_started"
  | "interest_charged"
  | "year_end_started"
  | "year_end_completed"
  | "year_end_ar_collected"
  | "teacher_override"
  | "trade_proposed"
  | "trade_accepted"
  | "trade_declined"
  | "trade_cancelled";

export interface GameEvent {
  id: string;
  gameId: string;
  turnId: string | null;
  type: GameEventType;
  payload: unknown;
  createdAt: string;
}

export interface CreditBalance {
  id: string;
  gameId: string;
  debtorTeamId: string;
  creditorTeamId: string;
  amount: number;
  sourceEventId: string;
  status: "open" | "paid" | "rolled_to_loan";
  createdAt: string;
  settledAt?: string;
}

// ---- Engine-only types (PRD §21, §22) ----

export interface ExpectedEntryLine {
  accountName: string;
  debit: number;
  credit: number;
}

export interface ExpectedEntry {
  teamId: string;
  description: string;
  descriptionParams?: Record<string, string | number>;
  lines: ExpectedEntryLine[];
}

export type ValidationErrorCode =
  | "wrong_debit_account"
  | "wrong_credit_account"
  | "wrong_amount"
  | "same_account"
  | "account_not_in_mode"
  | "unbalanced_entry"
  | "invalid_line"
  | "wrong_line_count";

export interface ValidationResult {
  correct: boolean;
  errors: ValidationErrorCode[];
  feedback: string;
  feedbackKey?: string;
  feedbackParams?: Record<string, string | number>;
}

export interface AccountBalance {
  accountName: string;
  type: AccountType;
  balance: number;
  side: NormalBalance;
}

export interface LedgerLineView {
  journalEntryId: string;
  amount: number;
  counterAccountName: string;
  description: string;
}

export interface TAccount {
  accountName: string;
  type: AccountType;
  debits: LedgerLineView[];
  credits: LedgerLineView[];
  balance: number;
  balanceSide: NormalBalance;
}

// ---- Account catalog definition (PRD §10) ----

export interface AccountDefinition {
  name: string;
  type: AccountType;
}
