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
import { uuid } from "../util/ids.js";

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
  pending_year_end: number;
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
  kind: string;
  color_group: string | null;
  color: string | null;
  house_cost: number | null;
  houses: number;
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
  description_params: string | null;
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
  hints_used: number;
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

interface DeferredRow {
  id: string;
  game_id: string;
  team_id: string;
  kind: string;
  amount: number;
  account_name: string;
  counter_account_name: string | null;
  source_event_id: string;
  status: string;
  created_at: string;
  settled_at: string | null;
}

interface SnapRow {
  id: string;
  game_id: string;
  team_id: string;
  year: number;
  statements: string;
  score: number | null;
  cumulative_score: number | null;
  created_at: string;
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
    pendingYearEnd: r.pending_year_end === 1,
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
    kind: (r.kind ?? "street") as Property["kind"],
    colorGroup: r.color_group ?? undefined,
    color: r.color ?? undefined,
    houseCost: r.house_cost ?? undefined,
    houses: r.houses ?? 0,
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
    descriptionParams: r.description_params ? (JSON.parse(r.description_params) as Record<string, unknown>) : undefined,
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
  hintsUsed: number;
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
    hintsUsed: r.hints_used ?? 0,
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

/** Phase 4: a non-player settlement item owed to/from the bank or other non-team party. */
export type DeferredKind = "collect_ar" | "pay_ap" | "recognize_prepaid";

export interface DeferredSettlementRow {
  id: string;
  gameId: string;
  teamId: string;
  kind: DeferredKind;
  amount: number;
  accountName: string;
  counterAccountName: string | null;
  sourceEventId: string;
  status: string;
  createdAt: string;
  settledAt: string | null;
}

export function rowToDeferred(r: DeferredRow): DeferredSettlementRow {
  return {
    id: r.id,
    gameId: r.game_id,
    teamId: r.team_id,
    kind: r.kind as DeferredKind,
    amount: r.amount,
    accountName: r.account_name,
    counterAccountName: r.counter_account_name,
    sourceEventId: r.source_event_id,
    status: r.status,
    createdAt: r.created_at,
    settledAt: r.settled_at,
  };
}

export interface YearSnapshotRow {
  id: string;
  gameId: string;
  teamId: string;
  year: number;
  statements: unknown;
  score: number | null;
  cumulativeScore: number;
  createdAt: string;
}

export function rowToSnapshot(r: SnapRow): YearSnapshotRow {
  return {
    id: r.id,
    gameId: r.game_id,
    teamId: r.team_id,
    year: r.year,
    statements: JSON.parse(r.statements),
    score: r.score,
    cumulativeScore: r.cumulative_score ?? 0,
    createdAt: r.created_at,
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
    if (rows.length === 0) return [];
    const placeholders = rows.map(() => "?").join(",");
    const lineRows = getDb()
      .prepare(`SELECT * FROM journal_entry_lines WHERE journal_entry_id IN (${placeholders})`)
      .all(...rows.map((r) => r.id)) as LineRow[];
    const linesByEntry = new Map<string, JournalEntryLine[]>();
    for (const lr of lineRows) {
      const list = linesByEntry.get(lr.journal_entry_id) ?? [];
      list.push(rowToLine(lr));
      linesByEntry.set(lr.journal_entry_id, list);
    }
    return rows.map((r) => rowToJE(r, linesByEntry.get(r.id) ?? []));
  },
  /** All journal lines for a game, grouped by team id (one query). */
  linesByTeamForGame(gameId: string): Map<string, JournalEntryLine[]> {
    const rows = getDb()
      .prepare(
        `SELECT l.*, e.team_id AS team_id FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.journal_entry_id
         WHERE e.game_id = ?`,
      )
      .all(gameId) as (LineRow & { team_id: string })[];
    const map = new Map<string, JournalEntryLine[]>();
    for (const row of rows) {
      const { team_id, ...lineRow } = row;
      const list = map.get(team_id) ?? [];
      list.push(rowToLine(lineRow as LineRow));
      map.set(team_id, list);
    }
    return map;
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
      .prepare(
        "SELECT * FROM pending_actions WHERE game_id = ? AND status != 'done' AND kind != 'year_end' ORDER BY created_at DESC LIMIT 1",
      )
      .get(gameId) as PendingRow | undefined;
    return r ? rowToPending(r) : null;
  },
  yearEndPendingByTeam(teamId: string): PendingActionRow | null {
    const r = getDb()
      .prepare("SELECT * FROM pending_actions WHERE team_id = ? AND kind = 'year_end' AND status != 'done' LIMIT 1")
      .get(teamId) as PendingRow | undefined;
    return r ? rowToPending(r) : null;
  },
  yearEndPendingsByGame(gameId: string): PendingActionRow[] {
    const rows = getDb()
      .prepare("SELECT * FROM pending_actions WHERE game_id = ? AND kind = 'year_end' AND status != 'done' ORDER BY created_at")
      .all(gameId) as PendingRow[];
    return rows.map(rowToPending);
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
  // ---- Phase 4: deferred settlements & year snapshots ----
  deferredByTeam(teamId: string, onlyOpen = false): DeferredSettlementRow[] {
    const sql = onlyOpen
      ? "SELECT * FROM deferred_settlements WHERE team_id = ? AND status = 'open' ORDER BY created_at"
      : "SELECT * FROM deferred_settlements WHERE team_id = ? ORDER BY created_at";
    const rows = getDb().prepare(sql).all(teamId) as DeferredRow[];
    return rows.map(rowToDeferred);
  },
  deferredById(id: string): DeferredSettlementRow | null {
    const r = getDb().prepare("SELECT * FROM deferred_settlements WHERE id = ?").get(id) as DeferredRow | undefined;
    return r ? rowToDeferred(r) : null;
  },
  markDeferredSettled(id: string, status: string, settledAt: string): void {
    getDb().prepare("UPDATE deferred_settlements SET status = ?, settled_at = ? WHERE id = ?").run(status, settledAt, id);
  },
  upsertYearSnapshot(teamId: string, gameId: string, year: number, statements: unknown, createdAt: string): void {
    getDb()
      .prepare(
        `INSERT INTO year_snapshots (id, game_id, team_id, year, statements, created_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(team_id, year) DO UPDATE SET statements = excluded.statements, created_at = excluded.created_at`,
      )
      .run(uuid(), gameId, teamId, year, JSON.stringify(statements), createdAt);
  },
  setTeamCreditLimit(teamId: string, limit: number): void {
    getDb().prepare("UPDATE teams SET credit_limit = ? WHERE id = ?").run(limit, teamId);
  },
  incPendingHints(pendingId: string): number {
    getDb().prepare("UPDATE pending_actions SET hints_used = hints_used + 1 WHERE id = ?").run(pendingId);
    const row = getDb().prepare("SELECT hints_used AS h FROM pending_actions WHERE id = ?").get(pendingId) as
      | { h: number }
      | undefined;
    return row?.h ?? 0;
  },
  incrementPropertyHouses(propertyId: string): void {
    getDb().prepare("UPDATE properties SET houses = houses + 1 WHERE id = ?").run(propertyId);
  },
  upsertYearSnapshotWithScore(
    gameId: string,
    teamId: string,
    year: number,
    statements: unknown,
    score: number,
    cumulativeScore: number,
    createdAt: string,
  ): void {
    getDb()
      .prepare(
        `INSERT INTO year_snapshots (id, game_id, team_id, year, statements, score, cumulative_score, created_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(team_id, year) DO UPDATE SET
           statements = excluded.statements,
           score = excluded.score,
           cumulative_score = excluded.cumulative_score,
           created_at = excluded.created_at`,
      )
      .run(uuid(), gameId, teamId, year, JSON.stringify(statements), score, cumulativeScore, createdAt);
  },
  yearSnapshotsForTeam(teamId: string): YearSnapshotRow[] {
    const rows = getDb().prepare("SELECT * FROM year_snapshots WHERE team_id = ? ORDER BY year").all(teamId) as SnapRow[];
    return rows.map(rowToSnapshot);
  },
  yearSnapshotsForGame(gameId: string): YearSnapshotRow[] {
    const rows = getDb()
      .prepare("SELECT s.* FROM year_snapshots s JOIN teams t ON t.id = s.team_id WHERE t.game_id = ? ORDER BY s.team_id, s.year")
      .all(gameId) as SnapRow[];
    return rows.map(rowToSnapshot);
  },
};
