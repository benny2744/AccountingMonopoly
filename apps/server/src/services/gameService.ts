import type { ExpectedEntry, Game, GameSettings, Property, Team } from "@amono/shared";
import { accounting, game as gameData } from "@amono/shared";
import { getDb } from "../db/client.js";
import { queries } from "../db/queries.js";
import { logEvent } from "./eventLog.js";
import { postEntry, postExpectedAsSystem } from "./accountingService.js";
import { now, roomCode, sha256, uuid } from "../util/ids.js";
import { countJoinedTeams } from "./sessionsService.js";

const { getChartOfAccounts, propertyAssignedAtSetup } = accounting;
const { buildBoardForGame, DEFAULT_GAME_SETTINGS, teamColor, teamName } = gameData;

export interface CreateGameInput {
  roomName?: string;
  teacherPin: string;
  difficulty: "cash" | "accrual";
  numberOfTeams: number;
  propertyAllocationRatio: 0 | 0.25 | 0.5 | 0.75;
  startingCash: number;
  startingLoanLimit: number;
  allowStudentFullHint?: boolean;
  showScores?: boolean;
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
    ...(input.allowStudentFullHint !== undefined ? { allowStudentFullHint: input.allowStudentFullHint } : {}),
    ...(input.showScores !== undefined ? { showScores: input.showScores } : {}),
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
    `INSERT INTO properties (id, game_id, board_space_id, name, purchase_price, rent, owner_team_id, is_mortgaged, kind, color_group, color, house_cost, houses) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const p of properties) {
    insertProp.run(
      p.id,
      id,
      p.boardSpaceId,
      p.name,
      p.purchasePrice,
      p.rent,
      null,
      0,
      p.kind,
      p.colorGroup ?? null,
      p.color ?? null,
      p.houseCost ?? null,
      p.houses ?? 0,
    );
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
  if (game.status !== "lobby") throw new GameError("GAME_ALREADY_STARTED", "Game already started");
  if (sha256(teacherPin) !== game.teacherPinHash) {
    throw new GameError("INVALID_PIN", "Incorrect teacher PIN");
  }

  const teams = queries.teamsByGame(gameId);
  if (teams.length < 2) throw new GameError("NOT_ENOUGH_TEAMS", "Need at least 2 teams", { min: 2 });

  const joinedTeams = countJoinedTeams(gameId);
  if (joinedTeams < 2 && !opts?.overrideMinTeams) {
    throw new GameError("NOT_ENOUGH_JOINED", `Need at least 2 teams with a student joined (${joinedTeams} joined)`, { joined: joinedTeams });
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
        description: "yearEnd.openingCash",
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
  const expected = propertyAssignedAtSetup(team.id, property.purchasePrice, property.name);
  postEntry({
    gameId,
    teamId: team.id,
    turnId: "setup",
    description: expected.description,
    descriptionParams: expected.descriptionParams,
    sourceEventId,
    year: team.currentYear,
    isStudentSubmitted: false,
    isCorrect: true,
    attemptOutcome: "system",
    lines: expected.lines,
  });
}

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "GameError";
  }
}

/** Max teams per game (matches the create-game Zod ceiling). */
export const MAX_TEAMS = 4;
/** Min teams that must remain in the lobby. */
export const MIN_TEAMS = 2;

/** Lobby-only: add one team slot up to MAX_TEAMS. */
export function addTeam(gameId: string): Team {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "lobby") throw new GameError("INVALID_STATE", "Can only add teams in the lobby");
  const teams = queries.teamsByGame(gameId);
  if (teams.length >= MAX_TEAMS) {
    throw new GameError("TOO_MANY_TEAMS", `Maximum ${MAX_TEAMS} teams`, { max: MAX_TEAMS });
  }
  const maxJoin = getDb()
    .prepare("SELECT COALESCE(MAX(join_order), -1) AS m FROM teams WHERE game_id = ?")
    .get(gameId) as { m: number };
  const nextJoinOrder = maxJoin.m + 1;
  const usedNames = new Set(teams.map((t) => t.name));
  let slotIndex = 0;
  for (let i = 0; i < 8; i++) {
    if (!usedNames.has(teamName(i))) {
      slotIndex = i;
      break;
    }
  }
  const newId = uuid();
  getDb()
    .prepare(
      `INSERT INTO teams (id, game_id, name, color, position, current_year, credit_limit, is_active, join_order) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(newId, gameId, teamName(slotIndex), teamColor(slotIndex), 0, 1, game.settings.startingLoanLimit, 0, nextJoinOrder);
  logEvent(gameId, null, "teacher_override", { action: "add_team", teamName: teamName(slotIndex) });
  return queries.teamsByGame(gameId).find((t) => t.id === newId)!;
}

/** Lobby-only: remove a team slot. Rejects if joined or below MIN_TEAMS. */
export function removeTeam(gameId: string, teamId: string): void {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "lobby") throw new GameError("INVALID_STATE", "Can only remove teams in the lobby");
  const teams = queries.teamsByGame(gameId);
  if (teams.length <= MIN_TEAMS) {
    throw new GameError("TOO_FEW_TEAMS", `Need at least ${MIN_TEAMS} teams`, { min: MIN_TEAMS });
  }
  const team = teams.find((t) => t.id === teamId);
  if (!team) throw new GameError("NOT_FOUND", "Team not found");
  // Block removal if any student has already joined that team.
  const joinedForTeam = getDb()
    .prepare("SELECT COUNT(*) AS c FROM sessions WHERE game_id = ? AND role = 'team' AND team_id = ?")
    .get(gameId, teamId) as { c: number };
  if (joinedForTeam.c > 0) {
    throw new GameError("TEAM_JOINED", "Cannot remove a team that has students joined");
  }
  getDb().prepare("DELETE FROM teams WHERE id = ?").run(teamId);
  logEvent(gameId, null, "teacher_override", { action: "remove_team", teamId });
}

export function endGame(gameId: string): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status === "ended") throw new GameError("GAME_ALREADY_ENDED", "Game already ended");
  getDb().prepare("UPDATE games SET status = ?, updated_at = ? WHERE id = ?").run("ended", now(), gameId);
  logEvent(gameId, null, "teacher_override", { action: "end_game" });
  return queries.gameById(gameId)!;
}

export function pauseGame(gameId: string): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  getDb().prepare("UPDATE games SET status = ?, updated_at = ? WHERE id = ?").run("paused", now(), gameId);
  logEvent(gameId, null, "teacher_override", { action: "pause" });
  return queries.gameById(gameId)!;
}

export function resumeGame(gameId: string): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "paused") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  getDb().prepare("UPDATE games SET status = ?, updated_at = ? WHERE id = ?").run("active", now(), gameId);
  logEvent(gameId, null, "teacher_override", { action: "resume" });
  return queries.gameById(gameId)!;
}

/** Teacher forcibly advances the turn (skipping any in-flight action). */
export function forceNextTurn(gameId: string): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active" && game.status !== "paused") {
    throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  }
  const teams = queries.teamsByGame(gameId);
  const pending = queries.pendingByGame(gameId);
  const autoPostedTeams: string[] = [];
  if (pending?.kind === "counterparty_entry") {
    const expectedEntries = pending.expectedEntries as ExpectedEntry[];
    const turnId = String(game.currentTurnNumber);
    for (const e of expectedEntries) {
      const receiver = teams.find((t) => t.id === e.teamId);
      if (!receiver) continue;
      postExpectedAsSystem(gameId, e.teamId, turnId, e, receiver.currentYear);
      autoPostedTeams.push(e.teamId);
    }
  }
  // Close turn pendings only — year-end checklists stay open per team.
  getDb().prepare("UPDATE pending_actions SET status = 'done' WHERE game_id = ? AND status != 'done' AND kind != 'year_end'").run(gameId);
  const idx = teams.findIndex((t) => t.id === game.currentTeamId);
  const next = teams[(idx + 1) % teams.length]!;
  const ts = now();
  getDb()
    .prepare("UPDATE games SET status = 'active', current_team_id = ?, current_turn_number = current_turn_number + 1, turn_phase = ?, updated_at = ? WHERE id = ?")
    .run(next.id, "awaiting_roll", ts, gameId);
  logEvent(gameId, null, "teacher_override", {
    action: "force_next_turn",
    fromTeamId: game.currentTeamId,
    toTeamId: next.id,
    autoPostedCounterpartyTeams: autoPostedTeams.length > 0 ? autoPostedTeams : undefined,
  });
  return queries.gameById(gameId)!;
}
