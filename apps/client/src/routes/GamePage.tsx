import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGameStore, api } from "../store.js";
import Board from "../components/Board.js";
import Sidebar from "../components/Sidebar.js";
import JournalEntryPanel from "../components/JournalEntryPanel.js";
import ActionModal from "../components/ActionModal.js";
import TAccountsView from "../components/TAccountsView.js";
import StatementsView from "../components/StatementsView.js";
import type { TeamView } from "../api.js";

type Tab = "board" | "taccounts" | "statements";

export default function GamePage() {
  const { gameId = "" } = useParams<{ gameId: string }>();
  const { state, error, setGameId, setState, setError } = useGameStore();
  const [tab, setTab] = useState<Tab>("board");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    setGameId(gameId);
    api.getState(gameId).then(setState).catch((e) => setError((e as Error).message));
  }, [gameId, setGameId, setState, setError]);

  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!state) return <div className="p-8">Loading…</div>;

  const currentTeam = state.teams.find((t) => t.team.id === state.game.currentTeamId) ?? null;
  const selectedTeam = state.teams.find((t) => t.team.id === selectedTeamId) ?? currentTeam ?? state.teams[0]!;

  return (
    <div className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Accounting Monopoly</h1>
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
              {t === "board" ? "Board" : t === "taccounts" ? "T-Accounts" : "Statements"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        <div className="space-y-4">
          {tab === "board" && (
            <>
              <Board state={state} />
              {currentTeam && state.pending && state.pending.status === "awaiting_journal" && (
                <JournalEntryPanel gameId={state.game.id} pending={state.pending} currentTeam={currentTeam} difficulty={state.game.difficulty} />
              )}
              <ActionModal state={state} currentTeam={currentTeam} />
            </>
          )}
          {tab === "taccounts" && <TAccountsView gameId={state.game.id} teamView={selectedTeam} />}
          {tab === "statements" && <StatementsView gameId={state.game.id} teamView={selectedTeam} />}
        </div>

        <Sidebar
          state={state}
          selectedTeamId={selectedTeam?.team.id ?? null}
          onSelectTeam={setSelectedTeamId}
        />
      </div>

      {state.game.status === "active" && currentTeam && (
        <BottomBar
          gameId={state.game.id}
          teamId={currentTeam.team.id}
          turnPhase={state.game.turnPhase}
        />
      )}
    </div>
  );
}

function BottomBar({
  gameId,
  teamId,
  turnPhase,
}: {
  gameId: string;
  teamId: string;
  turnPhase: "awaiting_roll" | "resolving" | "awaiting_end";
}) {
  const setState = useGameStore((s) => s.setState);
  const [busy, setBusy] = useState(false);
  async function act(path: "roll" | "end-turn") {
    setBusy(true);
    try {
      const { state } = path === "roll" ? await api.roll(gameId, teamId) : await api.endTurn(gameId);
      setState(state);
    } catch (e) {
      alert((e as Error).message);
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
