import { describe, expect, it } from "vitest";
import { getNormalBalance } from "../accounting/normalBalances.js";

describe("getNormalBalance (PRD §21.2)", () => {
  it("asset → debit", () => {
    expect(getNormalBalance("asset")).toBe("debit");
  });
  it("expense → debit", () => {
    expect(getNormalBalance("expense")).toBe("debit");
  });
  it("liability → credit", () => {
    expect(getNormalBalance("liability")).toBe("credit");
  });
  it("equity → credit", () => {
    expect(getNormalBalance("equity")).toBe("credit");
  });
  it("revenue → credit", () => {
    expect(getNormalBalance("revenue")).toBe("credit");
  });
});
