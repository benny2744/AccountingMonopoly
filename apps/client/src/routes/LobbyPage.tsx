import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type RoomLookup, type LanInfo } from "../api.js";

export default function LobbyPage() {
  const navigate = useNavigate();
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const [room, setRoom] = useState<RoomLookup | null>(null);
  const [lan, setLan] = useState<LanInfo | null>(null);
  const [teacherPin, setTeacherPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.lookupRoom(roomCode).then(setRoom).catch((e) => setError((e as Error).message));
    api.lanInfo().then(setLan).catch(() => undefined);
    const id = setInterval(() => {
      api.lookupRoom(roomCode).then(setRoom).catch(() => undefined);
    }, 3000);
    return () => clearInterval(id);
  }, [roomCode]);

  async function start(override = false) {
    setBusy(true);
    setError(null);
    try {
      await api.startGame(room!.gameId, teacherPin, override);
      navigate(`/teacher/${roomCode}`);
    } catch (e) {
      setError((e as Error).message);
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

  if (error && !room) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!room) return <div className="p-8">Loading lobby…</div>;

  const s = room.settings;

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Lobby — {room.difficulty === "cash" ? "Cash Basis" : "Accrual Basis"}</h1>
      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-slate-500 uppercase tracking-wide">Room code</div>
            <div className="font-mono font-bold text-5xl tracking-widest">{room.roomCode}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-500">Join URL</div>
            <button onClick={copy} className="font-mono text-sm bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200">
              {copied ? "Copied!" : joinUrl}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="font-semibold mb-3">Settings</h2>
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
          <div>Starting cash: ${s.startingCash}</div>
          <div>Loan limit: ${s.startingLoanLimit}</div>
          <div>Property allocation: {Math.round(s.propertyAllocationRatio * 100)}%</div>
          <div>Teams joined: {joinedTeams} / {room.teams.length}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="font-semibold mb-3">Teams</h2>
        <div className="grid grid-cols-2 gap-3">
          {room.teams.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 p-3 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full" style={{ background: t.color }} />
              <span className="font-semibold flex-1">{t.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${t.joinedCount > 0 ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}>
                {t.joinedCount > 0 ? `${t.joinedCount} joined` : "waiting"}
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-500 mt-3">
          Students pick their team at <code>/join/{roomCode}</code>. Multiple students can share one team.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="font-semibold mb-3">Start the game</h2>
        {!canStart && (
          <div className="mb-3 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            Need at least 2 teams with a student joined ({joinedTeams} joined). You can start anyway for a demo.
          </div>
        )}
        <label className="block mb-3">
          <span className="text-sm font-medium text-slate-600 block mb-1">Re-enter teacher PIN to start</span>
          <input className="input" value={teacherPin} onChange={(e) => setTeacherPin(e.target.value)} />
        </label>
        <button
          onClick={() => start(false)}
          disabled={busy || teacherPin.length === 0 || !canStart}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start Game →"}
        </button>
        {!canStart && (
          <button
            onClick={() => start(true)}
            disabled={busy || teacherPin.length === 0}
            className="w-full mt-2 border border-slate-300 text-slate-700 py-3 rounded-lg font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            Start anyway (demo override)
          </button>
        )}
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
      </div>
      <style>{`.input{border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.5rem 0.75rem;width:100%}`}</style>
    </div>
  );
}
