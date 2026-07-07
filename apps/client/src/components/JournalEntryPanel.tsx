import { useState } from "react";
import { api } from "../api.js";
import { useGameStore } from "../store.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { getChartOfAccounts } from "@amono/shared/accounting";
import {
  getAccountLabel,
  getAccountTypeLabel,
  getNormalBalanceLabel,
  getJournalDescription,
  getEntryDescription,
} from "@amono/shared/i18n";
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
  const { t } = useTranslation();
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
      const text = typeof r.text === "string" ? r.text : getEntryDescription((r.text as any).key, (r.text as any).params);
      setHintText(text);
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
      setFeedback({ ok: false, text: t("journalEntryPanel.pickAccounts") });
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
        <h2 className="font-bold text-lg">{t("journalEntryPanel.title")}</h2>
        <button
          onClick={() => setAmount(expectedAmount)}
          className="text-xs text-indigo-600 underline"
          title={t("journalEntryPanel.fillAmountTooltip")}
        >
          {t("journalEntryPanel.fillAmount", { amount: expectedAmount })}
        </button>
      </div>
      <p className="text-sm text-slate-600 mb-3 bg-slate-50 rounded p-2">
        {expected ? getJournalDescription(expected) : t("journalEntryPanel.defaultDescription")}
      </p>
      {cashShort && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-sm font-semibold text-amber-900 mb-1">
            {t("journalEntryPanel.cashShort", { cash: currentTeam.cash, amount: expectedAmount })}
          </div>
          <div className="text-xs text-amber-800 mb-2">{t("journalEntryPanel.takeLoanFirst")}</div>
          <div className="flex items-center gap-2">
            <span className="text-sm">$</span>
            <input
              type="number"
              value={loanAmount || ""}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 w-32"
              aria-label={t("journalEntryPanel.amountLabel")}
            />
            <button
              onClick={takeLoanForFee}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
            >
              {t("journalEntryPanel.takeLoan")}
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AccountSelect label={t("journalEntryPanel.debit")} value={debit} onChange={setDebit} difficulty={difficulty} />
        <AccountSelect label={t("journalEntryPanel.credit")} value={credit} onChange={setCredit} difficulty={difficulty} />
        <label className="block">
          <span className="text-xs font-medium text-slate-600 block mb-1">{t("journalEntryPanel.amountLabel")}</span>
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
                  {getAccountLabel(c.accountName)}: {c.before} → {c.after}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button onClick={submit} className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-indigo-700">
          {t("journalEntryPanel.submitEntry")}
        </button>
        <button
          onClick={showNextHint}
          disabled={hintLevel >= 4}
          className="border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 rounded-lg font-medium hover:bg-amber-100 disabled:opacity-50"
          title={hintLevel === 0 ? t("journalEntryPanel.hintTooltip") : t("journalEntryPanel.hintLevelTooltip", { level: hintLevel })}
        >
          {hintLevel === 0 ? t("journalEntryPanel.hint") : hintLevel >= 4 ? t("journalEntryPanel.hintsUsed") : t("journalEntryPanel.hintCount", { level: hintLevel })}
        </button>
        <button
          onClick={() => { setDebit(""); setCredit(""); setAmount(0); setFeedback(null); setHintLevel(0); setHintText(null); }}
          className="border border-slate-300 px-4 py-2 rounded-lg"
        >
          {t("journalEntryPanel.clear")}
        </button>
      </div>
      {hintText && (
        <div className="mt-3 rounded-lg p-3 text-sm bg-amber-50 border border-amber-200 text-amber-900">
          <div className="font-semibold mb-1">{t("journalEntryPanel.hintLevelTooltip", { level: hintLevel })}</div>
          {hintText}
          {hintGated && <div className="text-xs mt-1 italic">{t("journalEntryPanel.fullHintGated")}</div>}
        </div>
      )}
    </div>
  );
}

function AccountSelect({ label, value, onChange, difficulty }: { label: string; value: string; onChange: (v: string) => void; difficulty: Difficulty }) {
  const { t } = useTranslation();
  const list = getChartOfAccounts(difficulty);
  const grouped: Record<string, { name: string; type: AccountType }[]> = {
    [t("journalEntryPanel.accountGroups.assets")]: list.filter((a) => a.type === "asset"),
    [t("journalEntryPanel.accountGroups.liabilities")]: list.filter((a) => a.type === "liability"),
    [t("journalEntryPanel.accountGroups.equity")]: list.filter((a) => a.type === "equity"),
    [t("journalEntryPanel.accountGroups.revenue")]: list.filter((a) => a.type === "revenue"),
    [t("journalEntryPanel.accountGroups.expenses")]: list.filter((a) => a.type === "expense"),
  };
  // Normal balance caption: assets & expenses are debit-normal; the rest are credit-normal.
  const normalSide = (t: AccountType): "debit" | "credit" => (t === "asset" || t === "expense" ? "debit" : "credit");
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 block mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2">
        <option value="">{t("journalEntryPanel.selectAccount")}</option>
        {Object.entries(grouped).map(([group, accs]) => (
          <optgroup key={group} label={group}>
            {accs.map((a) => (
              <option key={a.name} value={a.name}>
                {t("journalEntryPanel.accountOption", { name: getAccountLabel(a.name), side: getNormalBalanceLabel(normalSide(a.type)) })}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
