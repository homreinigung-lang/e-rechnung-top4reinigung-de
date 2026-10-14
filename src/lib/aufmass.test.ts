import { describe, expect, it } from "vitest";
import { measuredArea } from "./aufmass";
import { isLockedDocument } from "./gobd-guard";

describe("Aufmaß and supplement protection", () => {
  it("rounds rectangular measurements to square centimetres expressed as m²", () => {
    expect(measuredArea(3.33, 4.44)).toBe(14.79);
  });
  it("retains manual area entry until two positive finite dimensions exist", () => {
    for (const dimensions of [
      [null, 4],
      [3, undefined],
      [0, 4],
      [-2, 4],
      [Infinity, 4],
      [NaN, 4],
    ] as const) {
      expect(measuredArea(...dimensions)).toBeNull();
    }
  });
  it("freezes approved supplements but keeps normal offers and supplement drafts editable", () => {
    expect(
      isLockedDocument({ type: "quote", parent_order_id: "order", approved_at: "2026-10-15" }),
    ).toBe(true);
    expect(isLockedDocument({ type: "quote", parent_order_id: "order", approved_at: null })).toBe(
      false,
    );
    expect(isLockedDocument({ type: "quote", status: "accepted" })).toBe(false);
    expect(isLockedDocument({ type: "invoice", locked_at: "2026-10-15" })).toBe(true);
  });
});
