import { getDb } from "./client.js";

// Hand-written SQL schema (Drizzle was specified in PLAN-02 but is not
// available offline; node:sqlite provides the same synchronous API the plan
// relied on, so the service layer is unaffected).
export function runMigrations(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      room_code TEXT UNIQUE NOT NULL,
      teacher_pin_hash TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      status TEXT NOT NULL,
      current_team_id TEXT,
      current_turn_number INTEGER NOT NULL DEFAULT 0,
      turn_phase TEXT NOT NULL DEFAULT 'awaiting_roll',
      settings TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      current_year INTEGER NOT NULL DEFAULT 1,
      credit_limit INTEGER NOT NULL DEFAULT 500,
      is_active INTEGER NOT NULL DEFAULT 1,
      join_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS board_spaces (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      property_id TEXT,
      deck_type TEXT
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      board_space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      purchase_price INTEGER NOT NULL,
      rent INTEGER NOT NULL,
      owner_team_id TEXT,
      is_mortgaged INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      normal_balance TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      turn_id TEXT NOT NULL,
      description TEXT NOT NULL,
      source_event_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      year INTEGER NOT NULL,
      is_student_submitted INTEGER NOT NULL,
      is_correct INTEGER,
      attempt_outcome TEXT
    );

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      account_name TEXT NOT NULL,
      debit INTEGER NOT NULL,
      credit INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_events (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      turn_id TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      seq INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_actions (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      expected_entries TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_balances (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      debtor_team_id TEXT NOT NULL,
      creditor_team_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      source_event_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      settled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deck_order (
      game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
      deck TEXT NOT NULL,
      pointer INTEGER NOT NULL DEFAULT 0,
      cards TEXT NOT NULL
    );

    -- Indexes for hot per-request queries: event seq lookup, account resolution,
    -- team ledger reads.
    CREATE INDEX IF NOT EXISTS idx_game_events_game_seq ON game_events(game_id, seq);
    CREATE INDEX IF NOT EXISTS idx_accounts_team_name ON accounts(team_id, name);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_team ON journal_entries(team_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);
  `);
  // Backfill turn_phase for databases created before this column existed.
  try {
    db.exec(`ALTER TABLE games ADD COLUMN turn_phase TEXT NOT NULL DEFAULT 'awaiting_roll'`);
  } catch {
    // Column already present.
  }
}
