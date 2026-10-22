import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RoomCalculationEditor } from "./RoomCalculationEditor";
import type { KalkulationStateContext } from "./useKalkulationState";

vi.mock("@/lib/storage", () => ({ openStoredFile: vi.fn() }));

it("allows adding the first room without uploading a plan", () => {
  const state = {
    roomCalculation: { version: 1, enabled: false, rooms: [] },
    setRoomCalculation: vi.fn(), visiblePerformanceRates: [],
  } as unknown as KalkulationStateContext;
  const html = renderToStaticMarkup(createElement(RoomCalculationEditor, { state }));
  expect(html).toContain("Ersten Raum hinzufügen");
  expect(html).toContain("Minuten, Turnus und Stundensatz prüfen");
  expect(html).not.toContain("Raumkalkulation ist aktiv");
});
