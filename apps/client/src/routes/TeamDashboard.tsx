import { useEffect, useState } from "react";
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
import BuildPanel from "../components/BuildPanel.js";
import Dice, { useDiceRoll } from "../components/Dice.js";
import PropertiesView from "../components/PropertiesView.js";
import CardRevealModal from "../components/CardRevealModal.js";
import type { TeamView } from "../api.js";

type Tab = "board" | "properties" | "taccounts" | "statements";

export default function TeamDashboard() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { loading, error } = useRoomConnection(roomCode, "team");
  const { state, session } = useGameStore();
  const setSocketError = useGameStore((s) => s.setSocketError);
  const [tab, setTab] = useState<Tab>("board");
  const [rollTrigger, setRollTrigger] = useState(false);
  const diceInfo = useDiceRoll(state);

  useEffect(() => {
    if (rollTrigger && diceInfo.rolling) setRollTrigger(false);
  }, [rollTrigger, diceInfo.rolling]);

  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (loading || !state) return <div className="p-8">Connecting to room {roomCode}…</div>;

  const myTeamId = session?.teamId ?? null;
  const myTeam = state.teams.find((t) => t.team.id === myTeamId) ?? null;
  const currentTeam = state.teams.find((t) => t.team.id === state.game.currentTeamId) ?? null;
  const myYearEnd = state.yearEndPendings?.find((p) => p.teamId === myTeamId) ?? null;
  const teamsInYearEnd = state.yearEndPendings?.filter((p) => p.teamId !== myTeamId) ?? [];
  const isMyTurn = currentTeam != null && myTeamId === currentTeam.team.id;
  // The receiver of a rent/transfer also journals — even when it isn't their turn.
  const iShouldJournal =
    !!myTeamId && !!state.pending && state.pending.status === "awaiting_journal" && state.pending.teamId === myTeamId;
  const pendingTeam = state.pending ? state.teams.find((t) => t.team.id === state.pending!.teamId) : null;
  const pendingTeamName = pendingTeam?.team.name;

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
          {(["board", "properties", "taccounts", "statements"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === t ? "bg-slate-800 text-white" : "bg-white border border-slate-300"
              }`}
            >
              {t === "board" ? "Board" : t === "properties" ? "Properties" : t === "taccounts" ? "My T-Accounts" : "My Statements"}
            </button>
          ))}
        </div>
      </header>

      {state.game.status === "paused" && (
        <div className="mb-4 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg p-3 font-medium">
          ⏸ Game paused by teacher.
        </div>
      )}

      {state.game.status === "ended" && (
        <div className="mb-4 bg-slate-200 border border-slate-300 text-slate-800 rounded-lg p-3 font-medium">
          🏁 Game ended. Final scores are on the projector / teacher dashboard.
        </div>
      )}

      {state.game.status === "active" && (
        <div className="mb-4 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg p-3 font-medium">
          {isMyTurn
            ? myYearEnd
              ? "Finish your year-end checklist before rolling again."
              : state.game.turnPhase === "awaiting_roll"
                ? "Your turn — roll!"
                : state.pending?.status === "awaiting_journal"
                  ? "Record your journal entry."
                  : "Resolve the pending action."
            : currentTeam
              ? `Waiting for ${currentTeam.team.name}…`
              : ""}
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
              <Board
                state={state}
                dice={diceInfo.dice}
                rolling={diceInfo.rolling || rollTrigger}
                controls={
                  state.game.status === "active" && isMyTurn && currentTeam ? (
                    <TurnControls
                      gameId={state.game.id}
                      teamId={currentTeam.team.id}
                      turnPhase={state.game.turnPhase}
                      onError={setSocketError}
                      onRollStart={() => setRollTrigger(true)}
                    />
                  ) : undefined
                }
              />
              {isMyTurn && myTeamId && state.game.turnPhase === "awaiting_roll" && (
                <BuildPanel state={state} teamId={myTeamId} />
              )}
              {myYearEnd && myTeam && (
                <YearEndPanel pending={myYearEnd} state={state} teamId={myTeam.team.id} />
              )}
              {iShouldJournal && myTeam && state.pending && (
                <JournalEntryPanel
                  key={state.pending.id}
                  gameId={state.game.id}
                  pending={state.pending}
                  currentTeam={myTeam}
                  difficulty={state.game.difficulty}
                />
              )}
              {isMyTurn && <ActionModal state={state} currentTeam={currentTeam} />}
              {!iShouldJournal && state.pending && state.pending.status === "awaiting_journal" && (
                <div className="text-sm text-slate-600 italic">
                  {pendingTeamName ?? currentTeam?.team.name} is recording a journal entry…
                </div>
              )}
              {isMyTurn && <CardRevealModal pending={state.pending} />}
            </>
          )}
          {tab === "properties" && myTeam && <PropertiesView state={state} teamView={myTeam} />}
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
    </div>
  );
}

function TurnControls({
  gameId,
  teamId,
  turnPhase,
  onError,
  onRollStart,
}: {
  gameId: string;
  teamId: string;
  turnPhase: "awaiting_roll" | "resolving" | "awaiting_end";
  onError: (e: { code: string; message: string }) => void;
  onRollStart?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function act(path: "roll" | "end-turn") {
    setBusy(true);
    try {
      if (path === "roll") onRollStart?.();
      await (path === "roll" ? api.roll(gameId, teamId) : api.endTurn(gameId));
    } catch (e) {
      onError({ code: "ERROR", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-white shadow-md rounded-xl px-4 py-2 border border-slate-200 flex items-center gap-3">
      {turnPhase === "awaiting_end" ? (
        <button
          onClick={() => act("end-turn")}
          disabled={busy}
          className="bg-slate-700 text-white px-5 py-2 rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "…" : "End Turn →"}
        </button>
      ) : turnPhase === "awaiting_roll" ? (
        <button
          onClick={() => act("roll")}
          disabled={busy}
          className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
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
