import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RoomCalculationEditor } from "./RoomCalculationEditor";
import type { KalkulationStateContext } from "./useKalkulationState";

vi.mock("@/lib/storage", () => ({ openStoredFile: vi.fn() }));

it("allows adding the first room without uploading a plan", () => {
  const state = {
    roomCalculation: { version: 1, enabled: false, rooms: [] },
    setRoomCalculation: vi.fn(),
    visiblePerformanceRates: [],
  } as unknown as KalkulationStateContext;
  const html = renderToStaticMarkup(createElement(RoomCalculationEditor, { state }));
  expect(html).toContain("Ersten Raum hinzufügen");
  expect(html).toContain("Minuten, Turnus und Stundensatz prüfen");
  expect(html).not.toContain("Raumkalkulation ist aktiv");
});

it("shows every room as a compact summary row until it is edited", () => {
  const room = {
    id: "room-1",
    source: "manual",
    name: "Büro 1",
    floor: "EG",
    usage_type: "Büro",
    floor_covering: "Teppich",
    area: "34",
    sqmPerHour: "170",
    rateLabel: "Unterhaltsreinigung",
    frequency: "1",
    frequencyUnit: "week",
    included: true,
    calculationMode: "area",
    minutesPerVisit: "12",
    tasks: "Boden und Oberflächen",
  } as const;
  const state = {
    roomCalculation: { version: 1, enabled: false, rooms: [room] },
    setRoomCalculation: vi.fn(),
    roomSummary: {
      rows: [{ room, hoursPerVisit: 0.2, monthlyHours: 0.87 }],
      area: 34,
      monthlyHours: 0.87,
      positions: [],
      errors: [],
    },
    visiblePerformanceRates: [],
    frequencyUnit: "month",
  } as unknown as KalkulationStateContext;

  const html = renderToStaticMarkup(createElement(RoomCalculationEditor, { state }));

  expect(html).toContain("Büro 1");
  expect(html).toContain("34 m²");
  expect(html).toContain("170 m²/Std.");
  expect(html).toContain("Bearbeiten");
  expect(html).not.toContain('id="room-0-name"');
  expect(html).not.toContain("Boden und Oberflächen");
});

