import { useState } from "react";
import { api } from "../api.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { t, getAccountLabel } from "@amono/shared/i18n";
import type { GameState, PendingAction } from "../api.js";

interface YearEndPayload {
  currentStep: number;
  steps: {
    kind: "collect_ar" | "settle_ap" | "recognize_prepaid" | "snapshot_statements" | "closing_entries" | "done";
    amount?: number;
    debitAccount?: string;
    otherTeamId?: string;
    source?: string;
  }[];
}

/**
 * Phase 4 — year-end checklist panel. Shown whenever this team has an open
 * year-end pending, independent of whose turn it is.
 */
export default function YearEndPanel({
  state,
  teamId,
  pending,
}: {
  state: GameState;
  teamId: string;
  pending: PendingAction;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pending.kind !== "year_end") return null;
  const payload = pending.payload as YearEndPayload;
  const step = payload.steps[payload.currentStep];
  const year = state.teams.find((t) => t.team.id === teamId)?.team.currentYear;

  async function resolve(choice: "pay_cash" | "roll_to_loan" | "continue") {
    setBusy(true);
    setError(null);
    try {
      await api.resolveYearEndStep(state.game.id, teamId, choice);
      // State arrives via socket broadcast.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-5 border-t-4 border-purple-500">
      <h2 className="font-bold text-lg mb-1">{t("yearEndPanel.title")}</h2>
      <p className="text-sm text-slate-600 mb-3">
        {t("yearEndPanel.instruction", { year: year ?? 1 })}
      </p>
      <ol className="space-y-2 mb-4">
        {payload.steps.map((s, i) => {
          const done = i < payload.currentStep;
          const isCurrent = i === payload.currentStep;
          return (
            <li
              key={i}
              className={`flex items-center gap-2 text-sm p-2 rounded-lg ${
                isCurrent ? "bg-purple-50 border border-purple-200" : done ? "text-slate-400" : "text-slate-700"
              }`}
            >
              <span className="w-5 text-center">{done ? "✓" : isCurrent ? "▶" : ""}</span>
              <span className="flex-1">{labelFor(s.kind, s.amount, s.debitAccount)}</span>
            </li>
          );
        })}
      </ol>

      {step?.kind === "settle_ap" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
          <div className="text-sm font-semibold text-amber-900">{t("yearEndPanel.settlePayable", { amount: step.amount ?? 0 })}</div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => resolve("pay_cash")}
              disabled={busy}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {t("yearEndPanel.payCash")}
            </button>
            <button
              onClick={() => resolve("roll_to_loan")}
              disabled={busy}
              className="bg-rose-600 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {t("yearEndPanel.rollToLoan")}
            </button>
          </div>
        </div>
      )}

      {step && step.kind !== "settle_ap" && step.kind !== "done" && (
        <button
          onClick={() => resolve("continue")}
          disabled={busy}
          className="bg-purple-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
        >
          {busy ? t("yearEndPanel.applying") : t("yearEndPanel.continue")}
        </button>
      )}

      {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
    </div>
  );
}

function labelFor(kind: string, amount?: number, account?: string): string {
  switch (kind) {
    case "collect_ar":
      return t("yearEndPanel.collectAr", { amount: amount ? ` ($${amount})` : "" });
    case "settle_ap":
      return t("yearEndPanel.settleAp", { amount: amount ? ` ($${amount})` : "" });
    case "recognize_prepaid":
      return t("yearEndPanel.recognizePrepaid", {
        account: account ? ` → ${getAccountLabel(account)}` : "",
        amount: amount ? ` ($${amount})` : "",
      });
    case "snapshot_statements":
      return t("yearEndPanel.snapshotStatements");
    case "closing_entries":
      return t("yearEndPanel.closeRevenueExpenses");
    case "done":
      return t("yearEndPanel.advanceYear");
    default:
      return kind;
  }
}
