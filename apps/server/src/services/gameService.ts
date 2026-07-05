import type { Game, GameSettings, Property, Team } from "@amono/shared";
import { accounting, game as gameData } from "@amono/shared";
import { getDb } from "../db/client.js";
import { queries } from "../db/queries.js";
import { logEvent } from "./eventLog.js";
import { postEntry } from "./accountingService.js";
import { now, roomCode, sha256, uuid } from "../util/ids.js";
import { countJoinedTeams } from "./sessionsService.js";

const { getChartOfAccounts } = accounting;
const { buildBoardForGame, DEFAULT_GAME_SETTINGS, teamColor, teamName } = gameData;

export interface CreateGameInput {
  roomName?: string;
  teacherPin: string;
  difficulty: "cash" | "accrual";
  numberOfTeams: number;
  propertyAllocationRatio: 0 | 0.25 | 0.5 | 0.75;
  startingCash: number;
  startingLoanLimit: number;
}

export function createGame(input: CreateGameInput): Game {
  const db = getDb();
  const id = uuid();
  const code = uniqueRoomCode();
  const settings: GameSettings = {
    ...DEFAULT_GAME_SETTINGS,
    propertyAllocationRatio: input.propertyAllocationRatio,
    startingCash: input.startingCash,
    startingLoanLimit: input.startingLoanLimit,
  };
  const ts = now();
  db.prepare(
    `INSERT INTO games (id, room_code, teacher_pin_hash, difficulty, status, current_team_id, current_turn_number, settings, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    code,
    sha256(input.teacherPin),
    input.difficulty,
    "lobby",
    null,
    0,
    JSON.stringify(settings),
    ts,
    ts,
  );

  // Seed board + properties.
  const { spaces, properties } = buildBoardForGame(id);
  const insertSpace = db.prepare(
    `INSERT INTO board_spaces (id, game_id, idx, name, type, property_id, deck_type) VALUES (?,?,?,?,?,?,?)`,
  );
  for (const s of spaces) {
    insertSpace.run(s.id, id, s.index, s.name, s.type, s.propertyId ?? null, s.deckType ?? null);
  }
  const insertProp = db.prepare(
    `INSERT INTO properties (id, game_id, board_space_id, name, purchase_price, rent, owner_team_id, is_mortgaged) VALUES (?,?,?,?,?,?,?,?)`,
  );
  for (const p of properties) {
    insertProp.run(p.id, id, p.boardSpaceId, p.name, p.purchasePrice, p.rent, null, 0);
  }

  // Seed teams (not yet "active" until start). Colors/names pre-assigned.
  const insertTeam = db.prepare(
    `INSERT INTO teams (id, game_id, name, color, position, current_year, credit_limit, is_active, join_order) VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  for (let i = 0; i < input.numberOfTeams; i++) {
    insertTeam.run(uuid(), id, teamName(i), teamColor(i), 0, 1, settings.startingLoanLimit, 0, i);
  }

  // Seed shuffled event deck for the chosen mode.
  seedDeck(id, input.difficulty);

  return queries.gameById(id)!;
}

function seedDeck(gameId: string, difficulty: "cash" | "accrual"): void {
  const deck = [...gameData.getDeck(difficulty)].sort(() => Math.random() - 0.5);
  getDb()
    .prepare(`INSERT INTO deck_order (game_id, deck, pointer, cards) VALUES (?,?,?,?)`)
    .run(gameId, difficulty, 0, JSON.stringify(deck.map((c: gameData.EventCardBase) => c.id)));
}

export function drawEventCard(gameId: string, difficulty: "cash" | "accrual"): gameData.EventCardBase {
  const row = getDb().prepare("SELECT * FROM deck_order WHERE game_id = ?").get(gameId) as
    | { pointer: number; cards: string }
    | undefined;
  if (!row) throw new Error("deck not seeded");
  const ids = JSON.parse(row.cards) as string[];
  const cardId = ids[row.pointer % ids.length]!;
  getDb().prepare("UPDATE deck_order SET pointer = pointer + 1 WHERE game_id = ?").run(gameId);
  const all = gameData.getDeck(difficulty);
  return all.find((c) => c.id === cardId)!;
}

function uniqueRoomCode(): string {
  for (let i = 0; i < 20; i++) {
    const code = roomCode();
    const exists = getDb().prepare("SELECT 1 FROM games WHERE room_code = ?").get(code);
    if (!exists) return code;
  }
  return roomCode() + "0";
}

export function startGame(gameId: string, teacherPin: string, opts?: { overrideMinTeams?: boolean }): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "lobby") throw new GameError("INVALID_STATE", "Game already started");
  if (sha256(teacherPin) !== game.teacherPinHash) {
    throw new GameError("INVALID_PIN", "Incorrect teacher PIN");
  }

  const teams = queries.teamsByGame(gameId);
  if (teams.length < 2) throw new GameError("NOT_ENOUGH_TEAMS", "Need at least 2 teams");

  const joinedTeams = countJoinedTeams(gameId);
  if (joinedTeams < 2 && !opts?.overrideMinTeams) {
    throw new GameError("NOT_ENOUGH_JOINED", `Need at least 2 teams with a student joined (${joinedTeams} joined)`);
  }

  const db = getDb();
  db.exec("BEGIN");
  try {
    // Activate teams, set first team current.
    for (const t of teams) {
      db.prepare("UPDATE teams SET is_active = 1 WHERE id = ?").run(t.id);
    }
    db.prepare("UPDATE games SET status = ?, current_team_id = ?, current_turn_number = 1, turn_phase = ?, updated_at = ? WHERE id = ?")
      .run("active", teams[0]!.id, "awaiting_roll", now(), gameId);

    // Seed chart of accounts per team + opening cash entry.
    const coa = getChartOfAccounts(game.difficulty);
    const insertAcct = db.prepare(
      `INSERT INTO accounts (id, game_id, team_id, name, type, normal_balance) VALUES (?,?,?,?,?,?)`,
    );
    for (const t of teams) {
      for (const a of coa) {
        insertAcct.run(
          uuid(),
          gameId,
          t.id,
          a.name,
          a.type,
          a.type === "asset" || a.type === "expense" ? "debit" : "credit",
        );
      }
      // Opening cash entry: Dr Cash / Cr Owner Capital
      postEntry({
        gameId,
        teamId: t.id,
        turnId: "setup",
        description: "Opening cash invested by owner.",
        sourceEventId: "setup-opening",
        year: t.currentYear,
        isStudentSubmitted: false,
        isCorrect: true,
        attemptOutcome: "system",
        lines: [
          { accountName: "Cash", debit: game.settings.startingCash, credit: 0 },
          { accountName: "Owner Capital", debit: 0, credit: game.settings.startingCash },
        ],
      });
    }

    // Property allocation (PRD §7.2).
    allocateProperties(gameId, game, teams);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  logEvent(gameId, null, "game_started", { note: "Game started" });
  return queries.gameById(gameId)!;
}

function allocateProperties(gameId: string, game: Game, teams: Team[]): void {
  const ratio = game.settings.propertyAllocationRatio;
  if (ratio === 0) return;
  const props = queries.propertiesByGame(gameId);
  const count = Math.round(ratio * props.length);
  // Shuffle properties, pick first `count`, round-robin assign.
  const shuffled = [...props].sort(() => Math.random() - 0.5).slice(0, count);
  shuffled.forEach((p, i) => {
    const team = teams[i % teams.length]!;
    assignProperty(gameId, p, team, "setup");
  });
}

export function assignProperty(
  gameId: string,
  property: Property,
  team: Team,
  sourceEventId: string,
): void {
  getDb().prepare("UPDATE properties SET owner_team_id = ? WHERE id = ?").run(team.id, property.id);
  postEntry({
    gameId,
    teamId: team.id,
    turnId: "setup",
    description: `Received ${property.name} at setup; invested as owner capital.`,
    sourceEventId,
    year: team.currentYear,
    isStudentSubmitted: false,
    isCorrect: true,
    attemptOutcome: "system",
    lines: [
      { accountName: "Property", debit: property.purchasePrice, credit: 0 },
      { accountName: "Owner Capital", debit: 0, credit: property.purchasePrice },
    ],
  });
}

export class GameError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "GameError";
  }
}

export function pauseGame(gameId: string): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`);
  getDb().prepare("UPDATE games SET status = ?, updated_at = ? WHERE id = ?").run("paused", now(), gameId);
  logEvent(gameId, null, "teacher_override", { action: "pause" });
  return queries.gameById(gameId)!;
}

export function resumeGame(gameId: string): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "paused") throw new GameError("INVALID_STATE", `Game is ${game.status}`);
  getDb().prepare("UPDATE games SET status = ?, updated_at = ? WHERE id = ?").run("active", now(), gameId);
  logEvent(gameId, null, "teacher_override", { action: "resume" });
  return queries.gameById(gameId)!;
}

/** Teacher forcibly advances the turn (skipping any in-flight action). */
export function forceNextTurn(gameId: string): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active" && game.status !== "paused") {
    throw new GameError("INVALID_STATE", `Game is ${game.status}`);
  }
  // Close any open pending action so endTurn will accept.
  getDb().prepare("UPDATE pending_actions SET status = 'done' WHERE game_id = ? AND status != 'done'").run(gameId);
  const teams = queries.teamsByGame(gameId);
  const idx = teams.findIndex((t) => t.id === game.currentTeamId);
  const next = teams[(idx + 1) % teams.length]!;
  const ts = now();
  getDb()
    .prepare("UPDATE games SET status = 'active', current_team_id = ?, current_turn_number = current_turn_number + 1, turn_phase = ?, updated_at = ? WHERE id = ?")
    .run(next.id, "awaiting_roll", ts, gameId);
  logEvent(gameId, null, "teacher_override", { action: "force_next_turn", fromTeamId: game.currentTeamId, toTeamId: next.id });
  return queries.gameById(gameId)!;
}
