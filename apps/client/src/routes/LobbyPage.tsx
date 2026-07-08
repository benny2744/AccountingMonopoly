import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, setActiveGameId, type RoomLookup, type LanInfo } from "../api.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { LanguageToggle } from "../i18n/LanguageToggle.js";
import { getDifficultyLabel, getTeamNameLabel } from "@amono/shared/i18n";

export default function LobbyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const [room, setRoom] = useState<RoomLookup | null>(null);
  const [lan, setLan] = useState<LanInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .lookupRoom(roomCode)
      .then((lookup) => {
        setActiveGameId(lookup.gameId);
        setRoom(lookup);
      })
      .catch((e) => setError((e as Error).message));
    api.lanInfo().then(setLan).catch(() => undefined);
    const id = setInterval(() => {
      api
        .lookupRoom(roomCode)
        .then((lookup) => {
          setActiveGameId(lookup.gameId);
          setRoom(lookup);
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(id);
  }, [roomCode]);

  async function start(override = false) {
    setBusy(true);
    setError(null);
    try {
      await api.startGame(room!.gameId, override);
      navigate(`/teacher/${roomCode}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function addTeam() {
    setBusy(true);
    setError(null);
    try {
      await api.addTeam(room!.gameId);
      const fresh = await api.lookupRoom(roomCode);
      setRoom(fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTeam(teamId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.removeTeam(room!.gameId, teamId);
      const fresh = await api.lookupRoom(roomCode);
      setRoom(fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const joinUrl = lan && lan.lanIps[0] ? `http://${lan.lanIps[0]}:${lan.port}/join/${roomCode}` : `/join/${roomCode}`;
  const joinedTeams = room?.joinedTeams ?? 0;
  const canStart = joinedTeams >= 2;

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  }

  if (error && !room) return <div className="p-8 text-red-600">{t("teamDashboard.error", { error })}</div>;
  if (!room) return <div className="p-8">{t("lobbyPage.loading")}</div>;

  const s = room.settings;

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-2xl font-bold">{t("lobbyPage.title", { difficulty: getDifficultyLabel(room.difficulty) })}</h1>
        <LanguageToggle />
      </div>
      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-slate-500 uppercase tracking-wide">{t("lobbyPage.roomCode")}</div>
            <div className="font-mono font-bold text-5xl tracking-widest">{room.roomCode}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-500">{t("lobbyPage.joinUrl")}</div>
            <button onClick={copy} className="font-mono text-sm bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200">
              {copied ? t("common.copied") : joinUrl}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="font-semibold mb-3">{t("lobbyPage.settings")}</h2>
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
          <div>{t("lobbyPage.startingCash", { amount: s.startingCash })}</div>
          <div>{t("lobbyPage.loanLimit", { amount: s.startingLoanLimit })}</div>
          <div>{t("lobbyPage.propertyAllocation", { percent: Math.round(s.propertyAllocationRatio * 100) })}</div>
          <div>{t("lobbyPage.teamsJoined", { joined: joinedTeams, total: room.teams.length })}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{t("lobbyPage.teamsSection", { count: room.teams.length })}</h2>
          <button
            onClick={addTeam}
            disabled={busy || room.teams.length >= 4}
            className="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            ➕ {t("lobbyPage.addTeam")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {room.teams.map((team) => (
            <div key={team.id} className="rounded-lg border border-slate-200 p-3 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full" style={{ background: team.color }} />
              <span className="font-semibold flex-1">{getTeamNameLabel(team.name)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${team.joinedCount > 0 ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}>
                {team.joinedCount > 0 ? t("lobbyPage.joinedCount", { count: team.joinedCount }) : t("lobbyPage.waiting")}
              </span>
              <button
                onClick={() => removeTeam(team.id)}
                disabled={busy || team.joinedCount > 0 || room.teams.length <= 2}
                className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 text-lg leading-none"
                title={
                  team.joinedCount > 0
                    ? t("lobbyPage.cannotRemoveJoined")
                    : room.teams.length <= 2
                    ? t("lobbyPage.needAtLeastTwoTeams")
                    : t("lobbyPage.removeTeam")
                }
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-500 mt-3">
          {t("lobbyPage.instructions", { roomCode })}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="font-semibold mb-3">{t("lobbyPage.startSection")}</h2>
        {!canStart && (
          <div className="mb-3 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            {t("lobbyPage.needStudentsWarning", { joined: joinedTeams })}
          </div>
        )}
        <button
          onClick={() => start(false)}
          disabled={busy || !canStart}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? t("lobbyPage.starting") : t("lobbyPage.startGame")}
        </button>
        {!canStart && (
          <button
            onClick={() => start(true)}
            disabled={busy}
            className="w-full mt-2 border border-slate-300 text-slate-700 py-3 rounded-lg font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {t("lobbyPage.startAnyway")}
          </button>
        )}
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
      </div>
      <style>{`.input{border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.5rem 0.75rem;width:100%}`}</style>
    </div>
  );
}
