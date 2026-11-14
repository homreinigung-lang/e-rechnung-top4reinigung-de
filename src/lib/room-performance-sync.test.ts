import { expect, it } from "vitest";
import { calculateRooms, roomsFromScan, syncRoomPerformanceRates, readRoomCalculation } from "./room-calculation";
import type { PerformanceRate } from "./leistungswerte";

const rate: PerformanceRate = { id: "office", label: "Büro", usage_type: "Büro", floor_covering: "", sqm_per_hour: 100, active: true };
function saved() {
  const rooms = roomsFromScan("plan", [{ name: "Büro", floor: "EG", usage_type: "Büro", floor_covering: "", area_sqm: 100 }], [rate]);
  return readRoomCalculation(JSON.parse(JSON.stringify({ version: 1, enabled: true, rooms: rooms.map(room => ({ ...room, frequency: "1", frequencyUnit: "month" })) })));
}
it("updates a reopened saved calculation and its hours and price without manual input", () => {
  const old = saved();
  expect(calculateRooms(old, 30).monthlyHours).toBe(1);
  const current = syncRoomPerformanceRates(old, [{ ...rate, sqm_per_hour: 200 }]);
  expect(current.rooms[0]?.sqmPerHour).toBe("200");
  expect(current.rooms[0]?.minutesPerVisit).toBe("30");
  const totals = calculateRooms(current, 30);
  expect(totals.monthlyHours).toBe(0.5);
  expect(totals.positions).toHaveLength(1);
  const position = totals.positions[0]!;
  expect(position.unit_price * position.quantity).toBe(15);
  expect(syncRoomPerformanceRates(current, [{ ...rate, sqm_per_hour: 200 }])).toBe(current);
});
it("updates older saved rooms linked by label and keeps the link after a rename", () => {
  const old = saved();
  delete old.rooms[0]!.performanceRateId;
  const current = syncRoomPerformanceRates(old, [{ ...rate, sqm_per_hour: 200 }]);
  const renamed = syncRoomPerformanceRates(current, [{ ...rate, label: "Office", sqm_per_hour: 250 }]);
  expect(renamed.rooms[0]).toMatchObject({ rateLabel: "Office", sqmPerHour: "250" });
});
it("preserves deliberately entered productivity and documented or manual minutes", () => {
  for (const minutesOrigin of ["document", undefined] as const) {
    const old = saved();
    Object.assign(old.rooms[0]!, { minutesOrigin, minutesPerVisit: "42" });
    expect(syncRoomPerformanceRates(old, [{ ...rate, sqm_per_hour: 200 }]).rooms[0]?.minutesPerVisit).toBe("42");
  }
  const manual = saved();
  manual.rooms[0]!.rateLabel = "Eigener Leistungswert";
  expect(syncRoomPerformanceRates(manual, [{ ...rate, sqm_per_hour: 200 }])).toBe(manual);
});
it("does not replace saved values when rates are unavailable", () => {
  const old = saved();
  expect(syncRoomPerformanceRates(old, [])).toBe(old);
});
