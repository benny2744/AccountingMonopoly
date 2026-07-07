import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useGameStore } from "../store.js";
import { useRoomConnection } from "../hooks/useRoomConnection.js";
import { useTranslation } from "../i18n/useTranslation.js";
import {
  t,
  getTeamNameLabel,
  getSpaceLabel,
  getAccountLabel,
  getPaymentMethodLabel,
  getEventCardTitle,
  getEventCardDescription,
} from "@amono/shared/i18n";
import { getDeck } from "@amono/shared/game";
import Board from "../components/Board.js";
import Dice, { useDiceRoll } from "../components/Dice.js";
import Leaderboard from "../components/Leaderboard.js";
import { latestEvent, latestEventWhere } from "../events.js";

/**
 * Projector / shared display (PRD §20.4, §5.3). Read-only — joins as
 * role "display" and shows a large board, current-turn banner, last dice
 * roll, last event card, score leaderboard, and a plain-language ticker.
 */
export default function DisplayPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { t } = useTranslation();
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

  const lastCompleted = state ? latestEvent(state.events, "year_end_completed") : undefined;
  useEffect(() => {
    if (!lastCompleted || !state || lastCompleted.id === lastYearEndId.current) return;
    lastYearEndId.current = lastCompleted.id;
    const payload = lastCompleted.payload as { teamId: string; year: number; netIncome?: number };
    const team = state.teams.find((t) => t.team.id === payload.teamId);
    if (!team) return;
    setYearEndBanner({ team: team.team.name, year: payload.year, netIncome: payload.netIncome });
    const timer = setTimeout(() => setYearEndBanner(null), 6000);
    return () => clearTimeout(timer);
  }, [lastCompleted?.id, state]);

  const lastReveal = state
    ? latestEventWhere(
        state.events,
        (e) => e.type === "teacher_override" && (e.payload as { action?: string }).action === "reveal_answer",
      )
    : undefined;
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
      description: payload.description ?? t("displayPage.answerRevealed", { teamName: team.team.name }),
      debitAccount: payload.debitAccount,
      creditAccount: payload.creditAccount,
      amount: payload.amount,
    });
    const timer = setTimeout(() => setRevealBanner(null), 8000);
    return () => clearTimeout(timer);
  }, [lastReveal?.id, state, t]);

  if (error) return <div className="p-8 text-red-600">{t("displayPage.error", { error })}</div>;
  if (loading || !state) return <div className="p-8 text-2xl">{t("displayPage.connecting", { roomCode })}</div>;

  const currentTeam = state.teams.find((t) => t.team.id === state.game.currentTeamId) ?? null;
  const lastRoll = latestEvent(state.events, "roll");
  const lastCard = latestEvent(state.events, "draw_event_card");
  const showScores = state.game.settings.showScores ?? true;
  const teamsInYearEnd = state.yearEndPendings ?? [];

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <header className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm uppercase tracking-widest text-slate-500">{t("displayPage.header", { roomCode: state.game.roomCode })}</div>
        </div>
        {currentTeam && (
          <div className="text-right">
            <div className="text-sm uppercase tracking-widest text-slate-500">{t("displayPage.currentTurn")}</div>
            <div className="text-3xl font-bold flex items-center gap-3 justify-end">
              <span className="inline-block w-5 h-5 rounded-full" style={{ background: currentTeam.team.color }} />
              {getTeamNameLabel(currentTeam.team.name)}
            </div>
            <div className="text-slate-500 text-sm">
              {t("displayPage.teamSummary", {
                cash: currentTeam.cash,
                loan: currentTeam.loanPayable,
                year: currentTeam.team.currentYear,
              })}
            </div>
          </div>
        )}
      </header>

      {state.game.status === "paused" && (
        <div className="mb-6 bg-amber-100 border border-amber-300 text-amber-900 rounded-xl p-4 text-xl font-semibold text-center">
          {t("displayPage.paused")}
        </div>
      )}

      {teamsInYearEnd.length > 0 && (
        <div className="mb-4 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl p-3 text-lg text-center">
          {teamsInYearEnd.map((p) => {
            const name = state.teams.find((t) => t.team.id === p.teamId)?.team.name ?? "";
            return <div key={p.teamId}>{t("displayPage.closingBooks", { teamName: getTeamNameLabel(name) })}</div>;
          })}
        </div>
      )}

      {yearEndBanner && (
        <div className="mb-6 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl p-5 text-2xl font-bold text-center shadow-lg">
          {t("displayPage.yearEndComplete", { teamName: getTeamNameLabel(yearEndBanner.team), year: yearEndBanner.year })}
          {yearEndBanner.netIncome !== undefined
            ? t("displayPage.netIncome", { amount: yearEndBanner.netIncome })
            : t("displayPage.booksClosed")}
        </div>
      )}

      {revealBanner && (
        <div className="mb-6 bg-rose-100 border border-rose-300 text-rose-900 rounded-xl p-5 text-xl font-semibold text-center shadow-lg">
          <div className="text-2xl font-bold mb-2">{t("displayPage.answerRevealed", { teamName: getTeamNameLabel(revealBanner.team) })}</div>
          <div className="text-base">{revealBanner.description}</div>
          {revealBanner.debitAccount && revealBanner.creditAccount && revealBanner.amount !== undefined && (
            <div className="mt-2 font-mono text-lg">
              {t("displayPage.debitCredit", {
                debit: getAccountLabel(revealBanner.debitAccount),
                credit: getAccountLabel(revealBanner.creditAccount),
                amount: revealBanner.amount,
              })}
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
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{t("displayPage.lastDiceRoll")}</div>
            {diceInfo.dice || lastRoll ? (
              <div className="flex flex-col items-start gap-2">
                <Dice dice={diceInfo.dice ?? (lastRoll!.payload as any).dice} rolling={diceInfo.rolling} size="md" />
                {lastRoll && !diceInfo.rolling && (
                  <div className="text-2xl font-bold">
                    {t("displayPage.diceTotal", { total: (lastRoll.payload as any).total })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-400">{t("displayPage.noRolls")}</div>
            )}
          </div>
          {lastCard && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 shadow">
              <div className="text-xs uppercase tracking-wide text-indigo-500 mb-1">{t("displayPage.eventCard")}</div>
              <div className="text-xl font-semibold">{getEventCardTitle((lastCard.payload as any).cardId)}</div>
              {(lastCard.payload as any).cardId && (
                <div className="text-sm text-indigo-800 mt-1">
                  {getEventCardDescription((lastCard.payload as any).cardId, {
                    amount: cardAmount((lastCard.payload as any).cardId),
                  })}
                </div>
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

function cardAmount(cardId: string): number {
  const card = [...getDeck("cash"), ...getDeck("accrual")].find((c) => c.id === cardId);
  return card?.amount ?? 0;
}

function EventTicker({ state }: { state: import("../api.js").GameState }) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-2xl shadow p-4 max-h-72 overflow-y-auto">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{t("displayPage.recentActivity")}</div>
      <div className="space-y-1.5 text-sm">
        {state.events.length === 0 && <div className="text-slate-400">{t("displayPage.noEvents")}</div>}
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
  const teamName = (id?: string) => {
    const name = id ? state.teams.find((t) => t.team.id === id)?.team.name : undefined;
    return name ? getTeamNameLabel(name) : "";
  };
  const teamNameValue = teamName(p.teamId);
  switch (type) {
    case "roll":
      return t("gameEvent.roll", { teamName: teamNameValue, total: p.total });
    case "move":
      return p.note === "Turn advanced"
        ? t("gameEvent.teacherAdvanced")
        : t("gameEvent.move", { teamName: teamNameValue });
    case "rent_due":
      return t("gameEvent.rentDue", { payer: teamName(p.payer), owner: teamName(p.owner), rent: p.rent });
    case "rent_paid_cash":
    case "rent_paid_credit":
    case "rent_paid_credit_line":
      return t("gameEvent.rentPaid", {
        teamName: teamNameValue,
        method: getPaymentMethodLabel(rentPaidMethod(type)),
      });
    case "buy_property":
      return t("gameEvent.boughtProperty", { teamName: teamNameValue, price: p.price });
    case "draw_event_card":
      return t("gameEvent.drewCard", { teamName: teamNameValue, title: getEventCardTitle(p.cardId) });
    case "event_resolved":
      return p.note ? translateNote(p.note, teamNameValue) : t("gameEvent.eventResolved", { teamName: teamNameValue });
    case "interest_charged":
      return t("gameEvent.interestCharged", { teamName: teamNameValue, amount: p.amount });
    case "loan_taken":
      return t("gameEvent.loanTaken", { teamName: teamNameValue, amount: p.amount });
    case "loan_repaid":
      return t("gameEvent.loanRepaid", { teamName: teamNameValue, amount: p.amount });
    case "year_end_started":
      return t("gameEvent.yearEndStarted", { teamName: teamNameValue });
    case "year_end_completed":
      return t("gameEvent.yearEndCompleted", { teamName: teamNameValue });
    case "teacher_override":
      if (p.action === "pause") return t("gameEvent.teacherPaused");
      if (p.action === "resume") return t("gameEvent.teacherResumed");
      if (p.action === "force_next_turn") return t("gameEvent.teacherAdvanced");
      if (p.action === "reveal_answer") return t("gameEvent.teacherRevealed");
      if (p.action === "end_game") return t("gameEvent.teacherEnded");
      return t("gameEvent.teacherAction", { action: p.action });
    case "game_started":
      return t("gameEvent.gameStarted");
    default:
      return type.replace(/_/g, " ");
  }
}

function rentPaidMethod(eventType: string): string {
  switch (eventType) {
    case "rent_paid_cash":
      return "cash";
    case "rent_paid_credit":
      return "playerCredit";
    case "rent_paid_credit_line":
      return "creditLine";
    default:
      return eventType;
  }
}

function translateNote(note: string, teamName: string): string {
  switch (note) {
    case "Own property":
      return t("gameEvent.ownProperty");
    case "Skipped buying property":
      return t("gameEvent.skippedBuying");
    case "Passed at bank":
      return t("gameEvent.passedAtBank");
    case "Journal entry posted":
      return t("gameEvent.journalEntryPosted");
    case "Payment method modifier (no journal entry)":
      return t("gameEvent.paymentMethodModifier");
    default:
      if (note.startsWith("Landed on ")) {
        const space = note.replace("Landed on ", "").replace(" (no action)", "");
        return t("gameEvent.noop", { teamName, space: getSpaceLabel(space) });
      }
      return note;
  }
}
