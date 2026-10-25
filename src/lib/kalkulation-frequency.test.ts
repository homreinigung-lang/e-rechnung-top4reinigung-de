import { expect, it } from "vitest";
import {
  buildConsolidatedPositions,
  positionsTotal,
  type ConsolidatedInput,
} from "./kalkulation-engine";
import { visitsPerMonth } from "./constants";

const base: ConsolidatedInput = {
  typeValue: "unterhalt",
  typeLabel: "Unterhaltsreinigung",
  mode: "hours",
  areaSqm: 100,
  pricePerSqm: 1,
  hours: 3,
  hourlyRate: 40,
  visitsPerMonth: visitsPerMonth(1, "quarter"),
  stairs: false,
  floors: 2,
  stairRate: 10,
  hasLift: false,
  liftRate: 5,
  extras: [],
  travel: 0,
  discountPercent: 0,
  discountReason: "",
};

it("verteilt eine vierteljährliche Reinigung auf den Monatsdurchschnitt", () => {
  const positions = buildConsolidatedPositions(base);
  expect(positions[0]?.quantity).toBe(1);
  expect(positionsTotal(positions)).toBe(40);
});

it("verteilt flächenbasierte Jahresreinigung ohne zusätzlichen Monatseinsatz", () => {
  const positions = buildConsolidatedPositions({
    ...base,
    mode: "area",
    areaSqm: 120,
    visitsPerMonth: visitsPerMonth(1, "year"),
  });
  expect(positionsTotal(positions)).toBe(10);
});

it("verteilt jährliche Glasreinigung korrekt auf zwölf Monate", () => {
  const positions = buildConsolidatedPositions({
    ...base,
    typeValue: "glas",
    performanceSqmPerHour: 40,
    mode: "area",
    areaSqm: 120,
    visitsPerMonth: visitsPerMonth(1, "year"),
  });
  expect(positions[0]?.quantity).toBe(0.25);
  expect(positionsTotal(positions)).toBe(10);
});

it("beachtet einen separaten vierteljährlichen Treppen- und Aufzugsturnus", () => {
  const positions = buildConsolidatedPositions({
    ...base,
    hours: 0,
    visitsPerMonth: 4,
    stairs: true,
    hasLift: true,
    stairVisitsPerMonth: visitsPerMonth(1, "quarter"),
  });
  expect(positions[0]?.quantity).toBeCloseTo(2 / 3);
  expect(positions[1]?.quantity).toBeCloseTo(1 / 3);
  expect(positionsTotal(positions)).toBe(8.34);
});

it("berechnet eine einmalige Reinigung samt Treppenhaus, Aufzug und Anfahrt genau einmal", () => {
  const positions = buildConsolidatedPositions({
    ...base,
    oneTime: true,
    visitsPerMonth: 52,
    stairs: true,
    hasLift: true,
    stairVisitsPerMonth: 8,
    travel: 15,
  });
  expect(positionsTotal(positions)).toBe(160);
  expect(positions[0]?.quantity).toBe(3);
  expect(positions[1]?.quantity).toBe(2);
  expect(positions[2]?.quantity).toBe(1);
  expect(positions.map((p) => p.description).join(" ")).not.toContain("Monat");
});

it("übernimmt einmalige Flächenreinigung als vollständigen Einsatzpreis", () => {
  const positions = buildConsolidatedPositions({
    ...base,
    oneTime: true,
    mode: "area",
    visitsPerMonth: 1 / 12,
  });
  expect(positionsTotal(positions)).toBe(100);
  expect(positions[0]?.quantity).toBe(1);
  expect(positions[0]?.description).toContain("einmalige Reinigung");
});
