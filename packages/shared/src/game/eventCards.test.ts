import { describe, expect, it } from "vitest";
import { ACCRUAL_EVENT_DECK, CASH_EVENT_DECK } from "./eventCards.js";

describe("event card decks", () => {
  it("uses Event Expense fallback for all card expenses (no per-card expenseAccount)", () => {
    const cards = [...CASH_EVENT_DECK, ...ACCRUAL_EVENT_DECK];
    for (const card of cards) {
      expect(card.expenseAccount).toBeUndefined();
    }
  });
});
