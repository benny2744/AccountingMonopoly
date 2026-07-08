import {
  t,
  getTeamNameLabel,
  getSpaceLabel,
  getPaymentMethodLabel,
  getEventCardTitle,
  getJournalDescription,
  getPropertyLabel,
  isValidKey,
} from "@amono/shared/i18n";
import type { GameState } from "./api.js";

function teamName(state: GameState, id?: string): string {
  const name = id ? state.teams.find((tv) => tv.team.id === id)?.team.name : undefined;
  return name ? getTeamNameLabel(name) : "";
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

function translateNote(note: string, teamNameValue: string): string {
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
      if (isValidKey(note)) {
        return getJournalDescription({ description: note });
      }
      if (note.startsWith("Landed on ")) {
        const space = note.replace("Landed on ", "").replace(" (no action)", "");
        return t("gameEvent.noop", { teamName: teamNameValue, space: getSpaceLabel(space) });
      }
      return note;
  }
}

/** Localized plain-language description for a game event (sidebar, display, board). */
export function formatGameEvent(type: string, payload: Record<string, unknown>, state: GameState): string {
  const p = payload;
  const teamNameValue = teamName(state, p.teamId as string | undefined);
  switch (type) {
    case "roll":
      return t("gameEvent.roll", { teamName: teamNameValue, total: p.total as number });
    case "move":
      return p.note === "Turn advanced"
        ? t("gameEvent.teacherAdvanced")
        : t("gameEvent.move", { teamName: teamNameValue });
    case "rent_due":
      return t("gameEvent.rentDue", {
        payer: teamName(state, p.payer as string),
        owner: teamName(state, p.owner as string),
        rent: p.rent as number,
      });
    case "rent_paid_cash":
    case "rent_paid_credit":
    case "rent_paid_credit_line":
      return t("gameEvent.rentPaid", {
        teamName: teamNameValue,
        method: getPaymentMethodLabel(rentPaidMethod(type)),
      });
    case "buy_property":
      return t("gameEvent.boughtProperty", { teamName: teamNameValue, price: p.price as number });
    case "interest_charged":
      return t("gameEvent.interestCharged", { teamName: teamNameValue, amount: p.amount as number });
    case "draw_event_card":
      return t("gameEvent.drewCard", {
        teamName: teamNameValue,
        title: getEventCardTitle(p.cardId as string),
      });
    case "event_resolved":
      return p.note
        ? translateNote(p.note as string, teamNameValue)
        : t("gameEvent.eventResolved", { teamName: teamNameValue });
    case "counterparty_pending":
      return t("gameEvent.counterpartyPending", { teamName: teamName(state, p.teamId as string) });
    case "loan_taken":
      return t("gameEvent.loanTaken", { teamName: teamNameValue, amount: p.amount as number });
    case "loan_repaid":
      return t("gameEvent.loanRepaid", { teamName: teamNameValue, amount: p.amount as number });
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
      return t("gameEvent.teacherAction", { action: p.action as string });
    case "game_started":
      return t("gameEvent.gameStarted");
    case "trade_proposed":
      return t("gameEvent.tradeProposed", {
        proposer: teamName(state, p.proposerTeamId as string),
        property: getPropertyLabel(p.propertyName as string),
        price: p.price as number,
      });
    case "trade_accepted":
      return t("gameEvent.tradeAccepted", {
        property: getPropertyLabel(p.propertyName as string),
        price: p.price as number,
      });
    case "trade_declined":
      return t("gameEvent.tradeDeclined", { property: getPropertyLabel(p.propertyName as string) });
    case "trade_cancelled":
      return t("gameEvent.tradeCancelled", { property: getPropertyLabel(p.propertyName as string) });
    default:
      return type.replace(/_/g, " ");
  }
}
