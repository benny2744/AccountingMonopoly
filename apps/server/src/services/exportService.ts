import { accounting } from "@amono/shared";
import { queries } from "../db/queries.js";
import { getDb } from "../db/client.js";
import { GameError } from "./gameService.js";

const { calculateAccountBalance } = accounting;

/**
 * Phase 5 §4 — game export. Two formats:
 *
 * - `json`: full event-sourced record (game, teams, board, properties, all
 *   events, all journal entries with lines, per-team year snapshots). Enough
 *   to reconstruct the session.
 * - `csv`: a single multi-section workbook for Excel. Sections separated by
 *   blank lines and a header row each: journal_entries, balances, scores.
 */
export function exportGame(gameId: string, format: "json" | "csv"): string {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  const teams = queries.teamsByGame(gameId);
  const events = getDb().prepare("SELECT * FROM game_events WHERE game_id = ? ORDER BY seq").all(gameId);
  const entries = getDb().prepare("SELECT * FROM journal_entries WHERE game_id = ? ORDER BY created_at").all(gameId) as any[];
  const lineRows = getDb()
    .prepare(
      `SELECT l.*, e.team_id, e.turn_id, e.year, e.description, e.is_student_submitted, e.attempt_outcome
       FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
       WHERE e.game_id = ? ORDER BY e.created_at, l.debit DESC`,
    )
    .all(gameId) as any[];
  const snapshots = queries.yearSnapshotsForGame(gameId);

  if (format === "json") {
    const { teacherPinHash: _pin, ...gamePublic } = game;
    return JSON.stringify(
      {
        game: gamePublic,
        teams,
        spaces: queries.spacesByGame(gameId),
        properties: queries.propertiesByGame(gameId),
        events,
        journalEntries: entries,
        journalEntryLines: lineRows,
        yearSnapshots: snapshots,
      },
      null,
      2,
    );
  }

  // CSV: multi-section workbook.
  const sections: string[] = [];

  // Journal entries section.
  sections.push(
    [
      "section",
      "team",
      "turn",
      "year",
      "description",
      "debit_account",
      "credit_account",
      "amount",
      "is_student_submitted",
      "attempt_outcome",
    ].join(","),
  );
  for (const l of lineRows) {
    const isDebit = l.debit > 0;
    const debitAcct = isDebit ? csvEsc(l.account_name) : "";
    const creditAcct = !isDebit ? csvEsc(l.account_name) : "";
    const amount = isDebit ? l.debit : l.credit;
    if (l.debit === 0 && l.credit === 0) continue;
    // Each entry has at least 2 lines (debit + credit); emit one row per pair
    // by pairing the debit and credit of the same entry on a single row.
    if (!isDebit) continue; // skip credit lines; we emit the pair on the debit row
    const credit = lineRows.find((x) => x.journal_entry_id === l.journal_entry_id && x.credit > 0);
    sections.push(
      [
        "journal_entries",
        teamName(teams, l.team_id),
        csvEsc(l.turn_id),
        l.year,
        csvEsc(l.description),
        debitAcct,
        credit ? csvEsc(credit.account_name) : "",
        amount,
        l.is_student_submitted ? 1 : 0,
        csvEsc(l.attempt_outcome ?? ""),
      ].join(","),
    );
  }

  sections.push(""); // blank line between sections

  // Balances section (per team, current).
  sections.push(["section", "team", "account", "type", "balance"].join(","));
  for (const t of teams) {
    for (const b of ledgerBalances(t.id)) {
      sections.push(["balances", csvEsc(t.name), csvEsc(b.accountName), csvEsc(b.type), b.balance].join(","));
    }
  }

  sections.push("");

  // Scores section.
  sections.push(["section", "team", "year", "score", "cumulative"].join(","));
  for (const s of snapshots) {
    sections.push(["scores", csvEsc(teamName(teams, s.teamId)), s.year, s.score ?? 0, s.cumulativeScore].join(","));
  }

  return sections.join("\n") + "\n";
}

function csvEsc(s: string): string {
  if (s == null) return "";
  const str = String(s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function teamName(teams: { id: string; name: string }[], id: string): string {
  return teams.find((t) => t.id === id)?.name ?? id;
}

function ledgerBalances(teamId: string): { accountName: string; type: string; balance: number }[] {
  const accounts = queries.accountsByTeam(teamId);
  const lines = queries.linesForTeam(teamId);
  return accounts.map((a) => ({
    accountName: a.name,
    type: a.type,
    balance: calculateAccountBalance(a, lines).balance,
  }));
}
