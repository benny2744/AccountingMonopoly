import { accounting, i18n, getAccountKey, getTeamNameKey } from "@amono/shared";
import { queries } from "../db/queries.js";
import { getDb } from "../db/client.js";
import { GameError } from "./gameService.js";

const { calculateAccountBalance } = accounting;

type ExportLocale = Extract<i18n.Locale, "en" | "zh-CN">;

function parseParams(raw: unknown): Record<string, string | number> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, string | number>;
    } catch {
      return undefined;
    }
  }
  if (typeof raw === "object") return raw as Record<string, string | number>;
  return undefined;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * Phase 5 §4 — game export. Two formats:
 *
 * - `json`: full event-sourced record (game, teams, board, properties, all
 *   events, all journal entries with lines, per-team year snapshots). Enough
 *   to reconstruct the session.
 * - `csv`: a single multi-section workbook for Excel. Sections separated by
 *   blank lines and a header row each: journal_entries, balances, scores.
 */
export function exportGame(
  gameId: string,
  format: "json" | "csv",
  locale: ExportLocale = "en",
): string {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  const teams = queries.teamsByGame(gameId);
  const events = getDb().prepare("SELECT * FROM game_events WHERE game_id = ? ORDER BY seq").all(gameId);
  const entries = getDb().prepare("SELECT * FROM journal_entries WHERE game_id = ? ORDER BY created_at").all(gameId) as any[];
  const lineRows = getDb()
    .prepare(
      `SELECT l.*, e.team_id, e.turn_id, e.year, e.description, e.description_params, e.is_student_submitted, e.attempt_outcome
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

  const previousLocale = i18n.getLocale();
  i18n.setLocale(locale);
  try {
    const { t, isValidKey } = i18n;

    function translateAccountName(name: string): string {
      return t(getAccountKey(name));
    }

    function translateTeamName(name: string): string {
      return t(getTeamNameKey(name));
    }

    function translateAccountType(type: string): string {
      const key = `accountTypes.${type}` as i18n.I18nKey;
      return isValidKey(key) ? t(key) : type;
    }

    function translateAttemptOutcome(outcome: string | null): string {
      if (!outcome) return "";
      const key = `attemptOutcomes.${outcome}` as i18n.I18nKey;
      return isValidKey(key) ? t(key) : outcome;
    }

    function localizeJournalDescription(description: string, params?: unknown): string {
      if (!isValidKey(description as i18n.I18nKey)) return description;
      return t(description as i18n.I18nKey, parseParams(params));
    }

    // CSV: multi-section workbook.
    const sections: string[] = [];
    const H = (key: string) => t(`export.${key}` as i18n.I18nKey);

    // Journal entries section.
    sections.push(
      [
        H("section"),
        H("team"),
        H("turn"),
        H("year"),
        H("description"),
        H("debitAccount"),
        H("creditAccount"),
        H("amount"),
        H("isStudentSubmitted"),
        H("attemptOutcome"),
      ].join(","),
    );
    for (const l of lineRows) {
      const isDebit = l.debit > 0;
      const amount = isDebit ? l.debit : l.credit;
      if (l.debit === 0 && l.credit === 0) continue;
      // Each entry has at least 2 lines (debit + credit); emit one row per pair
      // by pairing the debit and credit of the same entry on a single row.
      if (!isDebit) continue; // skip credit lines; we emit the pair on the debit row
      const credit = lineRows.find((x) => x.journal_entry_id === l.journal_entry_id && x.credit > 0);
      const entry = entries.find((e) => e.id === l.journal_entry_id);
      sections.push(
        [
          "journal_entries",
          csvEsc(translateTeamName(teamNameById(teams, l.team_id))),
          csvEsc(l.turn_id),
          l.year,
          csvEsc(localizeJournalDescription(l.description, entry?.description_params)),
          csvEsc(isDebit ? translateAccountName(l.account_name) : ""),
          csvEsc(credit ? translateAccountName(credit.account_name) : ""),
          amount,
          l.is_student_submitted ? 1 : 0,
          csvEsc(translateAttemptOutcome(l.attempt_outcome)),
        ].join(","),
      );
    }

    sections.push(""); // blank line between sections

    // Balances section (per team, current).
    sections.push([H("section"), H("team"), H("account"), H("type"), H("balance")].join(","));
    for (const team of teams) {
      for (const b of ledgerBalances(team.id)) {
        sections.push(
          [
            "balances",
            csvEsc(translateTeamName(team.name)),
            csvEsc(translateAccountName(b.accountName)),
            csvEsc(translateAccountType(b.type)),
            b.balance,
          ].join(","),
        );
      }
    }

    sections.push("");

    // Scores section.
    sections.push([H("section"), H("team"), H("year"), H("score"), H("cumulative")].join(","));
    for (const s of snapshots) {
      sections.push(
        [
          "scores",
          csvEsc(translateTeamName(teamNameById(teams, s.teamId))),
          s.year,
          s.score ?? 0,
          s.cumulativeScore,
        ].join(","),
      );
    }

    return sections.join("\n") + "\n";
  } finally {
    i18n.setLocale(previousLocale);
  }
}

function csvEsc(s: string): string {
  if (s == null) return "";
  const str = String(s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function teamNameById(teams: { id: string; name: string }[], id: string): string {
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
