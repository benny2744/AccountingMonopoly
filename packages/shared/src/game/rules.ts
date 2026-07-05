import type { GameSettings } from "../types.js";

// PRD §7.1 — default game settings.
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  propertyAllocationRatio: 0.5,
  startingCash: 1500,
  startingLoanLimit: 500,
  boardPreset: "classic",
  journalEntryMode: "autoPostCounterparty",
  allowStudentFullHint: false,
  showScores: true,
};

// PRD §13.3 — interest per dice roll.
export function calculateInterestCharge(loanBalance: number): number {
  if (loanBalance <= 0) return 0;
  return Math.max(10, Math.ceil(loanBalance * 0.01));
}

// PRD §12.2 — credit limit check.
export function canTakeCredit(currentAP: number, additionalAmount: number, creditLimit: number): boolean {
  return currentAP + additionalAmount <= creditLimit;
}

// Team color palette (PRD §18.2 color field). Index by team join order.
export const TEAM_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#f97316", "#14b8a6"];
export const TEAM_NAMES = ["Red", "Blue", "Green", "Yellow", "Purple", "Pink", "Orange", "Teal"];

export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length]!;
}

export function teamName(index: number): string {
  return TEAM_NAMES[index % TEAM_NAMES.length]!;
}
