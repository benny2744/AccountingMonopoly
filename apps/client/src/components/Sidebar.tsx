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
  return (
    <aside className="space-y-4">
      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-3">Teams</h2>
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
                    {tv.team.name}
                    {isCurrent && <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 rounded">turn</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    ${tv.cash} cash · {tv.propertyCount} props{tv.loanPayable > 0 ? ` · loan $${tv.loanPayable}` : ""}
                    {(tv.accountsReceivable > 0 || tv.accountsPayable > 0) && (
                      <> · <span className="text-emerald-700">A/R ${tv.accountsReceivable}</span> / <span className="text-rose-700">A/P ${tv.accountsPayable}</span></>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-3">Game Log</h2>
        <div className="space-y-1.5 max-h-72 overflow-y-auto text-sm">
          {state.events.length === 0 && <div className="text-slate-400 text-xs">No events yet.</div>}
          {state.events.map((e) => (
            <div key={e.id} className="text-slate-700 border-l-2 border-slate-200 pl-2">
              <span className="text-slate-400 text-[10px] uppercase mr-1">{e.type}</span>
              {formatEvent(e.type, e.payload, state)}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function formatEvent(type: string, payload: any, state: GameState): string {
  const teamName = (id?: string) => state.teams.find((t) => t.team.id === id)?.team.name ?? id ?? "";
  switch (type) {
    case "roll":
      return `${teamName(payload.teamId)} rolled ${payload.total} (${payload.dice[0]}+${payload.dice[1]})`;
    case "move":
      return payload.note ? `${payload.note}` : `${teamName(payload.teamId)} moved to space ${payload.position}`;
    case "rent_due":
      return `${teamName(payload.payer)} owes ${teamName(payload.owner)} $${payload.rent} rent`;
    case "buy_property":
      return `${teamName(payload.teamId)} bought a property for $${payload.price}`;
    case "interest_charged":
      return `${teamName(payload.teamId)} interest $${payload.amount}${payload.rolledToLoan ? " (added to loan)" : ""}`;
    case "draw_event_card":
      return `${teamName(payload.teamId)} drew "${payload.title}"`;
    case "event_resolved":
      return payload.note ?? "Resolved";
    case "loan_taken":
      return `${teamName(payload.teamId)} bank: ${payload.kind} $${payload.amount}`;
    case "year_end_started":
      return `${teamName(payload.teamId)} passed GO`;
    default:
      return type;
  }
}
