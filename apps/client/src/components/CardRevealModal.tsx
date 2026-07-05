import { useEffect, useState } from "react";
import type { PendingAction } from "../api.js";

/**
 * Client-only reveal modal for event-card draws. The pending action already
 * arrives in `awaiting_journal` with the card stored at `payload.card`; this
 * modal surfaces the card's narrative (title / description / teaching point)
 * before the journal panel takes over. Dismiss state is keyed by pending id
 * so a new card always re-shows.
 */
export default function CardRevealModal({ pending }: { pending: PendingAction | null | undefined }) {
  const [acknowledged, setAcknowledged] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || pending.kind !== "event_card") return;
    // Reset acknowledgement whenever a new card draw arrives.
    if (acknowledged !== pending.id) setAcknowledged(null);
  }, [pending?.id, pending?.kind]);

  if (!pending || pending.kind !== "event_card" || pending.status !== "awaiting_journal") return null;
  if (acknowledged === pending.id) return null;

  const card = (pending.payload as any)?.card as
    | { title?: string; description?: string; amount?: number; mode?: string; teachingPoint?: string }
    | undefined;
  if (!card) return null;

  const isAccrual = card.mode === "accrual";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div
          className={`px-5 py-3 text-white font-bold text-sm uppercase tracking-wide ${isAccrual ? "bg-purple-600" : "bg-emerald-600"}`}
        >
          {isAccrual ? "Chance (Accrual)" : "Community Chest"}
        </div>
        <div className="p-6">
          <h3 className="text-xl font-bold mb-2">{card.title ?? "Event Card"}</h3>
          {card.description && <p className="text-slate-700 mb-3">{card.description}</p>}
          {!!card.amount && (
            <div className="text-2xl font-mono font-semibold text-indigo-700 mb-3">
              {card.amount > 0 ? "+" : ""}${card.amount}
            </div>
          )}
          {card.teachingPoint && (
            <div className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded p-3 text-slate-600">
              <span className="font-semibold text-slate-700">Teaching point:</span> {card.teachingPoint}
            </div>
          )}
          <button
            onClick={() => setAcknowledged(pending.id)}
            className="mt-5 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg"
          >
            Got it — record entry →
          </button>
        </div>
      </div>
    </div>
  );
}
