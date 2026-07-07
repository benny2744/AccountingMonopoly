import { useEffect, useState } from "react";
import { useTranslation } from "../i18n/useTranslation.js";
import {
  t,
  getEventCardTitle,
  getEventCardDescription,
  getEventCardTeachingPoint,
} from "@amono/shared/i18n";
import type { PendingAction } from "../api.js";

type CardPayload = {
  id?: string;
  title?: string;
  description?: string;
  amount?: number;
  perTeamAmount?: number;
  mode?: string;
  kind?: string;
  teachingPoint?: string;
};

const OUTFLOW_KINDS = new Set([
  "cash_expense",
  "accrual_expense_payable",
  "accrual_prepaid",
  "multi_team_pay",
]);

const INFLOW_KINDS = new Set([
  "cash_revenue",
  "owner_capital",
  "accrual_revenue_receivable",
  "multi_team_collect",
]);

function formatCardAmount(card: CardPayload): { text: string; className: string } | null {
  const amount = card.perTeamAmount ?? card.amount;
  if (!amount) return null;
  if (OUTFLOW_KINDS.has(card.kind ?? "")) {
    const suffix = card.kind === "multi_team_pay" && card.perTeamAmount ? t("cardRevealModal.perTeam") : "";
    return { text: t("cardRevealModal.amountNegative", { amount }) + suffix, className: "text-red-700" };
  }
  if (INFLOW_KINDS.has(card.kind ?? "")) {
    const suffix = card.kind === "multi_team_collect" && card.perTeamAmount ? t("cardRevealModal.perTeam") : "";
    return { text: t("cardRevealModal.amountPositive", { amount }) + suffix, className: "text-emerald-700" };
  }
  return { text: t("cardRevealModal.amountNeutral", { amount }), className: "text-indigo-700" };
}

/**
 * Client-only reveal modal for event-card draws and tax tiles. Dismiss state is
 * keyed by pending id so a new action always re-shows.
 */
export default function CardRevealModal({ pending }: { pending: PendingAction | null | undefined }) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || (pending.kind !== "event_card" && pending.kind !== "space_fee")) return;
    if (acknowledged !== pending.id) setAcknowledged(null);
  }, [pending?.id, pending?.kind, acknowledged]);

  if (!pending || pending.status !== "awaiting_journal") return null;
  if (acknowledged === pending.id) return null;

  if (pending.kind === "space_fee") {
    const payload = pending.payload as { title?: string; amount?: number };
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="px-5 py-3 text-white font-bold text-sm uppercase tracking-wide bg-amber-600">{t("cardRevealModal.taxHeader")}</div>
          <div className="p-6">
            <h3 className="text-xl font-bold mb-2">{payload.title ?? t("cardRevealModal.taxDefault")}</h3>
            <p className="text-slate-700 mb-3">{t("cardRevealModal.taxInstruction")}</p>
            {!!payload.amount && (
              <div className="text-2xl font-mono font-semibold text-red-700 mb-3">
                {t("cardRevealModal.amountNegative", { amount: payload.amount })}
              </div>
            )}
            <button
              onClick={() => setAcknowledged(pending.id)}
              className="mt-5 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg"
            >
              {t("cardRevealModal.acknowledge")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind !== "event_card") return null;

  const card = (pending.payload as { card?: CardPayload })?.card;
  if (!card) return null;

  const isAccrual = card.mode === "accrual";
  const amountDisplay = formatCardAmount(card);
  const cardId = card.id;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div
          className={`px-5 py-3 text-white font-bold text-sm uppercase tracking-wide ${isAccrual ? "bg-purple-600" : "bg-emerald-600"}`}
        >
          {isAccrual ? t("cardRevealModal.accrualHeader") : t("cardRevealModal.cashHeader")}
        </div>
        <div className="p-6">
          <h3 className="text-xl font-bold mb-2">{cardId ? getEventCardTitle(cardId) : card.title ?? t("cardRevealModal.eventCardTitle")}</h3>
          {cardId && (
            <p className="text-slate-700 mb-3">{getEventCardDescription(cardId, { amount: card.amount ?? 0 })}</p>
          )}
          {!cardId && card.description && <p className="text-slate-700 mb-3">{card.description}</p>}
          {amountDisplay && (
            <div className={`text-2xl font-mono font-semibold mb-3 ${amountDisplay.className}`}>
              {amountDisplay.text}
            </div>
          )}
          {cardId && getEventCardTeachingPoint(cardId) && (
            <div className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded p-3 text-slate-600">
              <span className="font-semibold text-slate-700">{t("cardRevealModal.teachingPoint")}</span> {getEventCardTeachingPoint(cardId)}
            </div>
          )}
          <button
            onClick={() => setAcknowledged(pending.id)}
            className="mt-5 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg"
          >
            {t("cardRevealModal.acknowledge")}
          </button>
        </div>
      </div>
    </div>
  );
}
