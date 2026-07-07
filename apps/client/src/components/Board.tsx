import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState, TeamView } from "../api.js";
import { latestEvent } from "../events.js";
import { useTranslation } from "../i18n/useTranslation.js";
import {
  t,
  getSpaceLabel,
  getTeamNameLabel,
  getEventCardTitle,
} from "@amono/shared/i18n";

import Dice, { STEP_MS } from "./Dice.js";

const BOARD_SIZE = 11;

function usePositionMap(spaces: GameState["spaces"]): Record<number, { row: number; col: number }> {
  return useMemo(() => {
    const placed = placePerimeter(spaces);
    return Object.fromEntries(placed.map((p) => [p.space.index, { row: p.row, col: p.col }]));
  }, [spaces]);
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
  const { t } = useTranslation();
  const placed = placePerimeter(state.spaces);
  const positionMap = usePositionMap(state.spaces);
  const gridRef = useRef<HTMLDivElement>(null);
  const [animatingTeams, setAnimatingTeams] = useState<Record<string, number>>({});

  const displayPositions = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of state.teams) {
      map[t.team.id] = animatingTeams[t.team.id] ?? t.team.position;
    }
    return map;
  }, [state.teams, animatingTeams]);

  const latestRoll = latestEvent(state.events, "roll");
  const latestRollId = latestRoll?.id ?? null;
  const isRolling = rolling ?? false;
  /** Hydrate guard: skip pin/step for the roll already present on mount. */
  const hydrated = useRef(false);
  const skipRollId = useRef<string | null>(null);
  /** Roll id already pinned at `from`. */
  const pinnedRollId = useRef<string | null>(null);
  /** Roll id that already completed the step animation. */
  const steppedRollId = useRef<string | null>(null);

  // Pin the moving piece at `from` as soon as a new roll arrives (during dice tumble).
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      skipRollId.current = latestRollId;
      return;
    }
    if (!latestRoll) return;
    if (latestRoll.id === skipRollId.current) return;
    if (latestRoll.id === pinnedRollId.current) return;

    pinnedRollId.current = latestRoll.id;
    const { teamId, from } = latestRoll.payload as {
      teamId: string;
      from: number;
      to: number;
      dice: [number, number];
      total: number;
    };
    setAnimatingTeams((prev) => ({ ...prev, [teamId]: from }));
  }, [latestRollId]);

  // Step the token once the dice has settled.
  useEffect(() => {
    if (isRolling) return;
    if (!latestRoll || !gridRef.current) return;
    if (latestRoll.id === skipRollId.current) return;
    if (latestRoll.id === steppedRollId.current) return;

    steppedRollId.current = latestRoll.id;
    const { teamId, from, to } = latestRoll.payload as {
      teamId: string;
      from: number;
      to: number;
      dice: [number, number];
      total: number;
    };
    const moving = state.teams.find((t) => t.team.id === teamId);
    if (!moving) return;

    const boardLen = state.spaces.length;
    const steps = (to - from + boardLen) % boardLen || boardLen;
    const targetIndices: number[] = [];
    for (let i = 1; i <= steps; i++) {
      targetIndices.push((from + i) % boardLen);
    }
    if (targetIndices.length === 0) return;

    setAnimatingTeams((prev) => ({ ...prev, [teamId]: from }));

    const timers: ReturnType<typeof setTimeout>[] = [];
    targetIndices.forEach((spaceIndex, i) => {
      timers.push(setTimeout(() => {
        setAnimatingTeams((prev) => ({ ...prev, [teamId]: spaceIndex }));
      }, (i + 1) * STEP_MS));
    });

    const endTimeout = setTimeout(() => {
      setAnimatingTeams((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
    }, (targetIndices.length + 1) * STEP_MS);
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
          <SpaceCell
            key={p.space.index}
            space={p.space}
            state={state}
            row={p.row}
            col={p.col}
            displayPositions={displayPositions}
          />
        ))}
        <Center state={state} dice={dice ?? null} rolling={isRolling} controls={controls} />
        <PieceLayer state={state} displayPositions={displayPositions} positionMap={positionMap} />
      </div>
    </div>
  );
}

function PieceLayer({
  state,
  displayPositions,
  positionMap,
}: {
  state: GameState;
  displayPositions: Record<string, number>;
  positionMap: Record<number, { row: number; col: number }>;
}) {
  const teams = state.teams.filter((t) => t.team.position != null);
  return (
    <>
      {teams.map((t, i) => {
        const spaceIndex = displayPositions[t.team.id] ?? t.team.position!;
        const pos = positionMap[spaceIndex];
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
              title={getTeamNameLabel(t.team.name)}
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
  displayPositions,
}: {
  space: GameState["spaces"][number];
  state: GameState;
  row: number;
  col: number;
  displayPositions: Record<string, number>;
}) {
  const { t } = useTranslation();
  const prop = space.propertyId ? state.properties.find((p) => p.id === space.propertyId) : null;
  const owner = prop?.ownerTeamId ? state.teams.find((t) => t.team.id === prop.ownerTeamId) : null;
  const tokens = state.teams.filter((t) => displayPositions[t.team.id] === space.index);
  const stripe = prop?.color ?? typeStripe(space.type);
  const isCurrent =
    state.game.currentTeamId != null &&
    displayPositions[state.game.currentTeamId] === space.index;

  return (
    <div
      className={`border border-slate-300 rounded-sm p-0.5 flex flex-col justify-between text-[8px] sm:text-[9px] leading-tight overflow-hidden relative ${isCurrent ? "ring-2 ring-indigo-500 z-10" : ""}`}
      style={{ background: owner ? `${owner.team.color}18` : "#fff", gridRow: row, gridColumn: col }}
    >
      {prop?.kind === "street" && (
        <div className="h-1.5 w-full rounded-t-sm shrink-0" style={{ background: stripe }} />
      )}
      {prop?.kind === "railroad" && (
        <div className="text-[7px] font-bold text-slate-600 bg-slate-200 text-center py-0.5">{t("board.railroadAbbreviation")}</div>
      )}
      <div className="font-semibold truncate px-0.5 pt-0.5">{shortName(getSpaceLabel(space.name))}</div>
      {prop && (
        <div className="text-slate-600 px-0.5">
          ${prop.purchasePrice}
          {prop.kind === "street" && <>·${prop.rent}</>}
        </div>
      )}
      {prop && prop.houses > 0 && (
        <div className="flex gap-px px-0.5 pb-0.5">
          {prop.houses >= 5 ? (
            <span className="text-red-600 font-bold text-[8px]">{t("board.hotel")}</span>
          ) : (
            Array.from({ length: prop.houses }).map((_, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-sm bg-emerald-600 inline-block" />
            ))
          )}
        </div>
      )}
      {owner && (
        <div className="text-[7px] font-bold truncate px-0.5" style={{ color: owner.team.color }}>
          {getTeamNameLabel(owner.team.name)}
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
  const { t } = useTranslation();
  const current = state.teams.find((t) => t.team.id === state.game.currentTeamId);
  const lastRoll = latestEvent(state.events, "roll");
  const lastEvent = state.events.find((e) => e.type !== "roll" && e.type !== "move");
  const showDice = dice ?? (lastRoll ? (lastRoll.payload as any).dice : null);
  return (
    <div
      className="bg-slate-50 rounded-lg flex flex-col items-center justify-between p-3 text-center border border-slate-200 gap-2"
      style={{ gridRow: "2 / span 9", gridColumn: "2 / span 9" }}
    >
      <div className="flex flex-col items-center">
        <div className="text-slate-400 text-xs uppercase tracking-wide">{t("board.currentTurn")}</div>
        {current ? (
          <div className="text-2xl sm:text-3xl font-bold" style={{ color: current.team.color }}>
            {getTeamNameLabel(current.team.name)}
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
              {t("board.rolled", { total: (lastRoll.payload as any).total })}
            </div>
          )}
          {rolling && (
            <div className="text-sm text-indigo-600 mt-2 font-medium animate-pulse">{t("board.rolling")}</div>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-2 w-full">
        <div className="text-xs text-slate-400">{t("board.year", { year: current?.team.currentYear ?? 1 })}</div>
        {state.pending && (
          <div className="text-sm bg-amber-100 text-amber-800 rounded px-3 py-1">
            {pendingLabel(state.pending.kind, state.pending.status)}
          </div>
        )}
        {lastEvent && !state.pending && (
          <div className="text-[11px] text-slate-400 max-w-xs">
            {describeEvent(lastEvent.type, lastEvent.payload, state)}
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
  if (status === "awaiting_journal") return t("board.recordJournal");
  if (kind === "buy_or_skip") return t("board.buyOrSkip");
  if (kind === "rent_due") return t("board.choosePayment");
  if (kind === "bank_stop") return t("board.visitBank");
  if (kind === "build_house") return t("board.recordBuilding");
  if (kind === "event_card") return t("board.eventCardDrawn");
  return t("board.resolveAction");
}

function describeEvent(type: string, payload: any, state: GameState): string {
  const teamName = (id?: string) => {
    const name = id ? state.teams.find((t) => t.team.id === id)?.team.name : undefined;
    return name ? getTeamNameLabel(name) : "";
  };
  switch (type) {
    case "rent_due":
      return t("gameEvent.rentDue", { payer: teamName(payload.payer), owner: teamName(payload.owner), rent: payload.rent });
    case "buy_property":
      return t("gameEvent.boughtProperty", { teamName: teamName(payload.teamId), price: payload.price });
    case "interest_charged":
      return t("gameEvent.interestCharged", { teamName: teamName(payload.teamId), amount: payload.amount });
    case "draw_event_card":
      return t("gameEvent.drewCard", { teamName: teamName(payload.teamId), title: payload.cardId ? getEventCardTitle(payload.cardId) : payload.title });
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
