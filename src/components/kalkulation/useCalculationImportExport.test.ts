import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { useCalculationImportExport } from "./useCalculationImportExport";

const mocks = vi.hoisted(() => ({ from: vi.fn(), pdf: vi.fn(), save: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useMutation: (options: unknown) => options }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/lv-pdf", () => ({ buildLvPdf: mocks.pdf }));
vi.mock("@/lib/download", () => ({ saveFile: mocks.save }));

function hook(extra: Record<string, unknown> = {}) {
  let result: ReturnType<typeof useCalculationImportExport>;
  const setters = Object.fromEntries(
    [
      "RoomCalculation",
      "CalcId",
      "CalcTitle",
      "ProjectId",
      "Type",
      "Mode",
      "Area",
      "GlassArea",
      "PricePerSqm",
      "Hours",
      "HourlyRate",
      "Frequency",
      "FrequencyUnit",
      "Travel",
      "Extras",
      "Stairs",
      "Floors",
      "StairRate",
      "StairFrequency",
      "HasLift",
      "LiftRate",
      "DiscountPercent",
      "DiscountAmountInput",
      "DiscountReason",
      "TaxMode",
      "Note",
      "ProposalTitle",
      "ProposalText",
      "LvItems",
    ].map((name) => [`set${name}`, vi.fn()]),
  );
  const input = {
    search: {},
    roomCalculation: { enabled: false, rooms: [] },
    frequencyUnit: "once",
    mode: "hours",
    area: "100",
    analysisTotals: { sqm: 100 },
    monthlyHours: 3,
    lvPositions: [
      { description: "Einmalige Reinigung", quantity: 3, unit: "Std.", unit_price: 40 },
    ],
    selected: { label: "Reinigung" },
    vatRate: 19,
    visitsPerMonth: 1,
    proposalTitle: "",
    proposalText: "",
    floorplanSummary: "",
    ...setters,
    ...extra,
  };
  function Component() {
    result = useCalculationImportExport(
      input as unknown as Parameters<typeof useCalculationImportExport>[0],
    );
    return null;
  }
  renderToStaticMarkup(createElement(Component));
  return { result: result!, setters };
}

it("kennzeichnet das PDF als vollständigen Einmalauftrag statt als Monatspreis", async () => {
  mocks.from.mockReturnValue({ select: () => ({ maybeSingle: async () => ({ data: {} }) }) });
  mocks.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  const { result } = hook();
  await (result.exportLv as unknown as { mutationFn: () => Promise<void> }).mutationFn();
  const data = mocks.pdf.mock.calls.at(-1)![0];
  expect(data.meta).toContainEqual({
    label: "Einmaliger Auftrag",
    value: "Ein Einsatz, Gesamtpreis",
  });
  expect(data.meta).toContainEqual({ label: "Stundenbedarf", value: "3 Std./Auftrag" });
  expect(data.positions[0]).toMatchObject({ quantity: 3, unitPrice: 40 });
  expect(JSON.stringify(data)).not.toContain("Monat");
});

it("lädt einen gespeicherten Einmalauftrag mit Raumdaten wieder als once", () => {
  const { result, setters } = hook();
  (result.loadCalculation as unknown as { onSuccess: (value: unknown) => void }).onSuccess({
    head: {
      id: "saved",
      frequency: 1,
      frequency_unit: "once",
      room_calculation: { version: 1, enabled: true, rooms: [] },
    },
    items: [],
  });
  expect(setters["setFrequencyUnit"]).toHaveBeenCalledWith("once");
  expect(setters["setRoomCalculation"]).toHaveBeenCalledWith({ version: 1, enabled: true, rooms: [] });
});
