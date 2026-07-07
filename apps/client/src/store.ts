import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { api, clearSession, getStoredSessionToken, type GameState, type SessionInfo } from "./api.js";

export interface SocketError {
  code: string;
  message: string;
  params?: Record<string, unknown>;
  event?: string;
}

interface GameStore {
  gameId: string | null;
  session: SessionInfo | null;
  state: GameState | null;
  error: string | null;
  socketError: SocketError | null;
  connected: boolean;
  loading: boolean;
  socket: Socket | null;

  setGameId: (id: string) => void;
  setState: (s: GameState) => void;
  setError: (e: string | null) => void;
  setSocketError: (e: SocketError | null) => void;
  attachSession: (session: SessionInfo) => void;

  /** Connect Socket.IO and load the first state snapshot. */
  connect: (gameId: string) => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameId: null,
  session: null,
  state: null,
  error: null,
  socketError: null,
  connected: false,
  loading: false,
  socket: null,

  setGameId: (id) => set({ gameId: id }),
  setState: (s) => set({ state: s, error: null }),
  setError: (e) => set({ error: e }),
  setSocketError: (e) => set({ socketError: e }),
  attachSession: (session) => set({ session }),

  connect: async (gameId) => {
    set({ gameId, loading: true, error: null });
    const token = getStoredSessionToken();
    if (token) {
      try {
        const { session } = await api.getSession();
        set({ session });
      } catch (e) {
        const err = e as Error & { status?: number; code?: string };
        if (err.status === 401 || err.code === "NO_SESSION") {
          clearSession();
          set({ session: null });
        }
      }
    }
    try {
      const state = await api.getState(gameId);
      set({ state, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return;
    }
    // Tear down any previous socket.
    get().socket?.disconnect();
    if (!token) return;
    const socket = io({ path: "/socket.io", auth: { token } });
    socket.on("connect", () => set({ connected: true, socketError: null }));
    socket.on("disconnect", () => set({ connected: false }));
    socket.on("connect_error", () => set({ connected: false }));
    socket.on("game:state_updated", (s: GameState) => set({ state: s, error: null }));
    socket.on("game:error", (e: SocketError) => {
      set({ socketError: e });
    });
    socket.connect();
    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    socket?.disconnect();
    set({ socket: null });
  },

  refresh: async () => {
    const { gameId } = get();
    if (!gameId) return;
    set({ loading: true, error: null });
    try {
      const s = await api.getState(gameId);
      set({ state: s, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));

export { api };
