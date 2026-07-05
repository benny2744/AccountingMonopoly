import express from "express";
import { gamesRouter, errorHandler } from "./routes/games.js";

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/games", gamesRouter);

  app.use(errorHandler);
  return app;
}
