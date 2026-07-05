import { createServer } from "node:http";
import { createApp } from "./app.js";
import { openDb } from "./db/client.js";
import { runMigrations } from "./db/schema.js";

const PORT = Number(process.env.PORT ?? 5000);

openDb(process.env.DB_PATH ?? "data/game.db");
runMigrations();

const app = createApp();
const server = createServer(app);

// Socket.IO wiring is added in Phase 3.
server.listen(PORT, () => {
  console.log(`Accounting Monopoly server listening on http://0.0.0.0:${PORT}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
