import { useTranslation } from "../i18n/useTranslation.js";
import {
  t,
  getTeamNameLabel,
  getSpaceLabel,
  getPaymentMethodLabel,
  getEventCardTitle,
  getJournalDescription,
  getPropertyLabel,
} from "@amono/shared/i18n";
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
  const teamName = (id?: string) => {
    const name = id ? state.teams.find((t) => t.team.id === id)?.team.name : undefined;
    return name ? getTeamNameLabel(name) : "";
  };
  const teamNameValue = teamName(payload.teamId);
  switch (type) {
    case "roll":
      return t("gameEvent.roll", { teamName: teamNameValue, total: payload.total });
    case "move":
      return payload.note === "Turn advanced"
        ? t("gameEvent.teacherAdvanced")
        : t("gameEvent.move", { teamName: teamNameValue });
    case "rent_due":
      return t("gameEvent.rentDue", { payer: teamName(payload.payer), owner: teamName(payload.owner), rent: payload.rent });
    case "buy_property":
      return t("gameEvent.boughtProperty", { teamName: teamNameValue, price: payload.price });
    case "interest_charged":
      return t("gameEvent.interestCharged", { teamName: teamNameValue, amount: payload.amount });
    case "draw_event_card":
      return t("gameEvent.drewCard", { teamName: teamNameValue, title: getEventCardTitle(payload.cardId) });
    case "event_resolved":
      return payload.note ? translateNote(payload.note, teamNameValue) : t("gameEvent.eventResolved", { teamName: teamNameValue });
    case "loan_taken":
      return t("gameEvent.loanTaken", { teamName: teamNameValue, amount: payload.amount });
    case "loan_repaid":
      return t("gameEvent.loanRepaid", { teamName: teamNameValue, amount: payload.amount });
    case "year_end_started":
      return t("gameEvent.yearEndStarted", { teamName: teamNameValue });
    case "year_end_completed":
      return t("gameEvent.yearEndCompleted", { teamName: teamNameValue });
    case "teacher_override":
      if (payload.action === "pause") return t("gameEvent.teacherPaused");
      if (payload.action === "resume") return t("gameEvent.teacherResumed");
      if (payload.action === "force_next_turn") return t("gameEvent.teacherAdvanced");
      if (payload.action === "reveal_answer") return t("gameEvent.teacherRevealed");
      if (payload.action === "end_game") return t("gameEvent.teacherEnded");
      return t("gameEvent.teacherAction", { action: payload.action });
    case "game_started":
      return t("gameEvent.gameStarted");
    case "trade_proposed":
      return t("gameEvent.tradeProposed", {
        proposer: teamName(payload.proposerTeamId),
        property: getPropertyLabel(payload.propertyName),
        price: payload.price,
      });
    case "trade_accepted":
      return t("gameEvent.tradeAccepted", {
        property: getPropertyLabel(payload.propertyName),
        price: payload.price,
      });
    case "trade_declined":
      return t("gameEvent.tradeDeclined", { property: getPropertyLabel(payload.propertyName) });
    case "trade_cancelled":
      return t("gameEvent.tradeCancelled", { property: getPropertyLabel(payload.propertyName) });
    default:
      return type;
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
      if (getJournalDescription({ description: note })) {
        return getJournalDescription({ description: note });
      }
      if (note.startsWith("Landed on ")) {
        const space = note.replace("Landed on ", "").replace(" (no action)", "");
        return t("gameEvent.noop", { teamName, space: getSpaceLabel(space) });
      }
      return note;
  }
}
