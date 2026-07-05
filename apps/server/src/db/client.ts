import { DatabaseSync } from "./nativeBridge.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

type SqliteDatabase = InstanceType<typeof DatabaseSync>;

let db: SqliteDatabase | null = null;

export function openDb(path = "data/game.db"): SqliteDatabase {
  if (db) return db;
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  db = database;
  return database;
}

export function getDb(): SqliteDatabase {
  if (!db) throw new Error("DB not opened. Call openDb() first.");
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
