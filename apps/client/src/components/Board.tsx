import { useEffect, useRef, useState } from "react";
import type { GameState, TeamView } from "../api.js";

import Dice from "./Dice.js";

const BOARD_SIZE = 11;
const STEP_MS = 180;
const ROLL_SETTLE_MS = 1500;

function usePositionMap(spaces: GameState["spaces"]): Record<number, { row: number; col: number }> {
  const placed = placePerimeter(spaces);
  return Object.fromEntries(placed.map((p) => [p.space.index, { row: p.row, col: p.col }]));
}

export default function Board({
  state,
  dice,
  rolling,
  controls,
}: {
  state: GameState;
  dice?: [number, number] | null;
  rolling?: boolean;
  controls?: React.ReactNode;
}) {
  const placed = placePerimeter(state.spaces);
  const positionMap = usePositionMap(state.spaces);
  const gridRef = useRef<HTMLDivElement>(null);
  const [animatingTeams, setAnimatingTeams] = useState<Record<string, { row: number; col: number }>>({});

  const latestRoll = [...state.events].reverse().find((e) => e.type === "roll");
  const latestRollId = latestRoll?.id ?? null;
  const isRolling = rolling ?? false;

  // Only step the token once the dice has settled.
  useEffect(() => {
    if (isRolling) return;
    if (!latestRoll || !gridRef.current) return;
    const { teamId, from, to } = latestRoll.payload as { teamId: string; from: number; to: number; dice: [number, number]; total: number };
    const moving = state.teams.find((t) => t.team.id === teamId);
    if (!moving) return;

    const targets: { row: number; col: number }[] = [];
    const steps = (to - from + state.spaces.length) % state.spaces.length || state.spaces.length;
    for (let i = 1; i <= steps; i++) {
      targets.push(positionMap[(from + i) % state.spaces.length] ?? { row: 1, col: 1 });
    }
    if (targets.length === 0) return;

    setAnimatingTeams((prev) => ({ ...prev, [teamId]: positionMap[from] ?? { row: 1, col: 1 } }));

    const timers: ReturnType<typeof setTimeout>[] = [];
    targets.forEach((pos, i) => {
      timers.push(setTimeout(() => {
        setAnimatingTeams((prev) => ({ ...prev, [teamId]: pos }));
      }, (i + 1) * STEP_MS));
    });

    const endTimeout = setTimeout(() => {
      setAnimatingTeams((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
    }, (targets.length + 1) * STEP_MS);
    timers.push(endTimeout);

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [latestRollId, isRolling]);

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div
        ref={gridRef}
        className="board-grid max-w-4xl mx-auto relative"
        style={{
          aspectRatio: "1 / 1",
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
          gap: "2px",
        }}
      >
        {placed.map((p) => (
          <SpaceCell key={p.space.index} space={p.space} state={state} row={p.row} col={p.col} />
        ))}
        <Center state={state} dice={dice ?? null} rolling={isRolling} controls={controls} />
        <PieceLayer state={state} animatingTeams={animatingTeams} positionMap={positionMap} />
      </div>
    </div>
  );
}

function PieceLayer({
  state,
  animatingTeams,
  positionMap,
}: {
  state: GameState;
  animatingTeams: Record<string, { row: number; col: number }>;
  positionMap: Record<number, { row: number; col: number }>;
}) {
  const teams = state.teams.filter((t) => t.team.position != null);
  return (
    <>
      {teams.map((t, i) => {
        const pos = animatingTeams[t.team.id] ?? positionMap[t.team.position!];
        if (!pos) return null;
        const total = teams.length || 1;
        const angle = (i / total) * 2 * Math.PI;
        const offsetX = Math.cos(angle) * 18;
        const offsetY = Math.sin(angle) * 18;
        return (
          <div
            key={t.team.id}
            className="pointer-events-none transition-all duration-150 ease-in-out z-20 absolute flex items-center justify-center"
            style={{
              gridRow: pos.row,
              gridColumn: pos.col,
              transform: `translate(${offsetX}px, ${offsetY}px)`,
            }}
          >
            <span
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-white shadow-md"
              style={{ background: t.team.color }}
              title={t.team.name}
            />
          </div>
        );
      })}
    </>
  );
}
function placePerimeter(spaces: GameState["spaces"]): { space: GameState["spaces"][number]; row: number; col: number }[] {
  const positions: [number, number][] = [];
  for (let c = 1; c <= 11; c++) positions.push([11, c]);
  for (let r = 10; r >= 2; r--) positions.push([r, 11]);
  for (let c = 11; c >= 1; c--) positions.push([1, c]);
  for (let r = 2; r <= 10; r++) positions.push([r, 1]);
  return spaces.map((space, i) => {
    const [row, col] = positions[i] ?? [1, 1];
    return { space, row, col };
  });
}

function SpaceCell({
  space,
  state,
  row,
  col,
}: {
  space: GameState["spaces"][number];
  state: GameState;
  row: number;
  col: number;
}) {
  const prop = space.propertyId ? state.properties.find((p) => p.id === space.propertyId) : null;
  const owner = prop?.ownerTeamId ? state.teams.find((t) => t.team.id === prop.ownerTeamId) : null;
  const tokens = state.teams.filter((t) => t.team.position === space.index);
  const stripe = prop?.color ?? typeStripe(space.type);
  const isCurrent = state.teams.some((t) => t.team.id === state.game.currentTeamId && t.team.position === space.index);

  return (
    <div
      className={`border border-slate-300 rounded-sm p-0.5 flex flex-col justify-between text-[8px] sm:text-[9px] leading-tight overflow-hidden relative ${isCurrent ? "ring-2 ring-indigo-500 z-10" : ""}`}
      style={{ background: owner ? `${owner.team.color}18` : "#fff", gridRow: row, gridColumn: col }}
    >
      {prop?.kind === "street" && (
        <div className="h-1.5 w-full rounded-t-sm shrink-0" style={{ background: stripe }} />
      )}
      {prop?.kind === "railroad" && (
        <div className="text-[7px] font-bold text-slate-600 bg-slate-200 text-center py-0.5">RR</div>
      )}
      <div className="font-semibold truncate px-0.5 pt-0.5">{shortName(space.name)}</div>
      {prop && (
        <div className="text-slate-600 px-0.5">
          ${prop.purchasePrice}
          {prop.kind === "street" && <>·${prop.rent}</>}
        </div>
      )}
      {prop && prop.houses > 0 && (
        <div className="flex gap-px px-0.5 pb-0.5">
          {prop.houses >= 5 ? (
            <span className="text-red-600 font-bold text-[8px]">H</span>
          ) : (
            Array.from({ length: prop.houses }).map((_, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-sm bg-emerald-600 inline-block" />
            ))
          )}
        </div>
      )}
      {owner && (
        <div className="text-[7px] font-bold truncate px-0.5" style={{ color: owner.team.color }}>
          {owner.team.name}
        </div>
      )}
      {tokens.length > 0 && (
        <div className="flex gap-0.5 px-0.5 pb-0.5">
          {tokens.map((t) => (
            <span key={t.team.id} className="w-2 h-2 rounded-full border border-slate-400 opacity-40" style={{ background: t.team.color }} />
          ))}
        </div>
      )}
    </div>
  );
}

function shortName(name: string): string {
  if (name.length <= 14) return name;
  return name.replace(" Avenue", " Av").replace(" Place", " Pl").replace(" Railroad", " RR").slice(0, 14);
}

function Center({
  state,
  dice,
  rolling,
  controls,
}: {
  state: GameState;
  dice: [number, number] | null;
  rolling: boolean;
  controls?: React.ReactNode;
}) {
  const current = state.teams.find((t) => t.team.id === state.game.currentTeamId);
  const lastRoll = [...state.events].reverse().find((e) => e.type === "roll");
  const lastEvent = [...state.events].reverse().find((e) => e.type !== "roll" && e.type !== "move");
  const showDice = dice ?? (lastRoll ? (lastRoll.payload as any).dice : null);
  return (
    <div
      className="bg-slate-50 rounded-lg flex flex-col items-center justify-between p-3 text-center border border-slate-200 gap-2"
      style={{ gridRow: "2 / span 9", gridColumn: "2 / span 9" }}
    >
      <div className="flex flex-col items-center">
        <div className="text-slate-400 text-xs uppercase tracking-wide">Current Turn</div>
        {current ? (
          <div className="text-2xl sm:text-3xl font-bold" style={{ color: current.team.color }}>
            {current.team.name}
          </div>
        ) : (
          <div className="text-slate-400 text-lg">—</div>
        )}
      </div>

      {showDice && (
        <div className="flex flex-col items-center">
          <Dice dice={showDice} rolling={rolling} size="board" />
          {!rolling && lastRoll && (
            <div className="text-sm text-slate-600 mt-2">
              Rolled <span className="font-mono font-semibold text-lg">{(lastRoll.payload as any).total}</span>
            </div>
          )}
          {rolling && (
            <div className="text-sm text-indigo-600 mt-2 font-medium animate-pulse">Rolling…</div>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-2 w-full">
        <div className="text-xs text-slate-400">Year {current?.team.currentYear ?? 1}</div>
        {state.pending && (
          <div className="text-sm bg-amber-100 text-amber-800 rounded px-3 py-1">
            {pendingLabel(state.pending.kind, state.pending.status)}
          </div>
        )}
        {lastEvent && !state.pending && (
          <div className="text-[11px] text-slate-400 max-w-xs">
            {describeEvent(lastEvent.type, lastEvent.payload)}
          </div>
        )}
        {controls && (
          <div className="mt-1 w-full flex justify-center">{controls}</div>
        )}
      </div>
    </div>
  );
}

function pendingLabel(kind: string, status: string): string {
  if (status === "awaiting_journal") return "Record your journal entry ↓";
  if (kind === "buy_or_skip") return "Buy or skip property?";
  if (kind === "rent_due") return "Choose payment method";
  if (kind === "bank_stop") return "Visit the bank?";
  if (kind === "build_house") return "Record building purchase ↓";
  if (kind === "event_card") return "Event card drawn";
  return "Resolve action";
}

function describeEvent(type: string, payload: any): string {
  switch (type) {
    case "rent_due":
      return `${payload.payer ?? ""} owes rent ${payload.rent}`;
    case "buy_property":
      return `${payload.teamId ?? ""} bought property (${payload.price})`;
    case "interest_charged":
      return `Interest charged: ${payload.amount}`;
    case "draw_event_card":
      return `Card: ${payload.title}`;
    default:
      return type;
  }
}

function typeStripe(type: string): string {
  switch (type) {
    case "go":
      return "#fef9c3";
    case "event":
      return "#e0e7ff";
    case "bank":
      return "#dcfce7";
    case "tax":
      return "#fde68a";
    case "rest":
      return "#f1f5f9";
    default:
      return "#ffffff";
  }
}

export type { TeamView };
