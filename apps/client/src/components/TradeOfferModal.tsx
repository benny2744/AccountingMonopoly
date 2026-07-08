import { useState } from "react";
import { api } from "../api.js";
import type { GameState } from "../api.js";
import { useGameStore } from "../store.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { getPropertyLabel, getTeamNameLabel } from "@amono/shared/i18n";

/** Responder UI for an open trade_offer pending (off-turn team). */
export function TradeOfferModal({ state, myTeamId }: { state: GameState; myTeamId: string }) {
  const { t } = useTranslation();
  const setState = useGameStore((s) => s.setState);
  const setSocketError = useGameStore((s) => s.setSocketError);
  const [busy, setBusy] = useState(false);

  const pending = state.pending;
  if (!pending || pending.kind !== "trade_offer" || pending.status !== "awaiting_choice") return null;
  if (pending.teamId !== myTeamId) return null;

  const payload = pending.payload as {
    name: string;
    price: number;
    buyerTeamId: string;
    sellerTeamId: string;
    proposerTeamId: string;
  };
  const proposer = state.teams.find((tv) => tv.team.id === payload.proposerTeamId);
  const proposerName = proposer ? getTeamNameLabel(proposer.team.name) : "";
  const isSellOffer = payload.proposerTeamId === payload.sellerTeamId;

  async function respond(choice: "accept" | "decline") {
    setBusy(true);
    try {
      const { state: next } = await api.resolveEvent(state.game.id, myTeamId, choice);
      setState(next);
    } catch (e) {
      setSocketError({ code: "ERROR", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-5 border-2 border-sky-400">
      <h2 className="font-bold text-lg mb-2">{t("tradeOfferModal.title")}</h2>
      <p className="text-slate-700 mb-4">
        {isSellOffer
          ? t("tradeOfferModal.sellOffer", {
              proposer: proposerName,
              property: getPropertyLabel(payload.name),
              price: payload.price,
            })
          : t("tradeOfferModal.buyOffer", {
              proposer: proposerName,
              property: getPropertyLabel(payload.name),
              price: payload.price,
            })}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={busy}
          className="bg-emerald-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("tradeOfferModal.accept")}
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={busy}
          className="border border-slate-300 px-5 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          {t("tradeOfferModal.decline")}
        </button>
      </div>
    </div>
  );
}

/** Proposer waiting banner with cancel while trade_offer is open. */
export function TradeWaitingBanner({ state, myTeamId }: { state: GameState; myTeamId: string }) {
  const { t } = useTranslation();
  const setState = useGameStore((s) => s.setState);
  const setSocketError = useGameStore((s) => s.setSocketError);
  const [busy, setBusy] = useState(false);

  const pending = state.pending;
  if (!pending || pending.kind !== "trade_offer" || pending.status !== "awaiting_choice") return null;
  const payload = pending.payload as { proposerTeamId: string };
  if (payload.proposerTeamId !== myTeamId) return null;

  const responder = state.teams.find((tv) => tv.team.id === pending.teamId);
  const responderName = responder ? getTeamNameLabel(responder.team.name) : "";

  async function cancel() {
    setBusy(true);
    try {
      const { state: next } = await api.cancelTrade(state.game.id, myTeamId);
      setState(next);
    } catch (e) {
      setSocketError({ code: "ERROR", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-sky-900 font-medium">
        {t("teamDashboard.waitingTradeResponse", { teamName: responderName })}
      </span>
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="text-sm border border-sky-300 bg-white px-3 py-1.5 rounded-lg hover:bg-sky-100 disabled:opacity-50"
      >
        {busy ? t("tradeOfferModal.cancelling") : t("tradeOfferModal.cancelOffer")}
      </button>
    </div>
  );
}
