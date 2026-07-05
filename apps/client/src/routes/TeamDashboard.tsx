import { useState } from "react";
import { useParams } from "react-router-dom";
import { useGameStore, api } from "../store.js";
import { useRoomConnection } from "../hooks/useRoomConnection.js";
import Board from "../components/Board.js";
import Sidebar from "../components/Sidebar.js";
import JournalEntryPanel from "../components/JournalEntryPanel.js";
import ActionModal from "../components/ActionModal.js";
import TAccountsView from "../components/TAccountsView.js";
import StatementsView from "../components/StatementsView.js";
import YearEndPanel from "../components/YearEndPanel.js";
import type { TeamView } from "../api.js";

type Tab = "board" | "taccounts" | "statements";

export default function TeamDashboard() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { loading, error } = useRoomConnection(roomCode, "team");
  const { state, session } = useGameStore();
  const setSocketError = useGameStore((s) => s.setSocketError);
  const [tab, setTab] = useState<Tab>("board");

  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (loading || !state) return <div className="p-8">Connecting to room {roomCode}…</div>;

  const myTeamId = session?.teamId ?? null;
  const myTeam = state.teams.find((t) => t.team.id === myTeamId) ?? null;
  const currentTeam = state.teams.find((t) => t.team.id === state.game.currentTeamId) ?? null;
  const myYearEnd = state.yearEndPendings?.find((p) => p.teamId === myTeamId) ?? null;
  const teamsInYearEnd = state.yearEndPendings?.filter((p) => p.teamId !== myTeamId) ?? [];
  const isMyTurn = currentTeam != null && myTeamId === currentTeam.team.id;

  return (
    <div className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">
            {myTeam ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle" style={{ background: myTeam.team.color }} />
                {myTeam.team.name}
              </>
            ) : (
              "Team Dashboard"
            )}
          </h1>
          <div className="text-sm text-slate-500">
            Room <span className="font-mono font-semibold">{state.game.roomCode}</span> ·{" "}
            {state.game.difficulty === "cash" ? "Cash Basis" : "Accrual Basis"} · Turn {state.game.currentTurnNumber}
          </div>
        </div>
        <div className="flex gap-2">
          {(["board", "taccounts", "statements"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === t ? "bg-slate-800 text-white" : "bg-white border border-slate-300"
              }`}
            >
              {t === "board" ? "Board" : t === "taccounts" ? "My T-Accounts" : "My Statements"}
            </button>
          ))}
        </div>
      </header>

      {state.game.status === "paused" && (
        <div className="mb-4 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg p-3 font-medium">
          ⏸ Game paused by teacher.
        </div>
      )}

      {!isMyTurn && currentTeam && state.game.status === "active" && (
        <div className="mb-4 bg-slate-100 rounded-lg p-3 text-slate-700 font-medium">
          Waiting for {currentTeam.team.name}…
        </div>
      )}

      {teamsInYearEnd.length > 0 && (
        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3 text-purple-800 text-sm">
          {teamsInYearEnd.map((p) => {
            const name = state.teams.find((t) => t.team.id === p.teamId)?.team.name ?? "A team";
            return <div key={p.teamId}>{name} is closing their books for year-end…</div>;
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        <div className="space-y-4">
          {tab === "board" && (
            <>
              <Board state={state} />
              {myYearEnd && myTeam && (
                <YearEndPanel pending={myYearEnd} state={state} teamId={myTeam.team.id} />
              )}
              {isMyTurn && currentTeam && state.pending && state.pending.status === "awaiting_journal" && (
                <JournalEntryPanel gameId={state.game.id} pending={state.pending} currentTeam={currentTeam} difficulty={state.game.difficulty} />
              )}
              {isMyTurn && <ActionModal state={state} currentTeam={currentTeam} />}
              {!isMyTurn && state.pending && state.pending.status === "awaiting_journal" && (
                <div className="text-sm text-slate-600 italic">
                  {currentTeam?.team.name} is recording a journal entry…
                </div>
              )}
            </>
          )}
          {tab === "taccounts" && myTeam && (
            <TAccountsView
              gameId={state.game.id}
              teamView={myTeam}
              refreshKey={`${state.game.updatedAt ?? ""}-${state.game.currentTurnNumber}`}
            />
          )}
          {tab === "statements" && myTeam && (
            <StatementsView
              gameId={state.game.id}
              teamView={myTeam}
              difficulty={state.game.difficulty}
              refreshKey={`${state.game.updatedAt ?? ""}-${state.game.currentTurnNumber}`}
            />
          )}
          {tab !== "board" && myYearEnd && myTeam && (
            <YearEndPanel pending={myYearEnd} state={state} teamId={myTeam.team.id} />
          )}
        </div>

        <Sidebar state={state} selectedTeamId={myTeam?.team.id ?? null} onSelectTeam={() => undefined} />
      </div>

      {state.game.status === "active" && isMyTurn && currentTeam && (
        <BottomBar
          gameId={state.game.id}
          teamId={currentTeam.team.id}
          turnPhase={state.game.turnPhase}
          onError={setSocketError}
        />
      )}
    </div>
  );
}

function BottomBar({
  gameId,
  teamId,
  turnPhase,
  onError,
}: {
  gameId: string;
  teamId: string;
  turnPhase: "awaiting_roll" | "resolving" | "awaiting_end";
  onError: (e: { code: string; message: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function act(path: "roll" | "end-turn") {
    setBusy(true);
    try {
      await (path === "roll" ? api.roll(gameId, teamId) : api.endTurn(gameId));
      // State arrives via socket broadcast; nothing to set here.
    } catch (e) {
      onError({ code: "ERROR", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white shadow-xl rounded-xl px-6 py-3 border border-slate-200">
      {turnPhase === "awaiting_end" ? (
        <button
          onClick={() => act("end-turn")}
          disabled={busy}
          className="bg-slate-700 text-white px-6 py-2 rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "…" : "End Turn →"}
        </button>
      ) : turnPhase === "awaiting_roll" ? (
        <button
          onClick={() => act("roll")}
          disabled={busy}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Rolling…" : "🎲 Roll Dice"}
        </button>
      ) : (
        <div className="text-sm text-slate-600 font-medium px-2">Resolve the pending action, then end your turn.</div>
      )}
    </div>
  );
}

export type { TeamView };
