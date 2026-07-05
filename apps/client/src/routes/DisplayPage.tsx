import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useGameStore } from "../store.js";
import { useRoomConnection } from "../hooks/useRoomConnection.js";
import Board from "../components/Board.js";
import Dice, { useDiceRoll } from "../components/Dice.js";
import Leaderboard from "../components/Leaderboard.js";

/**
 * Projector / shared display (PRD §20.4, §5.3). Read-only — joins as
 * role "display" and shows a large board, current-turn banner, last dice
 * roll, last event card, score leaderboard, and a plain-language ticker.
 */
export default function DisplayPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { loading, error } = useRoomConnection(roomCode, "display");
  const { state } = useGameStore();
  const diceInfo = useDiceRoll(state);
  const [yearEndBanner, setYearEndBanner] = useState<{ team: string; year: number; netIncome?: number } | null>(null);
  const [revealBanner, setRevealBanner] = useState<{
    team: string;
    description: string;
    debitAccount?: string;
    creditAccount?: string;
    amount?: number;
  } | null>(null);
  const lastYearEndId = useRef<string | null>(null);
  const lastRevealId = useRef<string | null>(null);

  const lastCompleted = [...(state?.events ?? [])].reverse().find((e) => e.type === "year_end_completed");
  useEffect(() => {
    if (!lastCompleted || !state || lastCompleted.id === lastYearEndId.current) return;
    lastYearEndId.current = lastCompleted.id;
    const payload = lastCompleted.payload as { teamId: string; year: number; netIncome?: number };
    const team = state.teams.find((t) => t.team.id === payload.teamId);
    if (!team) return;
    setYearEndBanner({ team: team.team.name, year: payload.year, netIncome: payload.netIncome });
    const t = setTimeout(() => setYearEndBanner(null), 6000);
    return () => clearTimeout(t);
  }, [lastCompleted?.id, state]);

  const lastReveal = [...(state?.events ?? [])]
    .reverse()
    .find((e) => e.type === "teacher_override" && (e.payload as { action?: string }).action === "reveal_answer");
  useEffect(() => {
    if (!lastReveal || !state || lastReveal.id === lastRevealId.current) return;
    lastRevealId.current = lastReveal.id;
    const payload = lastReveal.payload as {
      teamId: string;
      description?: string;
      debitAccount?: string;
      creditAccount?: string;
      amount?: number;
    };
    const team = state.teams.find((t) => t.team.id === payload.teamId);
    if (!team) return;
    setRevealBanner({
      team: team.team.name,
      description: payload.description ?? "Journal entry",
      debitAccount: payload.debitAccount,
      creditAccount: payload.creditAccount,
      amount: payload.amount,
    });
    const t = setTimeout(() => setRevealBanner(null), 8000);
    return () => clearTimeout(t);
  }, [lastReveal?.id, state]);

  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (loading || !state) return <div className="p-8 text-2xl">Connecting to room {roomCode}…</div>;

  const currentTeam = state.teams.find((t) => t.team.id === state.game.currentTeamId) ?? null;
  const lastRoll = [...state.events].reverse().find((e) => e.type === "roll");
  const lastCard = [...state.events].reverse().find((e) => e.type === "draw_event_card");
  const showScores = state.game.settings.showScores ?? true;
  const teamsInYearEnd = state.yearEndPendings ?? [];

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

      {teamsInYearEnd.length > 0 && (
        <div className="mb-4 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl p-3 text-lg text-center">
          {teamsInYearEnd.map((p) => {
            const name = state.teams.find((t) => t.team.id === p.teamId)?.team.name ?? "A team";
            return <div key={p.teamId}>{name} is closing their books for year-end…</div>;
          })}
        </div>
      )}

      {yearEndBanner && (
        <div className="mb-6 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl p-5 text-2xl font-bold text-center shadow-lg">
          🎉 {yearEndBanner.team} completed Year {yearEndBanner.year}
          {yearEndBanner.netIncome !== undefined ? ` — Net Income $${yearEndBanner.netIncome}` : " — books closed!"}
        </div>
      )}

      {revealBanner && (
        <div className="mb-6 bg-rose-100 border border-rose-300 text-rose-900 rounded-xl p-5 text-xl font-semibold text-center shadow-lg">
          <div className="text-2xl font-bold mb-2">Answer revealed for {revealBanner.team}</div>
          <div className="text-base">{revealBanner.description}</div>
          {revealBanner.debitAccount && revealBanner.creditAccount && revealBanner.amount !== undefined && (
            <div className="mt-2 font-mono text-lg">
              Dr {revealBanner.debitAccount} ${revealBanner.amount} · Cr {revealBanner.creditAccount} ${revealBanner.amount}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        <div>
          <Board state={state} dice={diceInfo.dice} rolling={diceInfo.rolling} />
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Last dice roll</div>
            {diceInfo.dice || lastRoll ? (
              <div className="flex flex-col items-start gap-2">
                <Dice dice={diceInfo.dice ?? (lastRoll!.payload as any).dice} rolling={diceInfo.rolling} size="md" />
                {lastRoll && !diceInfo.rolling && (
                  <div className="text-2xl font-bold">
                    = {(lastRoll.payload as any).total}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-400">No rolls yet.</div>
            )}
          </div>
          {lastCard && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 shadow">
              <div className="text-xs uppercase tracking-wide text-indigo-500 mb-1">Event card</div>
              <div className="text-xl font-semibold">{(lastCard.payload as any).title}</div>
              {(lastCard.payload as any).description && (
                <div className="text-sm text-indigo-800 mt-1">{(lastCard.payload as any).description}</div>
              )}
            </div>
          )}
          <Leaderboard state={state} showScores={showScores} />
          <EventTicker state={state} />
        </div>
      </div>
    </div>
  );
}

function EventTicker({ state }: { state: import("../api.js").GameState }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 max-h-72 overflow-y-auto">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Recent activity</div>
      <div className="space-y-1.5 text-sm">
        {state.events.length === 0 && <div className="text-slate-400">No events yet.</div>}
        {state.events.map((e) => (
          <div key={e.id} className="border-l-2 border-slate-200 pl-3">
            <span className="text-slate-700">{describeEvent(e.type, e.payload as any, state)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Plain-language event description for the projector ticker (PRD §28.3). */
function describeEvent(type: string, p: any, state: import("../api.js").GameState): string {
  const teamName = (id?: string) => state.teams.find((t) => t.team.id === id)?.team.name ?? "A team";
  switch (type) {
    case "roll":
      return `${teamName(p.teamId)} rolled ${p.total}.`;
    case "move":
      return p.note ?? `${teamName(p.teamId)} moved.`;
    case "rent_due":
      return `${teamName(p.payer)} owes ${teamName(p.owner)} $${p.rent} rent.`;
    case "rent_paid_cash":
    case "rent_paid_credit":
    case "rent_paid_credit_line":
      return `${teamName(p.teamId)} paid rent (${type.replace("rent_paid_", "").replace("_", " ")}).`;
    case "buy_property":
      return `${teamName(p.teamId)} bought a property for $${p.price}.`;
    case "draw_event_card":
      return `${teamName(p.teamId)} drew "${p.title}".`;
    case "event_resolved":
      return p.note ?? `${teamName(p.teamId)} resolved an action.`;
    case "interest_charged":
      return `${teamName(p.teamId)} paid $${p.amount} interest${p.rolledToLoan ? " (added to loan)" : ""}.`;
    case "loan_taken":
      return `${teamName(p.teamId)}: bank ${p.kind} $${p.amount}.`;
    case "year_end_started":
      return `${teamName(p.teamId)} started year-end.`;
    case "year_end_completed":
      return `${teamName(p.teamId)} completed year-end.`;
    case "teacher_override":
      return p.action === "pause"
        ? "Teacher paused the game."
        : p.action === "resume"
          ? "Teacher resumed the game."
          : p.action === "force_next_turn"
            ? "Teacher advanced the turn."
            : p.action === "reveal_answer"
              ? "Teacher revealed an answer."
              : p.action === "end_game"
                ? "Teacher ended the game."
                : `Teacher: ${p.action}.`;
    case "game_started":
      return "Game started.";
    default:
      return type.replace(/_/g, " ");
  }
}
