import { useState } from "react";
import { api } from "../api.js";
import { useGameStore } from "../store.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { getPropertyLabel, getTeamNameLabel } from "@amono/shared/i18n";
import type { GameState, TeamView } from "../api.js";

// Handles `awaiting_choice` pending actions: buy_or_skip, rent_due, bank_stop.
export default function ActionModal({ state, currentTeam }: { state: GameState; currentTeam: TeamView | null }) {
  const { t } = useTranslation();
  const setState = useGameStore((s) => s.setState);
  const setSocketError = useGameStore((s) => s.setSocketError);
  const [loanAmount, setLoanAmount] = useState(100);
  if (!state.pending || !currentTeam) return null;
  const pending = state.pending;
  if (pending.status !== "awaiting_choice") return null;
  if (pending.teamId !== currentTeam.team.id) return null;
  const payload = pending.payload as any;

  async function resolve(choice: string, amount?: number) {
    try {
      const { state: s } = await api.resolveEvent(state.game.id, currentTeam!.team.id, choice, amount);
      setState(s);
    } catch (e) {
      setSocketError({ code: "ERROR", message: (e as Error).message });
    }
  }

  let body: React.ReactNode = null;
  if (pending.kind === "buy_or_skip") {
    const canAfford = currentTeam.cash >= payload.price;
    body = (
      <>
        <div className="text-lg font-semibold">{getPropertyLabel(payload.name)}</div>
        <div className="text-slate-600">{t("actionModal.purchasePrice", { price: payload.price, rent: payload.rent })}</div>
        <div className="text-sm text-slate-500 mt-1">{t("actionModal.yourCash", { cash: currentTeam.cash })}</div>
        {!canAfford && (
          <div className="text-amber-700 text-sm mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
            {t("actionModal.notEnoughCash")}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => resolve("buy")}
            disabled={!canAfford}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("actionModal.buy", { price: payload.price })}
          </button>
          <button onClick={() => resolve("skip")} className="border border-slate-300 px-5 py-2 rounded-lg">
            {t("actionModal.skip")}
          </button>
        </div>
      </>
    );
  } else if (pending.kind === "rent_due") {
    const choices: string[] = payload.choices ?? ["cash"];
    const canPayCash = currentTeam.cash >= payload.rent;
    body = (
      <>
        <div className="text-lg font-semibold">{t("actionModal.rentDue", { rent: payload.rent })}</div>
        <div className="text-slate-600">{t("actionModal.rentTo", { ownerName: getTeamNameLabel(payload.ownerName), propertyName: getPropertyLabel(payload.name) })}</div>
        <div className="text-sm text-slate-500 mt-1">{t("actionModal.yourCash", { cash: currentTeam.cash })}</div>
        {choices.includes("cash") && !canPayCash && (
          <div className="text-amber-700 text-sm mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
            {t("actionModal.notEnoughCashRent")}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          {choices.includes("cash") && (
            <button
              onClick={() => resolve("cash")}
              disabled={!canPayCash}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("actionModal.payCash")}
            </button>
          )}
          {choices.includes("player_credit") && (
            <button onClick={() => resolve("player_credit")} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold">{t("actionModal.payOnCredit")}</button>
          )}
          {choices.includes("credit_line") && (
            <button onClick={() => resolve("credit_line")} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold">{t("actionModal.useCreditLine")}</button>
          )}
        </div>
      </>
    );
  } else if (pending.kind === "bank_stop") {
    body = (
      <>
        <div className="text-lg font-semibold">{t("actionModal.bankTitle")}</div>
        <div className="text-slate-600">{t("actionModal.bankInfo", { creditLimit: currentTeam.team.creditLimit, loan: currentTeam.loanPayable })}</div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm">{t("actionModal.currencySymbol")}</span>
          <input type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 w-32" aria-label={t("actionModal.amountLabel")} />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => resolve("loan", loanAmount)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg">{t("actionModal.takeLoan")}</button>
          <button onClick={() => resolve("repay", loanAmount)} className="bg-rose-600 text-white px-4 py-2 rounded-lg">{t("actionModal.repayLoan")}</button>
          <button onClick={() => resolve("pass")} className="border border-slate-300 px-4 py-2 rounded-lg">{t("actionModal.pass")}</button>
        </div>
      </>
    );
  } else {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
        {body}
      </div>
    </div>
  );
}
