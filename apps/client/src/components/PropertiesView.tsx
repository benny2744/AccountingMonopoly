import type { GameState, TeamView } from "../api.js";
import { game } from "@amono/shared";

const { streetRent, railroadRent, countOwnedRailroads } = game;

type ClientProperty = GameState["properties"][number];

export default function PropertiesView({
  state,
  teamView,
}: {
  state: GameState;
  teamView: TeamView;
}) {
  const owned = state.properties
    .filter((p) => p.ownerTeamId === teamView.team.id)
    .sort((a, b) => (a.kind === "street" ? -1 : 1) || a.name.localeCompare(b.name));

  const railroads = state.properties.filter((p) => p.kind === "railroad");
  const ownedRailroads = countOwnedRailroads(state.properties as any, teamView.team.id);

  if (owned.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-6 text-center text-slate-500">
        No properties owned yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-4">
      <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500">Owned Properties ({owned.length})</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {owned.map((prop) => (
          <PropertyCard key={prop.id} prop={prop} state={state} ownedRailroads={ownedRailroads} totalRailroads={railroads.length} />
        ))}
      </div>
    </div>
  );
}

function PropertyCard({
  prop,
  state,
  ownedRailroads,
  totalRailroads,
}: {
  prop: ClientProperty;
  state: GameState;
  ownedRailroads: number;
  totalRailroads: number;
}) {
  const space = state.spaces.find((s) => s.propertyId === prop.id);
  const rents = prop.kind === "street" ? buildStreetRentTable(prop) : buildRailroadRentTable(prop.rent, totalRailroads);

  return (
    <div className="border border-slate-200 rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {prop.kind === "street" && prop.color ? (
          <div className="w-6 h-10 rounded-sm shrink-0" style={{ background: prop.color }} />
        ) : (
          <div className="w-6 h-10 rounded-sm shrink-0 bg-slate-800 text-white text-[9px] font-bold flex items-center justify-center">RR</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{prop.name}</div>
          {space && <div className="text-xs text-slate-500">Space {space.index}</div>}
          <div className="text-xs text-slate-500">Purchase ${prop.purchasePrice}</div>
        </div>
        {prop.isMortgaged && (
          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">MORTGAGED</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {prop.kind === "street" && (
          <>
            <div className="bg-slate-50 rounded p-2">
              <div className="text-xs text-slate-500">Houses</div>
              <div className="font-semibold">{prop.houses >= 5 ? "Hotel" : prop.houses}</div>
            </div>
            {prop.houseCost && (
              <div className="bg-slate-50 rounded p-2">
                <div className="text-xs text-slate-500">House Cost</div>
                <div className="font-semibold">${prop.houseCost}</div>
              </div>
            )}
          </>
        )}
        {prop.kind === "railroad" && (
          <div className="bg-slate-50 rounded p-2 col-span-2">
            <div className="text-xs text-slate-500">Railroads Owned</div>
            <div className="font-semibold">{ownedRailroads} / {totalRailroads}</div>
          </div>
        )}
      </div>

      <div className="text-xs">
        <div className="font-semibold text-slate-500 mb-1">Rent Table</div>
        <div className="border rounded overflow-hidden">
          {rents.map((r, i) => (
            <div key={i} className={`flex justify-between px-2 py-1 ${i % 2 === 0 ? "bg-slate-50" : "bg-white"}`}>
              <span className="text-slate-600">{r.label}</span>
              <span className="font-mono font-semibold">${r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildStreetRentTable(prop: ClientProperty): { label: string; value: number }[] {
  const levels = [0, 1, 2, 3, 4, 5];
  return levels.map((h) => ({
    label: h === 0 ? "Base" : h === 5 ? "Hotel" : `${h} house${h > 1 ? "s" : ""}`,
    value: streetRent(prop.rent, h),
  }));
}

function buildRailroadRentTable(baseRent: number, totalRailroads: number): { label: string; value: number }[] {
  return Array.from({ length: totalRailroads || 4 }, (_, i) => {
    const owned = i + 1;
    return { label: `${owned} owned`, value: railroadRent(baseRent, owned) };
  });
}
