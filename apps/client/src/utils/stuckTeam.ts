import { t } from "@amono/shared/i18n";
import type { GameState } from "../api.js";

/** Stuck-team detection (PRD §28.2): how long has the current pending action been open? */
export function stuckInfo(
  state: GameState,
  teamId: string,
): { minutes: number; severity: "low" | "high"; label: string } | null {
  const p = state.pending;
  if (!p || p.teamId !== teamId || !p.createdAt) return null;
  const ms = Date.now() - new Date(p.createdAt).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return null;
  return {
    minutes,
    severity: minutes >= 3 ? "high" : "low",
    label: t("teacherDashboard.stuckLabel", { kind: p.kind, minutes }),
  };
}

/** Any team in the game with a stuck pending (for overview cards). */
export function anyStuckTeam(state: GameState): { teamName: string; label: string; severity: "low" | "high" } | null {
  for (const tv of state.teams) {
    const info = stuckInfo(state, tv.team.id);
    if (info) {
      return { teamName: tv.team.name, label: info.label, severity: info.severity };
    }
  }
  return null;
}
