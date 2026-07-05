import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gamesRouter, errorHandler } from "./routes/games.js";

const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/games", gamesRouter);

  // Production: serve the built client bundle (Phase 3 §6).
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback: anything else returns index.html so client-side routes
    // like /join, /game/:code, /teacher/:code work on student devices.
    app.get("*", (_req, res) => {
      res.sendFile(resolve(clientDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
