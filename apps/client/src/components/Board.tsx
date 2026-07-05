import type { GameState, TeamView } from "../api.js";

// 7x7 grid. 24 perimeter cells (with explicit placement) + a center panel.
export default function Board({ state }: { state: GameState }) {
  const placed = placePerimeter(state.spaces);
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="board-grid max-w-3xl mx-auto" style={{ aspectRatio: "1 / 1" }}>
        {placed.map((p) => (
          <SpaceCell key={p.space.index} space={p.space} state={state} row={p.row} col={p.col} />
        ))}
        <Center state={state} />
      </div>
    </div>
  );
}

// Assigns (row, col) — 1-indexed for grid — to each of the 24 spaces in index order.
function placePerimeter(spaces: GameState["spaces"]): { space: GameState["spaces"][number]; row: number; col: number }[] {
  const positions: [number, number][] = [];
  // bottom row left→right, right col bottom→top, top row right→left, left col top→bottom
  for (let c = 1; c <= 7; c++) positions.push([7, c]); // 0..6
  for (let r = 6; r >= 2; r--) positions.push([r, 7]); // 7..11
  for (let c = 7; c >= 1; c--) positions.push([1, c]); // 12..18
  for (let r = 2; r <= 6; r++) positions.push([r, 1]); // 19..23
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
  const bgColor = typeColor(space.type, owner?.team.color);
  const isCurrent = state.teams.some((t) => t.team.id === state.game.currentTeamId && t.team.position === space.index);

  return (
    <div
      className={`border border-slate-300 rounded-sm p-1 flex flex-col justify-between text-[10px] leading-tight overflow-hidden ${isCurrent ? "ring-2 ring-indigo-500" : ""}`}
      style={{ background: bgColor, gridRow: row, gridColumn: col }}
    >
      <div className="font-semibold truncate">{space.name}</div>
      {prop && <div className="text-slate-600">${prop.purchasePrice}·${prop.rent}</div>}
      {owner && (
        <div className="text-[9px] font-bold" style={{ color: owner.team.color }}>
          {owner.team.name}
        </div>
      )}
      {tokens.length > 0 && (
        <div className="flex gap-0.5 mt-0.5">
          {tokens.map((t) => (
            <span key={t.team.id} className="w-2 h-2 rounded-full border border-slate-400" style={{ background: t.team.color }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Center({ state }: { state: GameState }) {
  const current = state.teams.find((t) => t.team.id === state.game.currentTeamId);
  const lastRoll = [...state.events].reverse().find((e) => e.type === "roll");
  const lastEvent = [...state.events].reverse().find((e) => e.type !== "roll" && e.type !== "move");
  return (
    <div
      className="bg-slate-50 rounded-lg flex flex-col items-center justify-center p-4 text-center"
      style={{ gridRow: "2 / span 5", gridColumn: "2 / span 5" }}
    >
      <div className="text-slate-400 text-xs uppercase tracking-wide">Current Turn</div>
      {current ? (
        <div className="text-3xl font-bold" style={{ color: current.team.color }}>
          {current.team.name}
        </div>
      ) : (
        <div className="text-slate-400 text-lg">—</div>
      )}
      {lastRoll && (
        <div className="mt-2 text-sm text-slate-600">
          Rolled <span className="font-mono font-semibold text-lg">{(lastRoll.payload as any).total}</span>
        </div>
      )}
      <div className="text-xs text-slate-400 mt-1">Year {current?.team.currentYear ?? 1}</div>
      {state.pending && (
        <div className="mt-3 text-sm bg-amber-100 text-amber-800 rounded px-3 py-1">
          {pendingLabel(state.pending.kind, state.pending.status)}
        </div>
      )}
      {lastEvent && (
        <div className="mt-2 text-[11px] text-slate-400 max-w-xs">
          {describeEvent(lastEvent.type, lastEvent.payload)}
        </div>
      )}
    </div>
  );
}

function pendingLabel(kind: string, status: string): string {
  if (status === "awaiting_journal") return "Record your journal entry ↓";
  if (kind === "buy_or_skip") return "Buy or skip property?";
  if (kind === "rent_due") return "Choose payment method";
  if (kind === "bank_stop") return "Visit the bank?";
  if (kind === "event_card") return "Event card drawn";
  return "Resolve action";
}

function describeEvent(type: string, payload: any): string {
  switch (type) {
    case "rent_due": return `${payload.payer ?? ""} owes rent ${payload.rent}`;
    case "buy_property": return `${payload.teamId ?? ""} bought property (${payload.price})`;
    case "interest_charged": return `Interest charged: ${payload.amount}`;
    case "draw_event_card": return `Card: ${payload.title}`;
    default: return type;
  }
}

function typeColor(type: string, ownerColor?: string): string {
  if (ownerColor) return `${ownerColor}22`;
  switch (type) {
    case "go": return "#fef9c3";
    case "event": return "#e0e7ff";
    case "bank": return "#dcfce7";
    case "repair": return "#fee2e2";
    case "charity": return "#fce7f3";
    case "road_closure": return "#fed7aa";
    case "tax": return "#fde68a";
    case "rest": return "#f1f5f9";
    default: return "#ffffff";
  }
}

export type { TeamView };
