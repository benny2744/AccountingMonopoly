import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api, saveSession } from "../api.js";
import { addTeacherRoom } from "../teacherRooms.js";
import { useGameStore } from "../store.js";
import { useRoomConnection } from "../hooks/useRoomConnection.js";
import { useTranslation } from "../i18n/useTranslation.js";
import {
  t,
  getTeamNameLabel,
  getGameStatusLabel,
  getDifficultyLabel,
} from "@amono/shared/i18n";
import Board from "../components/Board.js";
import Sidebar from "../components/Sidebar.js";
import Leaderboard from "../components/Leaderboard.js";
import TAccountsView from "../components/TAccountsView.js";
import StatementsView from "../components/StatementsView.js";
import PropertiesView from "../components/PropertiesView.js";
import { stuckInfo } from "../utils/stuckTeam.js";
import type { TeamView } from "../api.js";

type Tab = "overview" | "properties" | "taccounts" | "statements";

export default function TeacherDashboard() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { t } = useTranslation();
  const { loading, error } = useRoomConnection(roomCode, "teacher");
  const { state } = useGameStore();
  const setSocketError = useGameStore((s) => s.setSocketError);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <div className="p-8 text-red-600">{t("teacherDashboard.error", { error })}</div>;
  if (loading || !state) return <div className="p-8">{t("teacherDashboard.connecting", { roomCode })}</div>;

  const currentTeam = state.teams.find((t) => t.team.id === state.game.currentTeamId) ?? null;
  const selectedTeam: TeamView | null =
    state.teams.find((t) => t.team.id === selectedTeamId) ?? currentTeam ?? state.teams[0]!;

  async function ctl(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      // State arrives via socket broadcast.
    } catch (e) {
      setSocketError({ code: "ERROR", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("teacherDashboard.overviewTab") },
    { key: "properties", label: t("teacherDashboard.propertiesTab") },
    { key: "taccounts", label: t("teacherDashboard.tAccountsTab") },
    { key: "statements", label: t("teacherDashboard.statementsTab") },
  ];

  return (
    <div className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <Link to="/games" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-1 inline-block">
            ← {t("teacherDashboard.myGames")}
          </Link>
          <h1 className="text-xl font-bold">{t("teacherDashboard.title")}</h1>
          <div className="text-sm text-slate-500">
            {t("teacherDashboard.room")} <span className="font-mono font-semibold">{state.game.roomCode}</span> ·{" "}
            {getGameStatusLabel(state.game.status)} · {t("teacherDashboard.turn", { turnNumber: state.game.currentTurnNumber })}
            {currentTeam && <> · {getTeamNameLabel(currentTeam.team.name)}{t("teacherDashboard.turnSuffix")}</>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => ctl(() => (state.game.status === "paused" ? api.resume(state.game.id) : api.pause(state.game.id)))}
            disabled={busy}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {state.game.status === "paused" ? t("teacherDashboard.resume") : t("teacherDashboard.pause")}
          </button>
          <button
            onClick={() => ctl(() => api.forceNextTurn(state.game.id))}
            disabled={busy}
            className="bg-slate-700 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {t("teacherDashboard.forceNextTurn")}
          </button>
          <button
            onClick={() => {
              if (!confirm(t("teacherDashboard.revealConfirm"))) return;
              ctl(() => api.revealAnswer(state.game.id));
            }}
            disabled={busy || !state.pending || state.pending.status !== "awaiting_journal"}
            className="bg-rose-600 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            title={t("teacherDashboard.revealTooltip")}
          >
            {t("teacherDashboard.revealAnswer")}
          </button>
          <a
            href={api.exportUrl(state.game.id, "csv")}
            className="bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 inline-flex items-center"
            title={t("teacherDashboard.exportCsvTooltip")}
          >
            {t("teacherDashboard.exportCsv")}
          </a>
          <a
            href={api.exportUrl(state.game.id, "json")}
            className="bg-emerald-100 text-emerald-900 px-4 py-2 rounded-lg font-medium hover:bg-emerald-200 inline-flex items-center"
            title={t("teacherDashboard.exportJsonTooltip")}
          >
            {t("teacherDashboard.exportJson")}
          </a>
          {state.game.status !== "ended" ? (
            <button
              onClick={() => {
                if (confirm(t("teacherDashboard.endGameConfirm"))) ctl(() => api.endGame(state.game.id));
              }}
              disabled={busy}
              className="bg-red-700 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {t("teacherDashboard.endGame")}
            </button>
          ) : (
            <button
              onClick={() => {
                const pin = prompt(t("teacherDashboard.clonePinPrompt"), "1234");
                if (pin) ctl(async () => {
                  const { game, sessionToken } = await api.cloneGame(state.game.id, pin);
                  saveSession(sessionToken, game.id);
                  addTeacherRoom({ roomCode: game.roomCode, gameId: game.id, label: game.roomCode });
                  window.location.href = `/lobby/${game.roomCode}`;
                });
              }}
              disabled={busy}
              className="bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {t("teacherDashboard.playAgain")}
            </button>
          )}
        </div>
      </header>

      {state.game.status === "paused" && (
        <div className="mb-4 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg p-3 font-medium">
          {t("teacherDashboard.pausedBanner")}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === tabItem.key ? "bg-slate-800 text-white" : "bg-white border border-slate-300"
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
          <div className="space-y-4">
            <Board state={state} />
            <TeamTable state={state} />
            {(state.game.settings.showScores ?? true) && <Leaderboard state={state} showScores={state.game.settings.showScores ?? true} />}
            {state.game.difficulty === "accrual" && <CreditLimitPanel state={state} onError={setSocketError} />}
            <YearEndTriggerPanel state={state} onError={setSocketError} />
          </div>
          <Sidebar state={state} selectedTeamId={selectedTeam?.team.id ?? null} onSelectTeam={setSelectedTeamId} />
        </div>
      )}
      {tab === "properties" && selectedTeam && (
        <PropertiesView state={state} teamView={selectedTeam} />
      )}
      {tab === "taccounts" && selectedTeam && (
        <TAccountsView
          gameId={state.game.id}
          teamView={selectedTeam}
          refreshKey={`${state.game.updatedAt ?? ""}-${state.game.currentTurnNumber}`}
        />
      )}
      {tab === "statements" && selectedTeam && (
        <StatementsView
          gameId={state.game.id}
          teamView={selectedTeam}
          difficulty={state.game.difficulty}
          refreshKey={`${state.game.updatedAt ?? ""}-${state.game.currentTurnNumber}`}
        />
      )}
      {(tab === "properties" || tab === "taccounts" || tab === "statements") && (
        <TeamPicker state={state} selectedTeamId={selectedTeam?.team.id ?? null} onSelect={setSelectedTeamId} />
      )}
    </div>
  );
}

function TeamTable({ state }: { state: import("../api.js").GameState }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-3">{t("teacherDashboard.teamsHeader")}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2">{t("teacherDashboard.teamColumn")}</th>
            <th className="py-2 text-right">{t("teacherDashboard.cashColumn")}</th>
            <th className="py-2 text-right">{t("teacherDashboard.loanColumn")}</th>
            <th className="py-2 text-right">{t("teacherDashboard.propsColumn")}</th>
            <th className="py-2 text-right">{t("teacherDashboard.positionColumn")}</th>
            <th className="py-2 text-right">{t("teacherDashboard.stuckColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {state.teams.map((tv) => {
            const isCurrent = state.game.currentTeamId === tv.team.id;
            const stuck = stuckInfo(state, tv.team.id);
            return (
              <tr key={tv.team.id} className={`border-b ${isCurrent ? "bg-amber-50" : ""}`}>
                <td className="py-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: tv.team.color }} />
                  {getTeamNameLabel(tv.team.name)}
                  {isCurrent && <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 rounded">{t("teacherDashboard.turnBadge")}</span>}
                </td>
                <td className="py-2 text-right">${tv.cash}</td>
                <td className="py-2 text-right">${tv.loanPayable}</td>
                <td className="py-2 text-right">{tv.propertyCount}</td>
                <td className="py-2 text-right">{tv.team.position}</td>
                <td className="py-2 text-right">
                  {stuck ? (
                    <span className={`text-xs px-2 py-0.5 rounded ${stuck.severity === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`} title={stuck.label}>
                      {t("teacherDashboard.stuckMinutes", { minutes: stuck.minutes })}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamPicker({
  state,
  selectedTeamId,
  onSelect,
}: {
  state: import("../api.js").GameState;
  selectedTeamId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {state.teams.map((tv) => (
        <button
          key={tv.team.id}
          onClick={() => onSelect(tv.team.id)}
          className={`px-3 py-1.5 rounded-lg border text-sm ${
            selectedTeamId === tv.team.id ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-300"
          }`}
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: tv.team.color }} />
          {getTeamNameLabel(tv.team.name)}
        </button>
      ))}
    </div>
  );
}

/** Phase 4 §6: teacher override of per-team credit limit (accrual only). */
function CreditLimitPanel({
  state,
  onError,
}: {
  state: import("../api.js").GameState;
  onError: (e: { code: string; message: string }) => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-3">{t("teacherDashboard.creditLimitOverride")}</h2>
      <div className="space-y-2">
        {state.teams.map((tv) => (
          <CreditLimitRow
            key={tv.team.id}
            gameId={state.game.id}
            teamId={tv.team.id}
            name={tv.team.name}
            color={tv.team.color}
            current={tv.team.creditLimit}
            onError={onError}
          />
        ))}
      </div>
    </div>
  );
}

function CreditLimitRow({
  gameId,
  teamId,
  name,
  color,
  current,
  onError,
}: {
  gameId: string;
  teamId: string;
  name: string;
  color: string;
  current: number;
  onError: (e: { code: string; message: string }) => void;
}) {
  const [val, setVal] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setVal(current), [current]);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
      <span className="flex-1">{getTeamNameLabel(name)}</span>
      <span className="text-slate-400 text-xs">{t("teacherDashboard.currentLimit", { current })}</span>
      <input
        type="number"
        value={val}
        onChange={(e) => setVal(Number(e.target.value))}
        className="border border-slate-300 rounded-lg px-2 py-1 w-24"
      />
      <button
        onClick={async () => {
          setBusy(true);
          try {
            await api.setCreditLimit(gameId, teamId, val);
          } catch (e) {
            onError({ code: "ERROR", message: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy || val === current}
        className="bg-slate-700 text-white px-3 py-1 rounded-lg text-xs disabled:opacity-50"
      >
        {t("teacherDashboard.setButton")}
      </button>
    </div>
  );
}

/** Phase 4 §6: teacher can manually trigger year-end for any team. */
function YearEndTriggerPanel({
  state,
  onError,
}: {
  state: import("../api.js").GameState;
  onError: (e: { code: string; message: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-3">{t("teacherDashboard.triggerYearEnd")}</h2>
      <div className="flex flex-wrap gap-2">
        {state.teams.map((tv) => (
          <button
            key={tv.team.id}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.startYearEnd(state.game.id, tv.team.id);
              } catch (e) {
                onError({ code: "ERROR", message: (e as Error).message });
              } finally {
                setBusy(false);
              }
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: tv.team.color }} />
            {getTeamNameLabel(tv.team.name)}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-2">
        {t("teacherDashboard.triggerYearEndHint")}
      </p>
    </div>
  );
}
