import { describe, expect, it } from "vitest";
import { DEFAULT_PERFORMANCE_RATES } from "./leistungswerte";
import { suggestRoomDefaults } from "./room-calculation";
import {
  type RoomCalculation,
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

it("ergänzt im 100-m²-Testplan editierbare Zeit- und Aufgabenvorschläge ohne erfundenen Turnus", () => {
  const rooms = roomsFromScan("plan.pdf", scan, rates);
  expect(rooms.map((r) => r.minutesPerVisit)).toEqual(["7,2", "8,2", "4", "10", "6"]);
  expect(rooms.every((r) => r.minutesOrigin === "estimate" && r.tasksOrigin === "estimate")).toBe(
    true,
  );
  expect(rooms[0]?.tasks).toContain("saugen");
  expect(rooms[3]?.tasks).toContain("WC, Waschbecken");
  expect(rooms[4]?.tasks).toContain("Spüle");
  expect(rooms.every((r) => r.frequency === "")).toBe(true);
  const result = calculateRooms(
    { version: 1, enabled: true, rooms: rooms.map((r) => ({ ...r, frequency: "2" })) },
    35,
  );
  expect(result.errors).toEqual([]);
  expect(result.monthlyHours).toBeGreaterThan(5);
  expect(
    readRoomCalculation(JSON.parse(JSON.stringify({ version: 1, enabled: false, rooms }))),
  ).toEqual({ version: 1, enabled: false, rooms });
});

it("bewahrt dokumentierte Minuten, Aufgaben und 14-täglichen Turnus statt Schätzungen einzusetzen", () => {
  const [room] = roomsFromScan(
    "plan",
    [
      {
        ...scan[0]!,
        minutes_per_visit: 17,
        cleaning_tasks: "Nur Boden saugen",
        cleaning_frequency: 1,
        cleaning_frequency_unit: "fortnight",
      },
    ],
    rates,
  );
  expect(room).toMatchObject({
    minutesPerVisit: "17",
    minutesOrigin: "document",
    tasks: "Nur Boden saugen",
    tasksOrigin: "document",
    frequency: "1",
    frequencyUnit: "fortnight",
  });
  expect(
    suggestRoomDefaults({ ...room!, minutesPerVisit: "22", tasks: "Eigener Umfang" }, rates),
  ).toMatchObject({ minutesPerVisit: "22", tasks: "Eigener Umfang" });
});

it("erfindet ohne Fläche oder Leistungswert keine Minuten", () => {
  const [unknown] = roomsFromScan("x", [{ ...scan[0]!, area_sqm: 0 }], rates);
  expect(unknown?.minutesPerVisit).toBe("");
  expect(roomsFromScan("x", scan, [])[0]?.minutesPerVisit).toBe("");
});
function scheduled(): RoomCalculation {
  return {
    ...emptyRoomCalculation(),
    enabled: true,
    rooms: roomsFromScan("plan.pdf", scan, rates).map((room) => ({
      ...room,
      calculationMode: "area" as const,
      frequency: "2",
    })),
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

it("rechnet Personalminuten mit gemischten Ansätzen und erhält sie beim Speichern", () => {
  const data = scheduled();
  data.rooms = data.rooms.slice(0, 2);
  data.rooms[0] = {
    ...data.rooms[0]!,
    calculationMode: "minutes",
    minutesPerVisit: "90",
    tasks: "Boden, WC, Abfall",
    area: "",
    sqmPerHour: "",
    frequency: "1",
  };
  const restored = readRoomCalculation(JSON.parse(JSON.stringify(data)));
  expect(restored).toEqual(data);
  const result = calculateRooms(restored, 35);
  expect(result.errors).toEqual([]);
  expect(result.rows[0]?.hoursPerVisit).toBe(1.5);
  expect(result.rows[0]?.monthlyHours).toBe(6.5);
  expect(result.positions[0]?.unit_price).toBe(35);
  expect(result.positions[0]?.description).toContain("90 Min./Besuch");
  expect(result.positions[0]?.description).toContain("Leistungen: Boden, WC, Abfall");
  expect(result.positions[0]?.description).not.toContain("m²/Std.");
  expect(positionsTotal([result.positions[0]!])).toBe(227.5);
  expect(result.positions[1]?.description).toContain("m²/Std.");
});

it.each(["", "0", "-5", "abc"])("blockiert ungültige Personalminuten %s", (minutes) => {
  const data = scheduled();
  data.rooms[0] = { ...data.rooms[0]!, calculationMode: "minutes", minutesPerVisit: minutes };
  expect(calculateRooms(data, 35).positions).toEqual([]);
  expect(calculateRooms(data, 35).errors.join()).toContain("Minuten je Besuch");
});

it("lädt alte Raumdaten ohne neue Felder weiter als Flächenansatz", () => {
  const data = scheduled();
  const legacy = JSON.parse(JSON.stringify(data));
  for (const room of legacy.rooms) {
    delete room.calculationMode;
    delete room.minutesPerVisit;
    delete room.tasks;
  }
  const restored = readRoomCalculation(legacy);
  expect(calculateRooms(restored, 35).monthlyHours).toBe(5.11);
  expect(
    readRoomCalculation({ ...legacy, rooms: [{ ...legacy.rooms[0], calculationMode: "unknown" }] }),
  ).toEqual(emptyRoomCalculation());
});

it("berechnet jeden ausgewählten Raum bei einem Einmalauftrag genau einmal ohne Pflichtturnus", () => {
  const calculation = scheduled();
  calculation.rooms = calculation.rooms.map((r) => ({
    ...r,
    calculationMode: "minutes",
    minutesPerVisit: "30",
    frequency: "",
  }));
  const result = calculateRooms(calculation, 40, true);
  expect(result.errors).toEqual([]);
  expect(result.monthlyHours).toBe(2.5);
  expect(positionsTotal(result.positions)).toBe(100);
  expect(result.positions.every((p) => p.description.includes("einmalige Reinigung"))).toBe(true);
  expect(result.positions.some((p) => p.description.includes("Monat"))).toBe(false);
});
