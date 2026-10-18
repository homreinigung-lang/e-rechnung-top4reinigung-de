import { describe, expect, it } from "vitest";
import { DEFAULT_PERFORMANCE_RATES } from "./leistungswerte";
import {
  calculateRooms,
  emptyRoomCalculation,
  readRoomCalculation,
  replaceScannedRooms,
  roomsFromScan,
} from "./room-calculation";
import { positionsTotal } from "./kalkulation-engine";

const rates = DEFAULT_PERFORMANCE_RATES.map((rate, i) => ({
  ...rate,
  id: String(i),
  active: true,
}));
const scan = [
  { name: "Büro 1", usage_type: "Büro", floor: "EG", floor_covering: "Teppich", area_sqm: 30 },
  { name: "Büro 2", usage_type: "Büro", floor: "EG", floor_covering: "Linoleum", area_sqm: 30 },
  { name: "Flur", usage_type: "Flur", floor: "EG", floor_covering: "PVC", area_sqm: 20 },
  { name: "WC", usage_type: "WC", floor: "EG", floor_covering: "Fliesen", area_sqm: 10 },
  { name: "Teeküche", usage_type: "Küche", floor: "EG", floor_covering: "Fliesen", area_sqm: 10 },
];
function scheduled() {
  return {
    ...emptyRoomCalculation(),
    enabled: true,
    rooms: roomsFromScan("plan.pdf", scan, rates).map((room) => ({ ...room, frequency: "2" })),
  };
}

describe("Grundriss → Raumstunden → Angebot", () => {
  it("behält alle Räume und ordnet Linoleum dem PVC-Ansatz statt Teppich zu", () => {
    const rooms = roomsFromScan("plan.pdf", scan, rates);
    expect(rooms).toHaveLength(5);
    expect(rooms.map((room) => room.sqmPerHour)).toEqual(["250", "220", "300", "60", "100"]);
    expect(rooms.every((room) => room.frequency === "")).toBe(true);
    expect(calculateRooms({ version: 1, enabled: true, rooms }, 35).errors).toHaveLength(5);
  });

  it("berechnet den Testplan mit 52 Wochen pro Jahr und denselben gerundeten Mengen im Angebot", () => {
    const result = calculateRooms(scheduled(), 35);
    expect(result.errors).toEqual([]);
    expect(result.area).toBe(100);
    expect(result.rows[0]?.hoursPerVisit).toBeCloseTo(0.12);
    expect(result.rows[0]?.visitsPerMonth).toBeCloseTo(104 / 12);
    expect(result.monthlyHours).toBe(5.11);
    expect(result.commonVisitsPerMonth).toBeCloseTo(104 / 12);
    expect(result.positions.reduce((sum, item) => sum + item.quantity, 0)).toBeCloseTo(
      result.monthlyHours,
    );
    expect(positionsTotal(result.positions)).toBe(178.85);
  });

  it("berücksichtigt unterschiedliche Turnusse pro Raum und schließt abgewählte Räume aus", () => {
    const data = scheduled();
    data.rooms[0] = { ...data.rooms[0]!, frequency: "1", frequencyUnit: "month" };
    data.rooms[1] = { ...data.rooms[1]!, included: false, frequency: "", sqmPerHour: "" };
    const result = calculateRooms(data, 35);
    expect(result.errors).toEqual([]);
    expect(result.area).toBe(70);
    expect(result.monthlyHours).toBe(3.01);
    expect(result.commonVisitsPerMonth).toBe(0);
    expect(result.positions).toHaveLength(4);
    expect(result.positions[0]?.description).toContain("1 pro Monat");
  });

  it.each(["area", "sqmPerHour", "frequency"] as const)(
    "blockiert bei fehlendem %s den ganzen Positionssatz statt Teilangebote zu erzeugen",
    (field) => {
      const data = scheduled();
      data.rooms[0] = { ...data.rooms[0]!, [field]: "0" };
      const result = calculateRooms(data, 35);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.positions).toEqual([]);
    },
  );

  it("erfordert für unbekannte Räume einen eigenen Leistungswert", () => {
    const rooms = roomsFromScan(
      "x",
      [{ name: "Unbekannt", usage_type: "", floor: "", floor_covering: "", area_sqm: 20 }],
      rates,
    );
    expect(rooms[0]?.sqmPerHour).toBe("");
  });

  it("ersetzt erneute Scans ohne Duplikate und erhält andere Pläne", () => {
    const data = scheduled();
    const other = roomsFromScan("other.pdf", scan.slice(0, 1), rates);
    const result = replaceScannedRooms(
      { ...data, rooms: [...data.rooms, ...other] },
      "plan.pdf",
      roomsFromScan("plan.pdf", scan.slice(0, 2), rates),
    );
    expect(result.rooms).toHaveLength(3);
    expect(result.rooms.filter((room) => room.source === "other.pdf")).toEqual(other);
  });

  it("speichert und lädt alle geprüften Raumdaten verlustfrei", () => {
    const data = scheduled();
    data.rooms[0] = {
      ...data.rooms[0]!,
      sqmPerHour: "175,5",
      rateLabel: "Eigener Wert",
      frequencyUnit: "fortnight",
    };
    const restored = readRoomCalculation(JSON.parse(JSON.stringify(data)));
    expect(restored).toEqual(data);
    expect(calculateRooms(restored, 35)).toEqual(calculateRooms(data, 35));
    expect(readRoomCalculation(null)).toEqual(emptyRoomCalculation());
    expect(readRoomCalculation({ version: 2, enabled: true, rooms: [] })).toEqual(
      emptyRoomCalculation(),
    );
    expect(readRoomCalculation({ ...data, rooms: [...data.rooms, data.rooms[0]] })).toEqual(
      emptyRoomCalculation(),
    );
  });
});
