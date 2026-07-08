import { useTranslation } from "../i18n/useTranslation.js";
import { getTeamNameLabel } from "@amono/shared/i18n";
import { formatGameEvent } from "../formatGameEvent.js";
import type { GameState } from "../api.js";

export default function Sidebar({
  state,
  selectedTeamId,
  onSelectTeam,
}: {
  state: GameState;
  selectedTeamId: string | null;
  onSelectTeam: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="space-y-4">
      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-3">{t("sidebar.teams")}</h2>
        <div className="space-y-2">
          {state.teams.map((tv) => {
            const selected = selectedTeamId === tv.team.id;
            const isCurrent = state.game.currentTeamId === tv.team.id;
            return (
              <button
                key={tv.team.id}
                onClick={() => onSelectTeam(tv.team.id)}
                className={`w-full text-left rounded-lg border p-3 flex items-center gap-3 ${
                  selected ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200"
                } ${isCurrent ? "bg-amber-50" : "bg-white"}`}
              >
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: tv.team.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    {getTeamNameLabel(tv.team.name)}
                    {isCurrent && <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 rounded">{t("teacherDashboard.turnBadge")}</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t("sidebar.teamSummary", { cash: tv.cash, propertyCount: tv.propertyCount })}
                    {tv.loanPayable > 0 && ` · ${t("sidebar.loanSuffix", { loan: tv.loanPayable })}`}
                    {(tv.accountsReceivable > 0 || tv.accountsPayable > 0) && (
                      <> · <span className="text-emerald-700">{t("sidebar.ar")} ${tv.accountsReceivable}</span> / <span className="text-rose-700">{t("sidebar.ap")} ${tv.accountsPayable}</span></>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-3">{t("sidebar.gameLog")}</h2>
        <div className="space-y-1.5 max-h-72 overflow-y-auto text-sm">
          {state.events.length === 0 && <div className="text-slate-400 text-xs">{t("sidebar.noEvents")}</div>}
          {state.events.map((e) => (
            <div key={e.id} className="text-slate-700 border-l-2 border-slate-200 pl-2">
              {formatGameEvent(e.type, e.payload as Record<string, unknown>, state)}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
