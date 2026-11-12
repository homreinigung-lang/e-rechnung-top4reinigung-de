import { expect, it } from "vitest";
import { automaticAreaPrice } from "./analysis-area-price";

it.each([0, 150, 200])("keeps the 73.50 EUR analysis stable when performance data becomes %s m²/h", (sqmPerHour) => {
  let price = 0.35;
  const next = automaticAreaPrice({ analysis: { type: "unterhalt", hourlyRate: 35 }, cleaningType: "unterhalt", hourlyRate: 35, sqmPerHour });
  if (next !== null) price = next;
  expect(price * 210).toBe(73.5);
});
it("still derives manual prices when no analysis is imported", () => {
  expect(automaticAreaPrice({ analysis: null, cleaningType: "unterhalt", hourlyRate: 35, sqmPerHour: 150 })).toBeCloseTo(35 / 150);
});
it("recalculates after an actual hourly-rate change", () => {
  expect(automaticAreaPrice({ analysis: { type: "unterhalt", hourlyRate: 35 }, cleaningType: "unterhalt", hourlyRate: 40, sqmPerHour: 150 })).toBeCloseTo(40 / 150);
});
it("recalculates after changing the cleaning type", () => {
  expect(automaticAreaPrice({ analysis: { type: "unterhalt", hourlyRate: 35 }, cleaningType: "grund", hourlyRate: 35, sqmPerHour: 100 })).toBe(0.35);
});
