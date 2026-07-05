import { useState } from "react";
import { api } from "../api.js";
import { useGameStore } from "../store.js";
import { getChartOfAccounts } from "@amono/shared/accounting";
import type { Difficulty } from "@amono/shared";
import type { PendingAction, TeamView } from "../api.js";

export default function JournalEntryPanel({
  gameId,
  pending,
  currentTeam,
  difficulty,
}: {
  gameId: string;
  pending: PendingAction;
  currentTeam: TeamView;
  difficulty: Difficulty;
}) {
  const setState = useGameStore((s) => s.setState);
  const [debit, setDebit] = useState("");
  const [credit, setCredit] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const expected = (pending.expectedEntries || []).find((e: any) => e.teamId === currentTeam.team.id) ?? (pending.expectedEntries || [])[0];
  const expectedAmount: number = expected?.lines?.find((l: any) => l.debit > 0)?.debit ?? 0;
  const cashShort = expectedAmount > 0 && currentTeam.cash < expectedAmount;
  const [loanAmount, setLoanAmount] = useState(expectedAmount - currentTeam.cash > 0 ? expectedAmount - currentTeam.cash : 100);

  async function takeLoanForFee() {
    try {
      await api.loanForFee(gameId, currentTeam.team.id, loanAmount);
      // State arrives via socket broadcast; the panel re-renders with new cash.
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    }
  }

  async function submit() {
    if (!debit || !credit || amount <= 0) {
      setFeedback({ ok: false, text: "Pick both accounts and enter a positive amount." });
      return;
    }
    try {
      const { result, state } = await api.submitJournal(gameId, currentTeam.team.id, debit, credit, amount);
      setState(state);
      if (result.correct) {
        setFeedback({ ok: true, text: result.feedback });
        setDebit(""); setCredit(""); setAmount(0);
      } else {
        setFeedback({ ok: false, text: `${result.feedback} (${result.errors.join(", ")})` });
      }
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-5 border-t-4 border-indigo-500">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg">Record this transaction</h2>
        <button
          onClick={() => setAmount(expectedAmount)}
          className="text-xs text-indigo-600 underline"
          title="Fill the expected amount — account choices are still yours"
        >
          use expected amount (${expectedAmount})
        </button>
      </div>
      <p className="text-sm text-slate-600 mb-3 bg-slate-50 rounded p-2">
        {expected?.description ?? "Record a journal entry for this transaction."}
      </p>
      {cashShort && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-sm font-semibold text-amber-900 mb-1">
            Your cash (${currentTeam.cash}) is short for this ${expectedAmount} payment.
          </div>
          <div className="text-xs text-amber-800 mb-2">Take a bank loan first, then submit your journal entry.</div>
          <div className="flex items-center gap-2">
            <span className="text-sm">$</span>
            <input
              type="number"
              value={loanAmount || ""}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 w-32"
            />
            <button
              onClick={takeLoanForFee}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
            >
              Take Loan
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AccountSelect label="Debit (Dr)" value={debit} onChange={setDebit} difficulty={difficulty} />
        <AccountSelect label="Credit (Cr)" value={credit} onChange={setCredit} difficulty={difficulty} />
        <label className="block">
          <span className="text-xs font-medium text-slate-600 block mb-1">Amount ($)</span>
          <input
            type="number"
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
      </div>
      {feedback && (
        <div className={`mt-3 rounded-lg p-3 text-sm ${feedback.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {feedback.text}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button onClick={submit} className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-indigo-700">
          Submit Entry
        </button>
        <button
          onClick={() => { setDebit(""); setCredit(""); setAmount(0); setFeedback(null); }}
          className="border border-slate-300 px-4 py-2 rounded-lg"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function AccountSelect({ label, value, onChange, difficulty }: { label: string; value: string; onChange: (v: string) => void; difficulty: Difficulty }) {
  const list = getChartOfAccounts(difficulty);
  const grouped = {
    Assets: list.filter((a) => a.type === "asset"),
    Liabilities: list.filter((a) => a.type === "liability"),
    Equity: list.filter((a) => a.type === "equity"),
    Revenue: list.filter((a) => a.type === "revenue"),
    Expenses: list.filter((a) => a.type === "expense"),
  };
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 block mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2">
        <option value="">— select —</option>
        {Object.entries(grouped).map(([group, accs]) => (
          <optgroup key={group} label={group}>
            {accs.map((a) => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
