import type { BoardSpace, Property } from "../types.js";

export const BOARD_SIZE = 40;

interface BoardPresetSpace {
  index: number;
  name: string;
  type: BoardSpace["type"];
  deckType?: "cash" | "accrual";
  taxAmount?: number;
}

export interface PropertyPreset {
  slug: string;
  name: string;
  boardIndex: number;
  kind: "street" | "railroad";
  purchasePrice: number;
  /** Base rent before houses/railroad multiplier. Streets: 20% of price; railroads: 25. */
  rent: number;
  colorGroup?: string;
  color: string;
  houseCost?: number;
}

/** Classic 40-space Monopoly-style board (no jail; former utility slots are streets). */
export const CLASSIC_BOARD_SPACES: readonly BoardPresetSpace[] = [
  { index: 0, name: "GO", type: "go" },
  { index: 1, name: "Mediterranean Avenue", type: "property" },
  { index: 2, name: "Community Chest", type: "event", deckType: "cash" },
  { index: 3, name: "Baltic Avenue", type: "property" },
  { index: 4, name: "Income Tax", type: "tax", taxAmount: 200 },
  { index: 5, name: "Reading Railroad", type: "property" },
  { index: 6, name: "Oriental Avenue", type: "property" },
  { index: 7, name: "Chance", type: "event", deckType: "cash" },
  { index: 8, name: "Vermont Avenue", type: "property" },
  { index: 9, name: "Connecticut Avenue", type: "property" },
  { index: 10, name: "Bank", type: "bank" },
  { index: 11, name: "St. Charles Place", type: "property" },
  { index: 12, name: "Schiller Place", type: "property" },
  { index: 13, name: "States Avenue", type: "property" },
  { index: 14, name: "Virginia Avenue", type: "property" },
  { index: 15, name: "Pennsylvania Railroad", type: "property" },
  { index: 16, name: "St. James Place", type: "property" },
  { index: 17, name: "Community Chest", type: "event", deckType: "cash" },
  { index: 18, name: "Tennessee Avenue", type: "property" },
  { index: 19, name: "New York Avenue", type: "property" },
  { index: 20, name: "Free Parking", type: "rest" },
  { index: 21, name: "Kentucky Avenue", type: "property" },
  { index: 22, name: "Chance", type: "event", deckType: "cash" },
  { index: 23, name: "Indiana Avenue", type: "property" },
  { index: 24, name: "Illinois Avenue", type: "property" },
  { index: 25, name: "B&O Railroad", type: "property" },
  { index: 26, name: "Atlantic Avenue", type: "property" },
  { index: 27, name: "Ventnor Avenue", type: "property" },
  { index: 28, name: "Waterfront Avenue", type: "property" },
  { index: 29, name: "Marvin Gardens", type: "property" },
  { index: 30, name: "Bank", type: "bank" },
  { index: 31, name: "Pacific Avenue", type: "property" },
  { index: 32, name: "North Carolina Avenue", type: "property" },
  { index: 33, name: "Community Chest", type: "event", deckType: "cash" },
  { index: 34, name: "Pennsylvania Avenue", type: "property" },
  { index: 35, name: "Short Line Railroad", type: "property" },
  { index: 36, name: "Chance", type: "event", deckType: "cash" },
  { index: 37, name: "Park Place", type: "property" },
  { index: 38, name: "Luxury Tax", type: "tax", taxAmount: 100 },
  { index: 39, name: "Boardwalk", type: "property" },
];

export const CLASSIC_BOARD_PROPERTIES: readonly PropertyPreset[] = [
  { slug: "med", name: "Mediterranean Avenue", boardIndex: 1, kind: "street", purchasePrice: 60, rent: 12, colorGroup: "brown", color: "#8B4513", houseCost: 50 },
  { slug: "bal", name: "Baltic Avenue", boardIndex: 3, kind: "street", purchasePrice: 60, rent: 12, colorGroup: "brown", color: "#8B4513", houseCost: 50 },
  { slug: "ori", name: "Oriental Avenue", boardIndex: 6, kind: "street", purchasePrice: 100, rent: 20, colorGroup: "light_blue", color: "#87CEEB", houseCost: 50 },
  { slug: "ver", name: "Vermont Avenue", boardIndex: 8, kind: "street", purchasePrice: 100, rent: 20, colorGroup: "light_blue", color: "#87CEEB", houseCost: 50 },
  { slug: "con", name: "Connecticut Avenue", boardIndex: 9, kind: "street", purchasePrice: 120, rent: 24, colorGroup: "light_blue", color: "#87CEEB", houseCost: 50 },
  { slug: "rr1", name: "Reading Railroad", boardIndex: 5, kind: "railroad", purchasePrice: 200, rent: 25, color: "#1f2937" },
  { slug: "stc", name: "St. Charles Place", boardIndex: 11, kind: "street", purchasePrice: 140, rent: 28, colorGroup: "pink", color: "#ec4899", houseCost: 100 },
  { slug: "sch", name: "Schiller Place", boardIndex: 12, kind: "street", purchasePrice: 140, rent: 28, colorGroup: "pink", color: "#ec4899", houseCost: 100 },
  { slug: "sta", name: "States Avenue", boardIndex: 13, kind: "street", purchasePrice: 140, rent: 28, colorGroup: "pink", color: "#ec4899", houseCost: 100 },
  { slug: "vir", name: "Virginia Avenue", boardIndex: 14, kind: "street", purchasePrice: 160, rent: 32, colorGroup: "pink", color: "#ec4899", houseCost: 100 },
  { slug: "rr2", name: "Pennsylvania Railroad", boardIndex: 15, kind: "railroad", purchasePrice: 200, rent: 25, color: "#1f2937" },
  { slug: "stj", name: "St. James Place", boardIndex: 16, kind: "street", purchasePrice: 180, rent: 36, colorGroup: "orange", color: "#f97316", houseCost: 100 },
  { slug: "ten", name: "Tennessee Avenue", boardIndex: 18, kind: "street", purchasePrice: 180, rent: 36, colorGroup: "orange", color: "#f97316", houseCost: 100 },
  { slug: "ny", name: "New York Avenue", boardIndex: 19, kind: "street", purchasePrice: 200, rent: 40, colorGroup: "orange", color: "#f97316", houseCost: 100 },
  { slug: "ken", name: "Kentucky Avenue", boardIndex: 21, kind: "street", purchasePrice: 220, rent: 44, colorGroup: "red", color: "#ef4444", houseCost: 150 },
  { slug: "ind", name: "Indiana Avenue", boardIndex: 23, kind: "street", purchasePrice: 220, rent: 44, colorGroup: "red", color: "#ef4444", houseCost: 150 },
  { slug: "ill", name: "Illinois Avenue", boardIndex: 24, kind: "street", purchasePrice: 240, rent: 48, colorGroup: "red", color: "#ef4444", houseCost: 150 },
  { slug: "rr3", name: "B&O Railroad", boardIndex: 25, kind: "railroad", purchasePrice: 200, rent: 25, color: "#1f2937" },
  { slug: "atl", name: "Atlantic Avenue", boardIndex: 26, kind: "street", purchasePrice: 260, rent: 52, colorGroup: "yellow", color: "#eab308", houseCost: 150 },
  { slug: "ven", name: "Ventnor Avenue", boardIndex: 27, kind: "street", purchasePrice: 260, rent: 52, colorGroup: "yellow", color: "#eab308", houseCost: 150 },
  { slug: "wat", name: "Waterfront Avenue", boardIndex: 28, kind: "street", purchasePrice: 280, rent: 56, colorGroup: "yellow", color: "#eab308", houseCost: 150 },
  { slug: "mar", name: "Marvin Gardens", boardIndex: 29, kind: "street", purchasePrice: 280, rent: 56, colorGroup: "yellow", color: "#eab308", houseCost: 150 },
  { slug: "pac", name: "Pacific Avenue", boardIndex: 31, kind: "street", purchasePrice: 300, rent: 60, colorGroup: "green", color: "#22c55e", houseCost: 200 },
  { slug: "nc", name: "North Carolina Avenue", boardIndex: 32, kind: "street", purchasePrice: 300, rent: 60, colorGroup: "green", color: "#22c55e", houseCost: 200 },
  { slug: "pen", name: "Pennsylvania Avenue", boardIndex: 34, kind: "street", purchasePrice: 320, rent: 64, colorGroup: "green", color: "#22c55e", houseCost: 200 },
  { slug: "rr4", name: "Short Line Railroad", boardIndex: 35, kind: "railroad", purchasePrice: 200, rent: 25, color: "#1f2937" },
  { slug: "pk", name: "Park Place", boardIndex: 37, kind: "street", purchasePrice: 350, rent: 70, colorGroup: "dark_blue", color: "#1d4ed8", houseCost: 200 },
  { slug: "bw", name: "Boardwalk", boardIndex: 39, kind: "street", purchasePrice: 400, rent: 80, colorGroup: "dark_blue", color: "#1d4ed8", houseCost: 200 },
];

/** Per-space tax amounts keyed by board index. */
export const TAX_FEES: Record<number, number> = {
  4: 200,
  38: 100,
};

export function taxFeeForSpace(index: number): number {
  return TAX_FEES[index] ?? 100;
}

export function propertiesInColorGroup(group: string): PropertyPreset[] {
  return CLASSIC_BOARD_PROPERTIES.filter((p) => p.colorGroup === group);
}

export function buildBoardForGame(gameId: string): {
  spaces: BoardSpace[];
  properties: Omit<Property, "gameId" | "ownerTeamId" | "isMortgaged">[];
} {
  const spaces: BoardSpace[] = CLASSIC_BOARD_SPACES.map((s) => ({
    id: `${gameId}-space-${s.index}`,
    index: s.index,
    name: s.name,
    type: s.type,
    propertyId: undefined,
    deckType: s.deckType,
  }));
  const properties: Omit<Property, "gameId" | "ownerTeamId" | "isMortgaged">[] = [];
  for (const p of CLASSIC_BOARD_PROPERTIES) {
    const boardSpaceId = spaces[p.boardIndex]!.id;
    const propId = `${gameId}-prop-${p.slug}`;
    spaces[p.boardIndex]!.propertyId = propId;
    properties.push({
      id: propId,
      boardSpaceId,
      name: p.name,
      purchasePrice: p.purchasePrice,
      rent: p.rent,
      kind: p.kind,
      colorGroup: p.colorGroup,
      color: p.color,
      houseCost: p.houseCost,
      houses: 0,
    });
  }
  return { spaces, properties };
}

/** @deprecated Use CLASSIC_BOARD_SPACES — kept for tests referencing old export name. */
export const SIMPLE_BOARD_SPACES = CLASSIC_BOARD_SPACES;
export const SIMPLE_BOARD_PROPERTIES = CLASSIC_BOARD_PROPERTIES;
