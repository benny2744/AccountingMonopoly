import { useEffect, useState } from "react";
import type { GameState } from "../api.js";

const ROLL_MS = 1500;

/**
 * Detects a new `roll` event in the game state and exposes a tumbling flag
 * for ROLL_MS so the <Dice> component can animate before settling on the
 * real values.
 */
export function useDiceRoll(state: GameState | null): {
  dice: [number, number] | null;
  rolling: boolean;
  total: number | null;
} {
  const [dice, setDice] = useState<[number, number] | null>(null);
  const [rolling, setRolling] = useState(false);

  const rollEvent = state ? [...state.events].reverse().find((e) => e.type === "roll") : null;
  const rollPayload = rollEvent?.payload as { dice: [number, number] } | undefined;

  useEffect(() => {
    if (!rollEvent || !rollPayload) return;
    setRolling(true);
    const t = setTimeout(() => {
      setDice(rollPayload.dice);
      setRolling(false);
    }, ROLL_MS);
    return () => clearTimeout(t);
  }, [rollEvent?.id, rollPayload?.dice?.[0], rollPayload?.dice?.[1]]);

  return { dice, rolling, total: dice ? dice[0] + dice[1] : null };
}

/** Pip positions for each die face in a 3×3 grid (1 = pip shown). */
const PIP_LAYOUT: Record<number, [boolean, boolean, boolean][]> = {
  1: [[false, false, false], [false, true, false], [false, false, false]],
  2: [[true, false, false], [false, false, false], [false, false, true]],
  3: [[true, false, false], [false, true, false], [false, false, true]],
  4: [[true, false, true], [false, false, false], [true, false, true]],
  5: [[true, false, true], [false, true, false], [true, false, true]],
  6: [[true, false, true], [true, false, true], [true, false, true]],
};

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  // Cycle the displayed face rapidly while rolling for a smooth tumble.
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling) {
      setFace(value);
      return;
    }
    const id = setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 6));
    }, 80);
    return () => clearInterval(id);
  }, [rolling, value]);

  const grid = PIP_LAYOUT[face] ?? PIP_LAYOUT[1]!;
  return (
    <div
      className="w-full h-full bg-white rounded-lg shadow-md grid grid-cols-3 gap-0.5 p-1"
      style={{
        animation: rolling
          ? "die-tumble 0.45s ease-in-out infinite"
          : undefined,
      }}
    >
      {grid.flat().map((on, i) => (
        <div key={i} className={`rounded-full ${on ? "bg-slate-800" : "bg-transparent"}`} />
      ))}
    </div>
  );
}

/**
 * Two animated dice. Pass the latest roll via `dice` and whether we're in
 * the tumble phase via `rolling`. While rolling, faces cycle rapidly and
 * the dice tumble via CSS keyframes.
 */
export default function Dice({
  dice,
  rolling,
  size = "md",
}: {
  dice: [number, number] | null;
  rolling: boolean;
  size?: "sm" | "md" | "lg" | "board";
}) {
  const v0 = dice?.[0] ?? 1;
  const v1 = dice?.[1] ?? 1;
  const dim =
    size === "board"
      ? "w-14 h-14 sm:w-16 sm:h-16"
      : size === "lg"
        ? "w-12 h-12"
        : size === "sm"
          ? "w-9 h-9"
          : "w-10 h-10";
  return (
    <>
      <style>{`@keyframes die-tumble{0%{transform:rotate(0) scale(1)}25%{transform:rotate(90deg) scale(1.08)}50%{transform:rotate(180deg) scale(0.94)}75%{transform:rotate(270deg) scale(1.06)}100%{transform:rotate(360deg) scale(1)}}`}</style>
      <div className="flex gap-2 items-center">
        <div className={dim}>
          <Die value={v0} rolling={rolling} />
        </div>
        <div className={dim}>
          <Die value={v1} rolling={rolling} />
        </div>
      </div>
    </>
  );
}
