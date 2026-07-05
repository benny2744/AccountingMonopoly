import { useGameStore } from "../store.js";

/** Dismissible toast for transient socket/REST errors (NOT_YOUR_TURN, etc.). */
export default function GameErrorToast() {
  const socketError = useGameStore((s) => s.socketError);
  const setSocketError = useGameStore((s) => s.setSocketError);
  if (!socketError) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] max-w-sm">
      <div className="bg-rose-600 text-white rounded-xl shadow-lg px-4 py-3 flex items-start gap-3">
        <div className="flex-1">
          <div className="font-semibold text-sm">{socketError.code}</div>
          <div className="text-sm opacity-90">{socketError.message}</div>
        </div>
        <button
          onClick={() => setSocketError(null)}
          className="text-white/80 hover:text-white text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
