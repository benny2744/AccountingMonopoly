import type {
  Account,
  BoardSpace,
  CreditBalance,
  Game,
  GameEvent,
  GameSettings,
  JournalEntry,
  JournalEntryLine,
  Property,
  Team,
  TurnPhase,
} from "@amono/shared";
import { getDb } from "./client.js";

// ---- Row types (snake_case from SQL) ----
interface GameRow {
  id: string;
  room_code: string;
  teacher_pin_hash: string;
  difficulty: string;
  status: string;
  current_team_id: string | null;
  current_turn_number: number;
  turn_phase: string;
  settings: string;
  created_at: string;
  updated_at: string;
}
interface TeamRow {
  id: string;
  game_id: string;
  name: string;
  color: string;
  position: number;
  current_year: number;
  credit_limit: number;
  is_active: number;
  join_order: number;
}
interface SpaceRow {
  id: string;
  game_id: string;
  idx: number;
  name: string;
  type: string;
  property_id: string | null;
  deck_type: string | null;
}
interface PropRow {
  id: string;
  game_id: string;
  board_space_id: string;
  name: string;
  purchase_price: number;
  rent: number;
  owner_team_id: string | null;
  is_mortgaged: number;
}
interface AccountRow {
  id: string;
  game_id: string;
  team_id: string;
  name: string;
  type: string;
  normal_balance: string;
}
interface JERow {
  id: string;
  game_id: string;
  team_id: string;
  turn_id: string;
  description: string;
  source_event_id: string;
  created_at: string;
  year: number;
  is_student_submitted: number;
  is_correct: number | null;
  attempt_outcome: string | null;
}
interface LineRow {
  id: string;
  journal_entry_id: string;
  account_id: string;
  account_name: string;
  debit: number;
  credit: number;
}
interface EventRow {
  id: string;
  game_id: string;
  turn_id: string | null;
  type: string;
  payload: string;
  created_at: string;
  seq: number;
}
interface PendingRow {
  id: string;
  game_id: string;
  team_id: string;
  kind: string;
  payload: string;
  expected_entries: string;
  status: string;
  attempts: number;
  created_at: string;
}
interface CBRow {
  id: string;
  game_id: string;
  debtor_team_id: string;
  creditor_team_id: string;
  amount: number;
  source_event_id: string;
  status: string;
  created_at: string;
  settled_at: string | null;
}

const parse = JSON.parse;

export function rowToGame(r: GameRow): Game {
  return {
    id: r.id,
    roomCode: r.room_code,
    teacherPinHash: r.teacher_pin_hash,
    difficulty: r.difficulty as Game["difficulty"],
    status: r.status as Game["status"],
    currentTeamId: r.current_team_id,
    currentTurnNumber: r.current_turn_number,
    turnPhase: r.turn_phase as TurnPhase,
    settings: parse(r.settings) as GameSettings,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToTeam(r: TeamRow): Team {
  return {
    id: r.id,
    gameId: r.game_id,
    name: r.name,
    color: r.color,
    position: r.position,
    currentYear: r.current_year,
    creditLimit: r.credit_limit,
    isActive: r.is_active === 1,
  };
}

export function rowToSpace(r: SpaceRow): BoardSpace {
  return {
    id: r.id,
    index: r.idx,
    name: r.name,
    type: r.type as BoardSpace["type"],
    propertyId: r.property_id ?? undefined,
    deckType: (r.deck_type as "cash" | "accrual") ?? undefined,
  };
}

export function rowToProperty(r: PropRow): Property {
  return {
    id: r.id,
    gameId: r.game_id,
    boardSpaceId: r.board_space_id,
    name: r.name,
    purchasePrice: r.purchase_price,
    rent: r.rent,
    ownerTeamId: r.owner_team_id,
    isMortgaged: r.is_mortgaged === 1,
  };
}

export function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    gameId: r.game_id,
    teamId: r.team_id,
    name: r.name,
    type: r.type as Account["type"],
    normalBalance: r.normal_balance as Account["normalBalance"],
  };
}

export function rowToJE(r: JERow, lines: JournalEntryLine[]): JournalEntry {
  return {
    id: r.id,
    gameId: r.game_id,
    teamId: r.team_id,
    turnId: r.turn_id,
    description: r.description,
    sourceEventId: r.source_event_id,
    createdAt: r.created_at,
    year: r.year,
    isStudentSubmitted: r.is_student_submitted === 1,
    isCorrect: r.is_correct === null ? null : r.is_correct === 1,
    lines,
  };
}

export function rowToLine(r: LineRow): JournalEntryLine {
  return {
    id: r.id,
    journalEntryId: r.journal_entry_id,
    accountId: r.account_id,
    accountName: r.account_name,
    debit: r.debit,
    credit: r.credit,
  };
}

export function rowToEvent(r: EventRow): GameEvent {
  return {
    id: r.id,
    gameId: r.game_id,
    turnId: r.turn_id,
    type: r.type as GameEvent["type"],
    payload: parse(r.payload),
    createdAt: r.created_at,
  };
}

export interface PendingActionRow {
  id: string;
  gameId: string;
  teamId: string;
  kind: string;
  payload: unknown;
  expectedEntries: unknown;
  status: string;
  attempts: number;
  createdAt: string;
}

export function rowToPending(r: PendingRow): PendingActionRow {
  return {
    id: r.id,
    gameId: r.game_id,
    teamId: r.team_id,
    kind: r.kind,
    payload: parse(r.payload),
    expectedEntries: parse(r.expected_entries),
    status: r.status,
    attempts: r.attempts,
    createdAt: r.created_at,
  };
}

export function rowToCB(r: CBRow): CreditBalance {
  return {
    id: r.id,
    gameId: r.game_id,
    debtorTeamId: r.debtor_team_id,
    creditorTeamId: r.creditor_team_id,
    amount: r.amount,
    sourceEventId: r.source_event_id,
    status: r.status as CreditBalance["status"],
    createdAt: r.created_at,
    settledAt: r.settled_at ?? undefined,
  };
}

// ---- Query helpers ----
export const queries = {
  gameById(id: string): Game | null {
    const r = getDb().prepare("SELECT * FROM games WHERE id = ?").get(id) as GameRow | undefined;
    return r ? rowToGame(r) : null;
  },
  gameByRoomCode(code: string): Game | null {
    const r = getDb().prepare("SELECT * FROM games WHERE room_code = ?").get(code.toUpperCase()) as GameRow | undefined;
    return r ? rowToGame(r) : null;
  },
  teamsByGame(gameId: string): Team[] {
    const rows = getDb().prepare("SELECT * FROM teams WHERE game_id = ? ORDER BY join_order").all(gameId) as TeamRow[];
    return rows.map(rowToTeam);
  },
  spacesByGame(gameId: string): BoardSpace[] {
    const rows = getDb().prepare("SELECT * FROM board_spaces WHERE game_id = ? ORDER BY idx").all(gameId) as SpaceRow[];
    return rows.map(rowToSpace);
  },
  propertiesByGame(gameId: string): Property[] {
    const rows = getDb().prepare("SELECT * FROM properties WHERE game_id = ?").all(gameId) as PropRow[];
    return rows.map(rowToProperty);
  },
  accountsByTeam(teamId: string): Account[] {
    const rows = getDb().prepare("SELECT * FROM accounts WHERE team_id = ?").all(teamId) as AccountRow[];
    return rows.map(rowToAccount);
  },
  accountsByGame(gameId: string): Account[] {
    const rows = getDb().prepare("SELECT * FROM accounts WHERE game_id = ?").all(gameId) as AccountRow[];
    return rows.map(rowToAccount);
  },
  entriesByTeam(teamId: string): JournalEntry[] {
    const rows = getDb().prepare("SELECT * FROM journal_entries WHERE team_id = ? ORDER BY created_at").all(teamId) as JERow[];
    return rows.map((r) => rowToJE(r, this.linesForEntry(r.id)));
  },
  linesForTeam(teamId: string): JournalEntryLine[] {
    const rows = getDb()
      .prepare(
        "SELECT l.* FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id WHERE e.team_id = ?",
      )
      .all(teamId) as LineRow[];
    return rows.map(rowToLine);
  },
  linesForEntry(entryId: string): JournalEntryLine[] {
    const rows = getDb().prepare("SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?").all(entryId) as LineRow[];
    return rows.map(rowToLine);
  },
  eventsByGame(gameId: string, limit = 40): GameEvent[] {
    const rows = getDb()
      .prepare("SELECT * FROM game_events WHERE game_id = ? ORDER BY seq DESC LIMIT ?")
      .all(gameId, limit) as EventRow[];
    return rows.map(rowToEvent);
  },
  pendingByGame(gameId: string): PendingActionRow | null {
    const r = getDb()
      .prepare("SELECT * FROM pending_actions WHERE game_id = ? AND status != 'done' ORDER BY created_at DESC LIMIT 1")
      .get(gameId) as PendingRow | undefined;
    return r ? rowToPending(r) : null;
  },
  creditBalancesByGame(gameId: string): CreditBalance[] {
    const rows = getDb().prepare("SELECT * FROM credit_balances WHERE game_id = ?").all(gameId) as CBRow[];
    return rows.map(rowToCB);
  },
  setTurnPhase(gameId: string, phase: TurnPhase, updatedAt: string): void {
    getDb().prepare("UPDATE games SET turn_phase = ?, updated_at = ? WHERE id = ?").run(phase, updatedAt, gameId);
  },
  accountByTeamAndName(teamId: string, accountName: string): Account | null {
    const r = getDb()
      .prepare("SELECT * FROM accounts WHERE team_id = ? AND name = ?")
      .get(teamId, accountName) as AccountRow | undefined;
    return r ? rowToAccount(r) : null;
  },
};
