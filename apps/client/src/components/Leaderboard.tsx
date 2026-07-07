import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { GameState } from "../api.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { getTeamNameLabel } from "@amono/shared/i18n";

export default function Leaderboard({ state, showScores }: { state: GameState; showScores: boolean }) {
  const { t } = useTranslation();
  const [scoreMap, setScoreMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .scores(state.game.id)
      .then((r) => {
        if (cancelled) return;
        const m: Record<string, number> = {};
        for (const s of r.scores) m[s.teamId] = s.score;
        setScoreMap(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state.game.id, state.events.length]);

  const ranked = [...state.teams].sort((a, b) => {
    if (showScores) {
      const sa = scoreMap[a.team.id] ?? 0;
      const sb = scoreMap[b.team.id] ?? 0;
      if (sb !== sa) return sb - sa;
    }
    return b.cash - a.cash || b.propertyCount - a.propertyCount;
  });

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
        {showScores ? t("leaderboard.byScore") : t("leaderboard.byCash")}
      </div>
      <div className="space-y-1.5">
        {ranked.map((tv, i) => (
          <div key={tv.team.id} className="flex items-center gap-3 text-lg">
            <span className="text-slate-400 w-6 text-xl">{t("leaderboard.rank", { rank: i + 1 })}</span>
            <span className="inline-block w-4 h-4 rounded-full" style={{ background: tv.team.color }} />
            <span className="flex-1 font-semibold">{getTeamNameLabel(tv.team.name)}</span>
            <span className="font-mono">
              {showScores && scoreMap[tv.team.id] !== undefined ? t("leaderboard.points", { score: scoreMap[tv.team.id] ?? 0 }) : `$${tv.cash}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
