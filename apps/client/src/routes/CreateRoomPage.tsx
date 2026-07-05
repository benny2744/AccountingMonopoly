import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const RATIO_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "25%", value: 0.25 },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
];

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const [teacherPin, setTeacherPin] = useState("1234");
  const [difficulty, setDifficulty] = useState<"cash" | "accrual">("cash");
  const [numberOfTeams, setNumberOfTeams] = useState(4);
  const [ratio, setRatio] = useState<number>(0.5);
  const [startingCash, setStartingCash] = useState(1500);
  const [startingLoanLimit, setStartingLoanLimit] = useState(500);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function submit() {
    setCreating(true);
    setError(null);
    try {
      const { game } = await api.createGame({
        teacherPin,
        difficulty,
        numberOfTeams,
        propertyAllocationRatio: ratio,
        startingCash,
        startingLoanLimit,
      });
      // Auto-start so the teacher can play hot-seat immediately (Phase 2).
      await api.startGame(game.id, teacherPin);
      navigate(`/game/${game.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full">
        <h1 className="text-2xl font-bold mb-6">Create a Room</h1>
        <div className="space-y-4">
          <Field label="Teacher PIN">
            <input className="input" value={teacherPin} onChange={(e) => setTeacherPin(e.target.value)} />
          </Field>
          <Field label="Difficulty">
            <div className="flex gap-3">
              {(["cash", "accrual"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded-lg border font-medium ${
                    difficulty === d ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300"
                  }`}
                >
                  {d === "cash" ? "Cash Basis" : "Accrual Basis"}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Number of teams: ${numberOfTeams}`}>
            <input type="range" min={2} max={6} value={numberOfTeams} onChange={(e) => setNumberOfTeams(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="Property allocation at start">
            <div className="flex gap-2">
              {RATIO_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setRatio(o.value)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                    ratio === o.value ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starting cash">
              <input type="number" className="input" value={startingCash} onChange={(e) => setStartingCash(Number(e.target.value))} />
            </Field>
            <Field label="Credit / loan limit">
              <input type="number" className="input" value={startingLoanLimit} onChange={(e) => setStartingLoanLimit(Number(e.target.value))} />
            </Field>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button
            onClick={submit}
            disabled={creating}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create & Start Game"}
          </button>
        </div>
      </div>
      <style>{`.input{border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.5rem 0.75rem;width:100%}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-600 block mb-1">{label}</span>
      {children}
    </label>
  );
}
