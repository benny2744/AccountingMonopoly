import { useState } from "react";
import { api } from "../api.js";
import { useGameStore } from "../store.js";
import { getChartOfAccounts } from "@amono/shared/accounting";
import type { AccountType, Difficulty } from "@amono/shared";
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
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; balanceChanges?: { accountName: string; before: number; after: number }[] } | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintGated, setHintGated] = useState(false);

  async function showNextHint() {
    const next = Math.min(hintLevel + 1, 4);
    if (next > 4) return;
    try {
      const r = await api.hint(gameId, next);
      setHintLevel(r.level);
      setHintText(r.text);
      setHintGated(r.gated);
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    }
  }

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
        setFeedback({ ok: true, text: result.feedback, balanceChanges: result.balanceChanges });
        setDebit(""); setCredit(""); setAmount(0);
        setHintLevel(0); setHintText(null); setHintGated(false);
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
          <div>{feedback.text}</div>
          {feedback.balanceChanges && feedback.balanceChanges.length > 0 && (
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {feedback.balanceChanges.map((c) => (
                <li key={c.accountName}>
                  {c.accountName}: {c.before} → {c.after}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button onClick={submit} className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-indigo-700">
          Submit Entry
        </button>
        <button
          onClick={showNextHint}
          disabled={hintLevel >= 4}
          className="border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 rounded-lg font-medium hover:bg-amber-100 disabled:opacity-50"
          title={hintLevel === 0 ? "Get a hint — levels step from effect → accounts → direction → full answer" : `Hint level ${hintLevel} of 4`}
        >
          {hintLevel === 0 ? "💡 Hint" : hintLevel >= 4 ? "Hints used" : `💡 Hint (${hintLevel}/4)`}
        </button>
        <button
          onClick={() => { setDebit(""); setCredit(""); setAmount(0); setFeedback(null); setHintLevel(0); setHintText(null); }}
          className="border border-slate-300 px-4 py-2 rounded-lg"
        >
          Clear
        </button>
      </div>
      {hintText && (
        <div className="mt-3 rounded-lg p-3 text-sm bg-amber-50 border border-amber-200 text-amber-900">
          <div className="font-semibold mb-1">Hint level {hintLevel} of 4</div>
          {hintText}
          {hintGated && <div className="text-xs mt-1 italic">Full answer is teacher-gated — ask your teacher to reveal it.</div>}
        </div>
      )}
    </div>
  );
}

function AccountSelect({ label, value, onChange, difficulty }: { label: string; value: string; onChange: (v: string) => void; difficulty: Difficulty }) {
  const list = getChartOfAccounts(difficulty);
  const grouped: Record<string, { name: string; type: AccountType }[]> = {
    Assets: list.filter((a) => a.type === "asset"),
    Liabilities: list.filter((a) => a.type === "liability"),
    Equity: list.filter((a) => a.type === "equity"),
    Revenue: list.filter((a) => a.type === "revenue"),
    Expenses: list.filter((a) => a.type === "expense"),
  };
  // Normal balance caption: assets & expenses are debit-normal; the rest are credit-normal.
  const normalSide = (t: AccountType): "Dr" | "Cr" => (t === "asset" || t === "expense" ? "Dr" : "Cr");
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 block mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2">
        <option value="">— select —</option>
        {Object.entries(grouped).map(([group, accs]) => (
          <optgroup key={group} label={`${group} (normal side shown)`}>
            {accs.map((a) => (
              <option key={a.name} value={a.name}>{a.name} · {normalSide(a.type)}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
