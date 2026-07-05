import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, saveSession } from "../api.js";
import { useGameStore } from "../store.js";
import type { RoomLookup } from "../api.js";

export default function JoinPage() {
  const navigate = useNavigate();
  const attachSession = useGameStore((s) => s.attachSession);
  const { code: presetCode } = useParams<{ code?: string }>();
  const [code, setCode] = useState(presetCode ?? "");
  const [room, setRoom] = useState<RoomLookup | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (presetCode) lookup(presetCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCode]);

  async function lookup(c: string) {
    setError(null);
    setBusy(true);
    try {
      const r = await api.lookupRoom(c);
      setRoom(r);
    } catch (e) {
      setError((e as Error).message);
      setRoom(null);
    } finally {
      setBusy(false);
    }
  }

  async function joinTeam(teamId: string) {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      const { sessionToken, gameId, teamId: joinedTeamId } = await api.joinTeam(
        room.gameId,
        teamId,
        displayName || undefined,
      );
      saveSession(sessionToken);
      attachSession({
        token: sessionToken,
        gameId,
        role: "team",
        teamId: joinedTeamId,
        displayName: displayName || null,
      });
      navigate(`/game/${room.roomCode}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function joinDisplay() {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      const { sessionToken, gameId } = await api.joinDisplay(room.gameId);
      saveSession(sessionToken);
      attachSession({
        token: sessionToken,
        gameId,
        role: "display",
        teamId: null,
        displayName: "Display",
      });
      navigate(`/display/${room.roomCode}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full">
        <h1 className="text-2xl font-bold mb-6">Join a Room</h1>
        {!room && (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-600 block mb-1">Room code</span>
              <input
                className="input uppercase text-2xl tracking-widest font-mono text-center"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={5}
                placeholder="ABCDE"
              />
            </label>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button
              onClick={() => lookup(code)}
              disabled={busy || code.length < 4}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Looking up…" : "Find Room"}
            </button>
          </div>
        )}
        {room && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">Room</div>
                <div className="font-mono font-bold text-2xl tracking-widest">{room.roomCode}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Mode · Status</div>
                <div className="font-semibold">
                  {room.difficulty === "cash" ? "Cash Basis" : "Accrual Basis"} · {room.status}
                </div>
              </div>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-600 block mb-1">Your name (optional)</span>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Alex" />
            </label>
            <div>
              <div className="text-sm font-medium text-slate-600 mb-2">Pick your team</div>
              <div className="grid grid-cols-2 gap-2">
                {room.teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => joinTeam(t.id)}
                    disabled={busy}
                    className="rounded-lg border border-slate-200 p-3 flex items-center gap-3 hover:bg-slate-50 disabled:opacity-50 text-left"
                  >
                    <span className="w-4 h-4 rounded-full shrink-0" style={{ background: t.color }} />
                    <span className="flex-1">
                      <span className="font-semibold block">{t.name}</span>
                      <span className="text-xs text-slate-500">
                        {t.joinedCount > 0 ? `${t.joinedCount} joined` : "No one yet"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={joinDisplay} disabled={busy} className="w-full text-sm text-slate-500 underline">
              Join as projector / shared display instead
            </button>
            {error && <div className="text-red-600 text-sm">{error}</div>}
          </div>
        )}
      </div>
      <style>{`.input{border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.5rem 0.75rem;width:100%}`}</style>
    </div>
  );
}
