import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  CLASSIC_BOARD_PROPERTIES,
  CLASSIC_BOARD_SPACES,
  buildBoardForGame,
  propertiesInColorGroup,
  taxFeeForSpace,
} from "./boardPresets.js";
import { countOwnedRailroads, effectiveRent, railroadRent, streetRent } from "./rent.js";
import type { Property } from "../types.js";

describe("classic board preset", () => {
  it("has 40 spaces and 28 ownable properties", () => {
    expect(BOARD_SIZE).toBe(40);
    expect(CLASSIC_BOARD_SPACES).toHaveLength(40);
    expect(CLASSIC_BOARD_PROPERTIES).toHaveLength(28);
    const { spaces, properties } = buildBoardForGame("test-game");
    expect(spaces).toHaveLength(40);
    expect(properties).toHaveLength(28);
    expect(spaces.filter((s) => s.type === "go")).toHaveLength(1);
    expect(spaces.filter((s) => s.type === "event")).toHaveLength(6);
    expect(spaces.filter((s) => s.type === "tax")).toHaveLength(2);
    expect(properties.filter((p) => p.kind === "railroad")).toHaveLength(4);
    expect(properties.filter((p) => p.kind === "street")).toHaveLength(24);
  });

  it("defines complete color groups", () => {
    const groups = new Set(CLASSIC_BOARD_PROPERTIES.map((p) => p.colorGroup).filter(Boolean));
    for (const g of groups) {
      expect(propertiesInColorGroup(g!).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("tax fees match classic amounts", () => {
    expect(taxFeeForSpace(4)).toBe(200);
    expect(taxFeeForSpace(38)).toBe(100);
  });
});

describe("rent helpers", () => {
  const street: Property = {
    id: "p1",
    gameId: "g",
    boardSpaceId: "s",
    name: "Test",
    purchasePrice: 100,
    rent: 20,
    ownerTeamId: null,
    isMortgaged: false,
    kind: "street",
    houses: 0,
  };
  const railroad: Property = { ...street, kind: "railroad", rent: 25, houses: 0 };

  it("street rent scales with houses and hotel", () => {
    expect(streetRent(20, 0)).toBe(20);
    expect(streetRent(20, 2)).toBe(60);
    expect(streetRent(20, 5)).toBe(120);
  });

  it("railroad rent scales with ownership count", () => {
    expect(railroadRent(25, 1)).toBe(25);
    expect(railroadRent(25, 2)).toBe(50);
    expect(railroadRent(25, 4)).toBe(200);
  });

  it("effectiveRent uses kind", () => {
    expect(effectiveRent({ ...street, houses: 3 }, 0)).toBe(80);
    expect(effectiveRent(railroad, 3)).toBe(100);
  });

  it("countOwnedRailroads ignores mortgaged", () => {
    const props: Property[] = [
      { ...railroad, id: "r1", ownerTeamId: "t1" },
      { ...railroad, id: "r2", ownerTeamId: "t1", isMortgaged: true },
      { ...railroad, id: "r3", ownerTeamId: "t2" },
    ];
    expect(countOwnedRailroads(props, "t1")).toBe(1);
  });
});
