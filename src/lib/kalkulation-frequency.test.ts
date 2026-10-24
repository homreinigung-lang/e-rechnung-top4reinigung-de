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
