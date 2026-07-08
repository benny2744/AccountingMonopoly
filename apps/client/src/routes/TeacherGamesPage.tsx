import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, saveSession, type GameState } from "../api.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { LanguageToggle } from "../i18n/LanguageToggle.js";
import { getDifficultyLabel, getGameStatusLabel } from "@amono/shared/i18n";
import { addTeacherRoom, loadTeacherRooms, removeTeacherRoom, type TeacherRoomEntry } from "../teacherRooms.js";
import { anyStuckTeam } from "../utils/stuckTeam.js";

type CardData = TeacherRoomEntry & {
  lookup?: Awaited<ReturnType<typeof api.lookupRoom>>;
  state?: GameState;
  error?: string;
};

const POLL_MS = 5000;

export default function TeacherGamesPage() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<TeacherRoomEntry[]>(() => loadTeacherRooms());
  const [cards, setCards] = useState<CardData[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refreshCards = useCallback(async () => {
    const list = loadTeacherRooms();
    setRooms(list);
    const next: CardData[] = await Promise.all(
      list.map(async (entry) => {
        try {
          const lookup = await api.lookupRoom(entry.roomCode);
          let state: GameState | undefined;
          try {
            state = await api.getState(lookup.gameId);
          } catch {
            state = undefined;
          }
          return { ...entry, gameId: lookup.gameId, lookup, state };
        } catch (e) {
          return { ...entry, error: (e as Error).message };
        }
      }),
    );
    setCards(next);
  }, []);

  useEffect(() => {
    void refreshCards();
    const id = setInterval(() => void refreshCards(), POLL_MS);
    return () => clearInterval(id);
  }, [refreshCards]);

  async function addExistingRoom() {
    setAdding(true);
    setAddError(null);
    try {
      const code = roomCode.trim().toUpperCase();
      const { sessionToken, gameId } = await api.teacherJoin(code);
      saveSession(sessionToken, gameId);
      addTeacherRoom({ roomCode: code, gameId, label: code });
      setRoomCode("");
      await refreshCards();
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  function dropRoom(code: string) {
    removeTeacherRoom(code);
    void refreshCards();
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t("teacherGamesPage.title")}</h1>
            <p className="text-slate-600 text-sm mt-1">{t("teacherGamesPage.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <LanguageToggle />
            <Link
              to="/create"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              {t("teacherGamesPage.createNew")}
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold mb-3">{t("teacherGamesPage.addExisting")}</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="block">
              <span className="text-xs text-slate-500">{t("teacherGamesPage.roomCode")}</span>
              <input
                className="input mt-1 block w-32 uppercase"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                maxLength={5}
              />
            </label>
            <button
              type="button"
              onClick={() => void addExistingRoom()}
              disabled={adding || roomCode.trim().length < 4}
              className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium disabled:opacity-50"
            >
              {adding ? t("teacherGamesPage.adding") : t("teacherGamesPage.addButton")}
            </button>
          </div>
          {addError && <p className="text-red-600 text-sm mt-2">{addError}</p>}
        </div>

        {rooms.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-8 text-center text-slate-500">
            {t("teacherGamesPage.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cards.map((card) => (
              <GameCard key={card.roomCode} card={card} onRemove={() => dropRoom(card.roomCode)} t={t} />
            ))}
          </div>
        )}
      </div>
      <style>{`.input{border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.5rem 0.75rem}`}</style>
    </div>
  );
}

function GameCard({
  card,
  onRemove,
  t,
}: {
  card: CardData;
  onRemove: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const lookup = card.lookup;
  const state = card.state;
  const currentTeam = state?.teams.find((tv) => tv.team.id === state.game.currentTeamId);
  const stuck = state ? anyStuckTeam(state) : null;

  return (
    <div className="bg-white rounded-2xl shadow p-5 flex flex-col gap-3">
      <div className="flex justify-between items-start gap-2">
        <div>
          <div className="font-mono text-lg font-bold tracking-wider">{card.roomCode}</div>
          {lookup && (
            <div className="text-xs text-slate-500 mt-0.5">
              {getDifficultyLabel(lookup.difficulty)} · {getGameStatusLabel(lookup.status)}
            </div>
          )}
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-slate-400 hover:text-red-600">
          {t("teacherGamesPage.remove")}
        </button>
      </div>

      {card.error && <p className="text-red-600 text-sm">{card.error}</p>}

      {lookup && (
        <div className="text-sm text-slate-600 space-y-1">
          <div>
            {t("teacherGamesPage.teamsJoined", { joined: lookup.joinedTeams, total: lookup.teams.length })}
          </div>
          {state && (
            <>
              <div>
                {t("teacherGamesPage.turn", { turn: state.game.currentTurnNumber })}
                {currentTeam ? ` · ${currentTeam.team.name}` : ""}
              </div>
              {stuck && (
                <div
                  className={`text-xs font-medium px-2 py-1 rounded inline-block ${
                    stuck.severity === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {stuck.teamName}: {stuck.label}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Link
        to={`/teacher/${card.roomCode}`}
        className="mt-auto text-center py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
      >
        {t("teacherGamesPage.openDashboard")}
      </Link>
    </div>
  );
}
