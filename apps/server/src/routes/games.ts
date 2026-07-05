import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { z } from "zod";
import { createGame, startGame, GameError } from "../services/gameService.js";
import { endTurn, resolveChoice, roll, submitJournalEntry } from "../services/turnService.js";
import { getGameState, ledgerView, statementsView } from "../services/stateService.js";
import { AccountingError } from "../services/accountingService.js";
import { queries } from "../db/queries.js";
import { accounting, game as gameData } from "@amono/shared";

export const gamesRouter = Router();

const createGameSchema = z.object({
  roomName: z.string().optional(),
  teacherPin: z.string().min(1),
  difficulty: z.enum(["cash", "accrual"]),
  numberOfTeams: z.number().int().min(2).max(8),
  propertyAllocationRatio: z.union([z.literal(0), z.literal(0.25), z.literal(0.5), z.literal(0.75)]),
  startingCash: z.number().int().min(0),
  startingLoanLimit: z.number().int().min(0),
});

gamesRouter.post("/", (req, res, next) => {
  try {
    const input = createGameSchema.parse(req.body);
    const game = createGame(input);
    res.status(201).json({ game, chart: accounting.getChartOfAccounts(game.difficulty) });
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId", (req, res, next) => {
  try {
    res.json(getGameState(req.params.gameId));
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/properties", (req, res, next) => {
  try {
    res.json(queries.propertiesByGame(req.params.gameId));
  } catch (e) {
    next(e);
  }
});

const startSchema = z.object({ teacherPin: z.string() });
gamesRouter.post("/:gameId/start", (req, res, next) => {
  try {
    const { teacherPin } = startSchema.parse(req.body);
    const game = startGame(req.params.gameId, teacherPin);
    res.json(getGameState(game.id));
  } catch (e) {
    next(e);
  }
});

gamesRouter.post("/:gameId/roll", (req, res, next) => {
  try {
    const { teamId } = z.object({ teamId: z.string() }).parse(req.body);
    const result = roll(req.params.gameId, teamId);
    res.json({ result, state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

const resolveSchema = z.object({
  teamId: z.string(),
  choice: z.string(),
  amount: z.number().int().positive().optional(),
});
gamesRouter.post("/:gameId/resolve-event", (req, res, next) => {
  try {
    const input = resolveSchema.parse(req.body);
    resolveChoice(req.params.gameId, input.teamId, input);
    res.json({ state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

const journalSchema = z.object({
  teamId: z.string(),
  debitAccount: z.string(),
  creditAccount: z.string(),
  amount: z.number().int().positive(),
});
gamesRouter.post("/:gameId/submit-journal-entry", (req, res, next) => {
  try {
    const input = journalSchema.parse(req.body);
    const result = submitJournalEntry(req.params.gameId, input.teamId, input);
    res.json({ result, state: getGameState(req.params.gameId) });
  } catch (e) {
    next(e);
  }
});

gamesRouter.post("/:gameId/end-turn", (req, res, next) => {
  try {
    const game = endTurn(req.params.gameId);
    res.json({ state: getGameState(game.id) });
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/teams/:teamId/ledger", (req, res, next) => {
  try {
    res.json(ledgerView(req.params.teamId));
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/teams/:teamId/t-accounts", (req, res, next) => {
  try {
    res.json(ledgerView(req.params.teamId).tAccounts);
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/teams/:teamId/statements", (req, res, next) => {
  try {
    res.json(statementsView(req.params.teamId));
  } catch (e) {
    next(e);
  }
});

gamesRouter.get("/:gameId/deck", (req, res, next) => {
  try {
    const game = queries.gameById(req.params.gameId);
    if (!game) return res.status(404).json({ error: "not found" });
    res.json(gameData.getDeck(game.difficulty));
  } catch (e) {
    next(e);
  }
});

// Zod errors → 400; GameError → its code; otherwise 500.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof GameError || err instanceof AccountingError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: { code: "VALIDATION", message: err.errors.map((e) => e.message).join("; ") } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
}
