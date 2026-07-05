import { useParams } from "react-router-dom";
import { useGameStore } from "../store.js";
import { useRoomConnection } from "../hooks/useRoomConnection.js";
import Board from "../components/Board.js";

/**
 * Projector / shared display (PRD §20.4, §5.3). Read-only — joins as
 * role "display" and shows a large board, current-turn banner, last dice
 * roll, and a scrolling recent-events ticker.
 */
export default function DisplayPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { loading, error } = useRoomConnection(roomCode, "display");
  const { state } = useGameStore();

  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (loading || !state) return <div className="p-8 text-2xl">Connecting to room {roomCode}…</div>;

  const currentTeam = state.teams.find((t) => t.team.id === state.game.currentTeamId) ?? null;
  const lastRoll = [...state.events].reverse().find((e) => e.type === "roll");
  const lastCard = [...state.events].reverse().find((e) => e.type === "draw_event_card");

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <header className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm uppercase tracking-widest text-slate-500">Accounting Monopoly · Room</div>
          <div className="font-mono text-4xl font-bold tracking-widest">{state.game.roomCode}</div>
        </div>
        {currentTeam && (
          <div className="text-right">
            <div className="text-sm uppercase tracking-widest text-slate-500">Current turn</div>
            <div className="text-3xl font-bold flex items-center gap-3 justify-end">
              <span className="inline-block w-5 h-5 rounded-full" style={{ background: currentTeam.team.color }} />
              {currentTeam.team.name}
            </div>
            <div className="text-slate-500 text-sm">
              Cash ${currentTeam.cash} · Loan ${currentTeam.loanPayable} · Year {currentTeam.team.currentYear}
            </div>
          </div>
        )}
      </header>

      {state.game.status === "paused" && (
        <div className="mb-6 bg-amber-100 border border-amber-300 text-amber-900 rounded-xl p-4 text-xl font-semibold text-center">
          ⏸ Game paused by teacher
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        <div>
          <Board state={state} />
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Last dice roll</div>
            {lastRoll ? (
              <div className="text-3xl font-bold">
                🎲 {(lastRoll.payload as any).dice[0]} + {(lastRoll.payload as any).dice[1]} = {(lastRoll.payload as any).total}
              </div>
            ) : (
              <div className="text-slate-400">No rolls yet.</div>
            )}
          </div>
          {lastCard && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
              <div className="text-xs uppercase tracking-wide text-indigo-500 mb-1">Event card</div>
              <div className="text-xl font-semibold">{(lastCard.payload as any).title}</div>
            </div>
          )}
          <Leaderboard state={state} />
          <EventTicker state={state} />
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ state }: { state: import("../api.js").GameState }) {
  const ranked = [...state.teams].sort((a, b) => b.cash - a.cash || b.propertyCount - a.propertyCount);
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Leaderboard</div>
      <div className="space-y-1.5">
        {ranked.map((tv, i) => (
          <div key={tv.team.id} className="flex items-center gap-3">
            <span className="text-slate-400 w-5">{i + 1}.</span>
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: tv.team.color }} />
            <span className="flex-1 font-medium">{tv.team.name}</span>
            <span className="font-mono">${tv.cash}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventTicker({ state }: { state: import("../api.js").GameState }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 max-h-72 overflow-y-auto">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Recent activity</div>
      <div className="space-y-1 text-sm">
        {state.events.length === 0 && <div className="text-slate-400">No events yet.</div>}
        {state.events.map((e) => (
          <div key={e.id} className="border-l-2 border-slate-200 pl-2">
            <span className="text-slate-400 text-[10px] uppercase mr-1">{e.type}</span>
            <span className="text-slate-700">{(e.payload as any)?.note ?? (e.payload as any)?.title ?? e.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
