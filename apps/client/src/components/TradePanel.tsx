import { useMemo, useState } from "react";
import { api } from "../api.js";
import type { GameState } from "../api.js";
import { useGameStore } from "../store.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { getPropertyLabel, getTeamNameLabel } from "@amono/shared/i18n";

type TradeMode = "buy" | "sell";

function isTradeable(p: GameState["properties"][number]): boolean {
  return !p.isMortgaged && p.houses === 0 && !!p.ownerTeamId;
}

export default function TradePanel({ state, teamId }: { state: GameState; teamId: string }) {
  const { t } = useTranslation();
  const setState = useGameStore((s) => s.setState);
  const setSocketError = useGameStore((s) => s.setSocketError);
  const [mode, setMode] = useState<TradeMode>("sell");
  const [propertyId, setPropertyId] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const otherTeams = useMemo(
    () => state.teams.filter((tv) => tv.team.id !== teamId),
    [state.teams, teamId],
  );

  const sellProperties = useMemo(
    () => state.properties.filter((p) => p.ownerTeamId === teamId && isTradeable(p)),
    [state.properties, teamId],
  );

  const buyProperties = useMemo(
    () => state.properties.filter((p) => p.ownerTeamId && p.ownerTeamId !== teamId && isTradeable(p)),
    [state.properties, teamId],
  );

  const eligible = mode === "sell" ? sellProperties : buyProperties;

  if (state.pending) return null;
  if (state.game.turnPhase !== "awaiting_end") return null;
  if (eligible.length === 0 && sellProperties.length === 0 && buyProperties.length === 0) return null;

  async function propose() {
    if (!propertyId || !price || price <= 0 || !Number.isInteger(price)) {
      setSocketError({ code: "ERROR", message: t("tradePanel.invalidPrice") });
      return;
    }
    if (mode === "sell" && !counterpartyId) {
      setSocketError({ code: "ERROR", message: t("tradePanel.missingFields") });
      return;
    }
    setBusy(true);
    try {
      const { state: next } = await api.proposeTrade(
        state.game.id,
        teamId,
        propertyId,
        price,
        mode === "sell" ? counterpartyId : undefined,
      );
      setState(next);
      setPropertyId("");
      setCounterpartyId("");
      setPrice(0);
    } catch (e) {
      setSocketError({ code: "ERROR", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const selectedProp = state.properties.find((p) => p.id === propertyId);
  const ownerForBuy = selectedProp?.ownerTeamId ?? "";

  return (
    <div className="bg-white rounded-2xl shadow p-4 border-t-4 border-sky-500">
      <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-2">{t("tradePanel.title")}</h2>
      <p className="text-xs text-slate-500 mb-3">{t("tradePanel.helper")}</p>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => { setMode("sell"); setPropertyId(""); setCounterpartyId(""); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === "sell" ? "bg-sky-600 text-white" : "border border-slate-300"}`}
        >
          {t("tradePanel.modeSell")}
        </button>
        <button
          type="button"
          onClick={() => { setMode("buy"); setPropertyId(""); setCounterpartyId(""); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === "buy" ? "bg-sky-600 text-white" : "border border-slate-300"}`}
        >
          {t("tradePanel.modeBuy")}
        </button>
      </div>
      {eligible.length === 0 ? (
        <p className="text-sm text-slate-500 italic">{t("tradePanel.noEligible")}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600 block mb-1">{t("tradePanel.property")}</span>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t("tradePanel.selectProperty")}</option>
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>
                  {getPropertyLabel(p.name)}
                  {mode === "buy" && p.ownerTeamId
                    ? ` (${getTeamNameLabel(state.teams.find((tv) => tv.team.id === p.ownerTeamId)?.team.name ?? "")})`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {mode === "sell" ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-600 block mb-1">{t("tradePanel.counterparty")}</span>
              <select
                value={counterpartyId}
                onChange={(e) => setCounterpartyId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">{t("tradePanel.selectTeam")}</option>
                {otherTeams.map((tv) => (
                  <option key={tv.team.id} value={tv.team.id}>
                    {getTeamNameLabel(tv.team.name)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="text-xs font-medium text-slate-600 block mb-1">{t("tradePanel.counterparty")}</span>
              <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700">
                {ownerForBuy
                  ? getTeamNameLabel(state.teams.find((tv) => tv.team.id === ownerForBuy)?.team.name ?? "")
                  : "—"}
              </div>
            </label>
          )}
          <label className="block md:col-span-2">
            <span className="text-xs font-medium text-slate-600 block mb-1">{t("tradePanel.price")}</span>
            <input
              type="number"
              value={price || ""}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              min={1}
              step={1}
            />
          </label>
        </div>
      )}
      {eligible.length > 0 && (
        <button
          type="button"
          onClick={propose}
          disabled={busy || !propertyId || price <= 0}
          className="mt-3 bg-sky-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-sky-700 disabled:opacity-50"
        >
          {busy ? t("tradePanel.proposing") : t("tradePanel.propose")}
        </button>
      )}
    </div>
  );
}
