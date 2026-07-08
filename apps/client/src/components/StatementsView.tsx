import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { getAccountLabel, getTeamNameLabel, getJournalDescription } from "@amono/shared/i18n";
import type { TeamView, StatementsView } from "../api.js";

type StmtTab = "statements" | "arap";

export default function StatementsView({
  gameId,
  teamView,
  difficulty,
  refreshKey,
}: {
  gameId: string;
  teamView: TeamView;
  difficulty: "cash" | "accrual";
  refreshKey?: string;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<StatementsView | null>(null);
  const [arap, setArap] = useState<{ rows: { type: "receivable" | "payable"; otherTeam: string | null; amount: number; source: string; status: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StmtTab>("statements");
  const [year, setYear] = useState(teamView.team.currentYear);
  const userPickedYear = useRef(false);

  useEffect(() => {
    userPickedYear.current = false;
    setYear(teamView.team.currentYear);
  }, [teamView.team.currentYear]);

  useEffect(() => {
    setData(null);
    setArap(null);
    setError(null);
    api.statements(gameId, teamView.team.id, year).then(setData).catch((e) => setError((e as Error).message));
    if (difficulty === "accrual") {
      api.arapSchedule(gameId, teamView.team.id).then(setArap).catch((e) => setError((e as Error).message));
    }
  }, [gameId, teamView.team.id, difficulty, refreshKey, year]);

  // After year-end, currentYear advances to an empty new year — default to the last closed year.
  useEffect(() => {
    if (!data || userPickedYear.current) return;
    if (year !== teamView.team.currentYear) return;
    if (teamView.team.currentYear <= 1) return;
    const empty = data.income.revenue.length === 0 && data.income.expenses.length === 0;
    if (empty) setYear(teamView.team.currentYear - 1);
  }, [data, year, teamView.team.currentYear]);

  if (error) return <div className="text-red-600 p-4">{error}</div>;
  if (!data) return <div className="p-4">{t("statementsView.loading")}</div>;

  const { income, balanceSheet: bs, cashSummary: cash } = data;

  return (
    <div className="space-y-4">
      {teamView.team.currentYear > 1 && tab === "statements" && (
        <div className="flex items-center gap-2">
          <label htmlFor="stmt-year" className="text-sm text-slate-600">
            {t("statementsView.year")}
          </label>
          <select
            id="stmt-year"
            value={year}
            onChange={(e) => {
              userPickedYear.current = true;
              setYear(Number(e.target.value));
            }}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {Array.from({ length: teamView.team.currentYear }, (_, i) => i + 1).map((y) => (
              <option key={y} value={y}>
                {t("statementsView.year")} {y}
              </option>
            ))}
          </select>
        </div>
      )}
      {difficulty === "accrual" && (
        <div className="flex gap-2">
          <button
            onClick={() => setTab("statements")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "statements" ? "bg-slate-800 text-white" : "bg-white border border-slate-300"
            }`}
          >
            {t("statementsView.financialStatements")}
          </button>
          <button
            onClick={() => setTab("arap")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "arap" ? "bg-slate-800 text-white" : "bg-white border border-slate-300"
            }`}
          >
            {t("statementsView.arapSchedule")}
          </button>
        </div>
      )}

      {tab === "arap" && difficulty === "accrual" && (
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-bold text-lg mb-3">{t("statementsView.arapTitle", { teamName: getTeamNameLabel(teamView.team.name) })}</h2>
          {!arap ? (
            <div className="text-slate-500 text-sm">{t("statementsView.loadingSchedule")}</div>
          ) : arap.rows.length === 0 ? (
            <div className="text-slate-400 text-sm">{t("statementsView.noOpenArAp")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4">{t("statementsView.type")}</th>
                    <th className="py-2 pr-4">{t("statementsView.otherTeam")}</th>
                    <th className="py-2 pr-4">{t("statementsView.amount")}</th>
                    <th className="py-2 pr-4">{t("statementsView.source")}</th>
                    <th className="py-2">{t("statementsView.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {arap.rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 pr-4 capitalize">{row.type === "receivable" ? t("statementsView.ar") : t("statementsView.ap")}</td>
                      <td className="py-2 pr-4">{row.otherTeam ?? t("common.notApplicable")}</td>
                      <td className="py-2 pr-4 font-mono">${row.amount}</td>
                      <td className="py-2 pr-4">{row.source}</td>
                      <td className="py-2">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "statements" && (
        <>
      <div className="bg-white rounded-2xl shadow p-5">
        <h2 className="font-bold text-lg mb-3">{t("statementsView.incomeStatement", { teamName: getTeamNameLabel(teamView.team.name) })}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-semibold text-slate-500 uppercase text-xs mb-1">{t("statementsView.revenue")}</div>
            {income.revenue.length === 0 && <div className="text-slate-400">{t("statementsView.emptySection")}</div>}
            {income.revenue.map((r) => (
              <Row key={r.accountName} label={getAccountLabel(r.accountName)} value={r.amount} />
            ))}
            <Row label={t("statementsView.totalRevenue")} value={income.totalRevenue} strong />
          </div>
          <div>
            <div className="font-semibold text-slate-500 uppercase text-xs mb-1">{t("statementsView.expenses")}</div>
            {income.expenses.length === 0 && <div className="text-slate-400">{t("statementsView.emptySection")}</div>}
            {income.expenses.map((e) => (
              <Row key={e.accountName} label={getAccountLabel(e.accountName)} value={e.amount} />
            ))}
            <Row label={t("statementsView.totalExpenses")} value={income.totalExpenses} strong />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t">
          <Row label={t("statementsView.netIncome")} value={income.netIncome} strong big />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">{t("statementsView.balanceSheet")}</h2>
          <span className={`text-xs px-2 py-1 rounded-full ${bs.balances ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
            {bs.balances ? t("statementsView.balances") : t("statementsView.doesNotBalance")}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <Section title={t("statementsView.assets")} rows={bs.assets} total={bs.totalAssets} />
          <Section title={t("statementsView.liabilities")} rows={bs.liabilities} total={bs.totalLiabilities} />
          <Section title={t("statementsView.equity")} rows={bs.equity} total={bs.totalEquity} />
        </div>
        <div className="mt-3 pt-3 border-t flex justify-between font-semibold">
          <span>{t("statementsView.balanceCheck")}</span>
          <span>{t("statementsView.balanceValues", { assets: bs.totalAssets, liabilitiesAndEquity: bs.totalLiabilitiesAndEquity })}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5">
        <h2 className="font-bold text-lg mb-3">{t("statementsView.cashSummary")}</h2>
        <div className="text-sm space-y-1">
          <Row label={t("statementsView.beginningCash")} value={cash.beginning} />
          {cash.inflows.map((c, i) => (
            <Row
              key={`in${i}`}
              label={t("statementsView.inflow", {
                description: getJournalDescription({
                  description: c.description,
                  descriptionParams: c.descriptionParams,
                }),
              })}
              value={c.amount}
              positive
            />
          ))}
          {cash.outflows.map((c, i) => (
            <Row
              key={`out${i}`}
              label={t("statementsView.outflow", {
                description: getJournalDescription({
                  description: c.description,
                  descriptionParams: c.descriptionParams,
                }),
              })}
              value={-c.amount}
            />
          ))}
          <div className="pt-2 mt-2 border-t">
            <Row label={t("statementsView.endingCash")} value={cash.ending} strong big />
          </div>
        </div>
      </div>
        </>
      )}
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
  const { t } = useTranslation();
  return (
    <div>
      <div className="font-semibold text-slate-500 uppercase text-xs mb-1">{title}</div>
      {rows.length === 0 && <div className="text-slate-400">{t("statementsView.emptySection")}</div>}
      {rows.map((r) => (
        <Row
          key={r.accountName}
          label={r.accountName === "Current Year Net Income" ? t("statements.currentYearNetIncome") : getAccountLabel(r.accountName)}
          value={r.amount}
        />
      ))}
      <Row label={`${t("common.total")} ${title}`} value={total} strong />
    </div>
  );
}
