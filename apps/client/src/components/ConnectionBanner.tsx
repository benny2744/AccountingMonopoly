import { useGameStore } from "../store.js";

/** Fixed-position banner shown when the live socket connection drops. */
export default function ConnectionBanner() {
  const socket = useGameStore((s) => s.socket);
  const connected = useGameStore((s) => s.connected);
  if (!socket || connected) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-rose-600 text-white text-center text-sm py-2 px-4 shadow">
      Connection lost — retrying… Your teacher can still see the last known state.
    </div>
  );
}
