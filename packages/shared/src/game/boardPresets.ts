import type { BoardSpace, Property } from "../types.js";

export const BOARD_SIZE = 24;

// PRD §8.1 simple board layout, 24 spaces.
interface BoardPresetSpace {
  index: number;
  name: string;
  type: BoardSpace["type"];
  deckType?: "cash" | "accrual";
}

export const SIMPLE_BOARD_SPACES: readonly BoardPresetSpace[] = [
  { index: 0, name: "GO / Year Start", type: "go" },
  { index: 1, name: "Property A", type: "property" },
  { index: 2, name: "Cash Event", type: "event", deckType: "cash" },
  { index: 3, name: "Property B", type: "property" },
  { index: 4, name: "Bank", type: "bank" },
  { index: 5, name: "Property C", type: "property" },
  { index: 6, name: "Cash/Accrual Event", type: "event", deckType: "cash" },
  { index: 7, name: "Property D", type: "property" },
  { index: 8, name: "Repair Space", type: "repair" },
  { index: 9, name: "Property E", type: "property" },
  { index: 10, name: "Charity / Community", type: "charity" },
  { index: 11, name: "Free Parking / Rest", type: "rest" },
  { index: 12, name: "Property F", type: "property" },
  { index: 13, name: "Event", type: "event", deckType: "cash" },
  { index: 14, name: "Property G", type: "property" },
  { index: 15, name: "Bank", type: "bank" },
  { index: 16, name: "Property H", type: "property" },
  { index: 17, name: "Road Closure", type: "road_closure" },
  { index: 18, name: "Property I", type: "property" },
  { index: 19, name: "Event", type: "event", deckType: "cash" },
  { index: 20, name: "Property J", type: "property" },
  { index: 21, name: "Tax / Fee Space", type: "tax" },
  { index: 22, name: "Property K", type: "property" },
  { index: 23, name: "Year-End Checkpoint / GO", type: "go" },
];

// Property definitions for the 11 property spaces A–K.
// Prices ramp around the board; rent ≈ 20% of price.
export interface PropertyPreset {
  letter: string;
  name: string;
  purchasePrice: number;
  rent: number;
  color: string;
  boardIndex: number;
}

export const SIMPLE_BOARD_PROPERTIES: readonly PropertyPreset[] = [
  { letter: "A", name: "Property A", purchasePrice: 100, rent: 20, color: "#8b5cf6", boardIndex: 1 },
  { letter: "B", name: "Property B", purchasePrice: 120, rent: 24, color: "#8b5cf6", boardIndex: 3 },
  { letter: "C", name: "Property C", purchasePrice: 140, rent: 28, color: "#06b6d4", boardIndex: 5 },
  { letter: "D", name: "Property D", purchasePrice: 160, rent: 32, color: "#06b6d4", boardIndex: 7 },
  { letter: "E", name: "Property E", purchasePrice: 180, rent: 36, color: "#06b6d4", boardIndex: 9 },
  { letter: "F", name: "Property F", purchasePrice: 200, rent: 40, color: "#22c55e", boardIndex: 12 },
  { letter: "G", name: "Property G", purchasePrice: 220, rent: 44, color: "#22c55e", boardIndex: 14 },
  { letter: "H", name: "Property H", purchasePrice: 240, rent: 48, color: "#eab308", boardIndex: 16 },
  { letter: "I", name: "Property I", purchasePrice: 260, rent: 52, color: "#eab308", boardIndex: 18 },
  { letter: "J", name: "Property J", purchasePrice: 300, rent: 60, color: "#ef4444", boardIndex: 20 },
  { letter: "K", name: "Property K", purchasePrice: 350, rent: 70, color: "#ef4444", boardIndex: 22 },
];

// Fixed-amount fees for non-property landing spaces (PRD §8.1 repair/charity/etc.).
export const SPACE_FEES: Record<string, number> = {
  repair: 100,
  charity: 100,
  road_closure: 120,
  tax: 100,
};

export function buildBoardForGame(gameId: string): { spaces: BoardSpace[]; properties: Omit<Property, "gameId" | "ownerTeamId" | "isMortgaged">[] } {
  const spaces: BoardSpace[] = SIMPLE_BOARD_SPACES.map((s) => ({
    id: `${gameId}-space-${s.index}`,
    index: s.index,
    name: s.name,
    type: s.type,
    propertyId: undefined,
    deckType: s.deckType,
  }));
  const properties: Omit<Property, "gameId" | "ownerTeamId" | "isMortgaged">[] = [];
  for (const p of SIMPLE_BOARD_PROPERTIES) {
    const boardSpaceId = spaces[p.boardIndex]!.id;
    const propId = `${gameId}-prop-${p.letter}`;
    spaces[p.boardIndex]!.propertyId = propId;
    properties.push({
      id: propId,
      boardSpaceId,
      name: p.name,
      purchasePrice: p.purchasePrice,
      rent: p.rent,
    });
  }
  return { spaces, properties };
}
