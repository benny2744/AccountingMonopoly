import { useMemo, useState } from "react";
import { api } from "../api.js";
import type { GameState } from "../api.js";
import { useGameStore } from "../store.js";

/** Streets eligible for building when the active team owns a full color group. */
export default function BuildPanel({ state, teamId }: { state: GameState; teamId: string }) {
  const setState = useGameStore((s) => s.setState);
  const setSocketError = useGameStore((s) => s.setSocketError);
  const [busy, setBusy] = useState<string | null>(null);

  const eligible = useMemo(() => {
    const owned = state.properties.filter((p) => p.ownerTeamId === teamId && p.kind === "street" && p.houses < 5);
    const groups = new Set(owned.map((p) => p.colorGroup).filter(Boolean) as string[]);
    const fullGroups = [...groups].filter((g) => {
      const inGroup = state.properties.filter((p) => p.colorGroup === g && p.kind === "street");
      return inGroup.every((p) => p.ownerTeamId === teamId && !p.isMortgaged);
    });
    return owned.filter((p) => p.colorGroup && fullGroups.includes(p.colorGroup));
  }, [state.properties, teamId]);

  if (eligible.length === 0) return null;
  if (state.pending) return null;

  async function build(propertyId: string) {
    setBusy(propertyId);
    try {
      const { state: next } = await api.buildHouse(state.game.id, teamId, propertyId);
      setState(next);
    } catch (e) {
      setSocketError({ code: "ERROR", message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4 border-t-4 border-emerald-500">
      <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-2">Build Houses / Hotels</h2>
      <p className="text-xs text-slate-500 mb-3">Own a full color group? Build here before rolling (journal entry required).</p>
      <div className="flex flex-wrap gap-2">
        {eligible.map((p) => (
          <button
            key={p.id}
            onClick={() => build(p.id)}
            disabled={busy === p.id}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-50 text-left"
          >
            <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: p.color }} />
            {p.name}
            <span className="text-slate-400 ml-1">
              ({p.houses === 0 ? "0" : p.houses >= 5 ? "hotel" : `${p.houses}🏠`} → {p.houses === 4 ? "hotel" : "house"}) ${p.houseCost}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
