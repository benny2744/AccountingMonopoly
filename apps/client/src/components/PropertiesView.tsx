import type { GameState, TeamView } from "../api.js";
import { game } from "@amono/shared";
import { useTranslation } from "../i18n/useTranslation.js";
import { getPropertyLabel, getColorGroupLabel } from "@amono/shared/i18n";

const { streetRent, railroadRent, countOwnedRailroads } = game;

type ClientProperty = GameState["properties"][number];

export default function PropertiesView({
  state,
  teamView,
}: {
  state: GameState;
  teamView: TeamView;
}) {
  const { t } = useTranslation();
  const owned = state.properties
    .filter((p) => p.ownerTeamId === teamView.team.id)
    .sort((a, b) => (a.kind === "street" ? -1 : 1) || a.name.localeCompare(b.name));

  const railroads = state.properties.filter((p) => p.kind === "railroad");
  const ownedRailroads = countOwnedRailroads(state.properties as any, teamView.team.id);

  if (owned.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-6 text-center text-slate-500">
        {t("propertiesView.noProperties")}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-4">
      <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500">{t("propertiesView.ownedProperties", { count: owned.length })}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {owned.map((prop) => (
          <PropertyCard key={prop.id} prop={prop} state={state} ownedRailroads={ownedRailroads} totalRailroads={railroads.length} t={t} />
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
  t,
}: {
  prop: ClientProperty;
  state: GameState;
  ownedRailroads: number;
  totalRailroads: number;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const space = state.spaces.find((s) => s.propertyId === prop.id);
  const rents = prop.kind === "street" ? buildStreetRentTable(prop, t) : buildRailroadRentTable(prop.rent, totalRailroads, t);

  return (
    <div className="border border-slate-200 rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {prop.kind === "street" && prop.color ? (
          <div className="w-6 h-10 rounded-sm shrink-0" style={{ background: prop.color }} />
        ) : (
          <div className="w-6 h-10 rounded-sm shrink-0 bg-slate-800 text-white text-[9px] font-bold flex items-center justify-center">{t("propertiesView.railroadAbbreviation")}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{getPropertyLabel(prop.name)}</div>
          {space && <div className="text-xs text-slate-500">{t("propertiesView.space", { index: space.index })}</div>}
          <div className="text-xs text-slate-500">{t("propertiesView.purchasePrice", { price: prop.purchasePrice })}</div>
        </div>
        {prop.isMortgaged && (
          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">{t("propertiesView.mortgaged")}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {prop.kind === "street" && (
          <>
            <div className="bg-slate-50 rounded p-2">
              <div className="text-xs text-slate-500">{t("propertiesView.houses")}</div>
              <div className="font-semibold">{prop.houses >= 5 ? t("propertiesView.hotel") : prop.houses}</div>
            </div>
            {prop.houseCost && (
              <div className="bg-slate-50 rounded p-2">
                <div className="text-xs text-slate-500">{t("propertiesView.houseCost")}</div>
                <div className="font-semibold">${prop.houseCost}</div>
              </div>
            )}
          </>
        )}
        {prop.kind === "railroad" && (
          <div className="bg-slate-50 rounded p-2 col-span-2">
            <div className="text-xs text-slate-500">{t("propertiesView.railroadsOwned")}</div>
            <div className="font-semibold">{t("propertiesView.railroadCount", { owned: ownedRailroads, total: totalRailroads })}</div>
          </div>
        )}
      </div>

      <div className="text-xs">
        <div className="font-semibold text-slate-500 mb-1">{t("propertiesView.rentTable")}</div>
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

function buildStreetRentTable(prop: ClientProperty, t: ReturnType<typeof useTranslation>["t"]): { label: string; value: number }[] {
  const levels = [0, 1, 2, 3, 4, 5];
  return levels.map((h) => ({
    label: h === 0 ? t("propertiesView.base") : h === 5 ? t("propertiesView.hotelRow") : t("propertiesView.houseCount", { count: h }),
    value: streetRent(prop.rent, h),
  }));
}

function buildRailroadRentTable(baseRent: number, totalRailroads: number, t: ReturnType<typeof useTranslation>["t"]): { label: string; value: number }[] {
  return Array.from({ length: totalRailroads || 4 }, (_, i) => {
    const owned = i + 1;
    return { label: t("propertiesView.railroadCount", { owned, total: totalRailroads || 4 }), value: railroadRent(baseRent, owned) };
  });
}
