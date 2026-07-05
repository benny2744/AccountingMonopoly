import { create } from "zustand";
import { api, type GameState } from "./api.js";

interface GameStore {
  gameId: string | null;
  state: GameState | null;
  error: string | null;
  loading: boolean;
  setGameId: (id: string) => void;
  setState: (s: GameState) => void;
  refresh: () => Promise<void>;
  setError: (e: string | null) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameId: null,
  state: null,
  error: null,
  loading: false,
  setGameId: (id) => set({ gameId: id }),
  setState: (s) => set({ state: s, error: null }),
  setError: (e) => set({ error: e }),
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
