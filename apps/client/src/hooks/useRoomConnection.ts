import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, useGameStore } from "../store.js";

export type RoomRole = "teacher" | "team" | "display";

/**
 * Hook that resolves a room code to a gameId, connects the socket, and
 * subscribes this client to live state updates. Used by all role dashboards.
 */
export function useRoomConnection(
  roomCode: string,
  expectedRole?: RoomRole,
): {
  loading: boolean;
  error: string | null;
} {
  const navigate = useNavigate();
  const connect = useGameStore((s) => s.connect);
  const disconnect = useGameStore((s) => s.disconnect);
  const setError = useGameStore((s) => s.setError);
  const state = useGameStore((s) => s.state);
  const session = useGameStore((s) => s.session);
  const error = useGameStore((s) => s.error);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const room = await api.lookupRoom(roomCode);
        if (cancelled) return;
        await connect(room.gameId);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  useEffect(() => {
    if (!session || !expectedRole || session.role === expectedRole) return;
    const path =
      session.role === "teacher"
        ? `/teacher/${roomCode}`
        : session.role === "display"
          ? `/display/${roomCode}`
          : `/game/${roomCode}`;
    navigate(path, { replace: true });
  }, [session, expectedRole, roomCode, navigate]);

  return { loading: !state && !error, error };
}
