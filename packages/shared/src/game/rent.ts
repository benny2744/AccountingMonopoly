import type { Property } from "../types.js";

/** Simplified street rent: base × (1 + houses); hotel (houses=5) uses ×6. */
export function streetRent(baseRent: number, houses: number): number {
  if (houses >= 5) return baseRent * 6;
  return baseRent * (1 + houses);
}

/** Railroad rent scales with how many railroads the owner holds (25/50/100/200 pattern). */
export function railroadRent(baseRent: number, ownedRailroads: number): number {
  if (ownedRailroads <= 0) return 0;
  return baseRent * 2 ** (ownedRailroads - 1);
}

export function effectiveRent(prop: Property, ownedRailroads: number): number {
  if (prop.kind === "railroad") return railroadRent(prop.rent, ownedRailroads);
  return streetRent(prop.rent, prop.houses);
}

export function countOwnedRailroads(properties: Property[], ownerTeamId: string): number {
  return properties.filter((p) => p.kind === "railroad" && p.ownerTeamId === ownerTeamId && !p.isMortgaged).length;
}
