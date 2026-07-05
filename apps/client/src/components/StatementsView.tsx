import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { TeamView, StatementsView } from "../api.js";

export default function StatementsView({ gameId, teamView }: { gameId: string; teamView: TeamView }) {
  const [data, setData] = useState<StatementsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api.statements(gameId, teamView.team.id).then(setData).catch((e) => setError((e as Error).message));
  }, [gameId, teamView.team.id]);

  if (error) return <div className="text-red-600 p-4">{error}</div>;
  if (!data) return <div className="p-4">Loading statements…</div>;

  const { income, balanceSheet: bs, cashSummary: cash } = data;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow p-5">
        <h2 className="font-bold text-lg mb-3">Income Statement — {teamView.team.name}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-semibold text-slate-500 uppercase text-xs mb-1">Revenue</div>
            {income.revenue.length === 0 && <div className="text-slate-400">—</div>}
            {income.revenue.map((r) => (
              <Row key={r.accountName} label={r.accountName} value={r.amount} />
            ))}
            <Row label="Total Revenue" value={income.totalRevenue} strong />
          </div>
          <div>
            <div className="font-semibold text-slate-500 uppercase text-xs mb-1">Expenses</div>
            {income.expenses.length === 0 && <div className="text-slate-400">—</div>}
            {income.expenses.map((e) => (
              <Row key={e.accountName} label={e.accountName} value={e.amount} />
            ))}
            <Row label="Total Expenses" value={income.totalExpenses} strong />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t">
          <Row label="Net Income" value={income.netIncome} strong big />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Balance Sheet</h2>
          <span className={`text-xs px-2 py-1 rounded-full ${bs.balances ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
            {bs.balances ? "Balances ✓" : "Does NOT balance ✗"}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <Section title="Assets" rows={bs.assets} total={bs.totalAssets} />
          <Section title="Liabilities" rows={bs.liabilities} total={bs.totalLiabilities} />
          <Section title="Equity" rows={bs.equity} total={bs.totalEquity} />
        </div>
        <div className="mt-3 pt-3 border-t flex justify-between font-semibold">
          <span>Assets = Liabilities + Equity?</span>
          <span>{bs.totalAssets} = {bs.totalLiabilitiesAndEquity}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5">
        <h2 className="font-bold text-lg mb-3">Cash Summary</h2>
        <div className="text-sm space-y-1">
          <Row label="Beginning Cash" value={cash.beginning} />
          {cash.inflows.map((c, i) => (
            <Row key={`in${i}`} label={`+ ${c.description}`} value={c.amount} positive />
          ))}
          {cash.outflows.map((c, i) => (
            <Row key={`out${i}`} label={`− ${c.description}`} value={-c.amount} />
          ))}
          <div className="pt-2 mt-2 border-t">
            <Row label="Ending Cash" value={cash.ending} strong big />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, big, positive }: { label: string; value: number; strong?: boolean; big?: boolean; positive?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""} ${big ? "text-lg" : ""}`}>
      <span>{label}</span>
      <span className={`font-mono ${positive ? "text-green-700" : ""}`}>{value}</span>
    </div>
  );
}

function Section({ title, rows, total }: { title: string; rows: { accountName: string; amount: number }[]; total: number }) {
  return (
    <div>
      <div className="font-semibold text-slate-500 uppercase text-xs mb-1">{title}</div>
      {rows.length === 0 && <div className="text-slate-400">—</div>}
      {rows.map((r) => (
        <Row key={r.accountName} label={r.accountName} value={r.amount} />
      ))}
      <Row label={`Total ${title}`} value={total} strong />
    </div>
  );
}
