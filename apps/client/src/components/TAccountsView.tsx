import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { TeamView, TAccountRow } from "../api.js";

export default function TAccountsView({
  gameId,
  teamView,
  refreshKey,
}: {
  gameId: string;
  teamView: TeamView;
  refreshKey?: string;
}) {
  const [data, setData] = useState<TAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api.ledger(gameId, teamView.team.id).then((r) => setData(r.tAccounts)).catch((e) => setError((e as Error).message));
  }, [gameId, teamView.team.id, refreshKey]);

  if (error) return <div className="text-red-600 p-4">{error}</div>;
  if (!data) return <div className="p-4">Loading T-accounts…</div>;

  const active = data.filter((t) => t.debits.length > 0 || t.credits.length > 0);

  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <h2 className="font-bold text-lg mb-1">T-Accounts — {teamView.team.name}</h2>
      <p className="text-sm text-slate-500 mb-4">All accounts with activity this game.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {active.map((t) => (
          <div key={t.accountName} className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-2 font-semibold text-sm flex items-center justify-between">
              <span>{t.accountName}</span>
              <span className="text-xs text-slate-500">{t.type}</span>
            </div>
            <div className="grid grid-cols-2 text-xs">
              <div className="border-r border-slate-200">
                <div className="bg-slate-50 px-2 py-1 font-semibold text-slate-500">Debit</div>
                {t.debits.map((d, i) => (
                  <div key={i} className="px-2 py-1 border-t border-slate-100">
                    <div className="font-mono">{d.amount}</div>
                    <div className="text-slate-400 text-[10px]">{d.counterAccountName}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="bg-slate-50 px-2 py-1 font-semibold text-slate-500">Credit</div>
                {t.credits.map((c, i) => (
                  <div key={i} className="px-2 py-1 border-t border-slate-100">
                    <div className="font-mono">{c.amount}</div>
                    <div className="text-slate-400 text-[10px]">{c.counterAccountName}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-3 py-2 bg-indigo-50 text-sm font-semibold flex justify-between">
              <span>Balance</span>
              <span>{t.balance} {t.balanceSide}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
