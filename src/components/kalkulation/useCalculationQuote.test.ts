import { beforeEach, expect, it, vi } from "vitest";
import { useCalculationQuote } from "./useCalculationQuote";

const mocks = vi.hoisted(() => ({ create: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useMutation: (options: unknown) => options }));
vi.mock("@/lib/create-document", () => ({ createDocument: mocks.create }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, auth: { getUser: mocks.getUser } } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue("quote-test");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "isolated-user" } } });
});

function quote(overrides: Partial<Parameters<typeof useCalculationQuote>[0]> = {}) {
  const result = useCalculationQuote({
    confirmed: true, calcOutOfSync: false, roomCalculation: { enabled: false, rooms: [] },
    annualVisits: 12, discountReason: "", floorplanSummary: "", frequency: "1", frequencyUnit: "month",
    lvPositions: [
      { description: "Reinigung", quantity: 150, unit: "m²", unit_price: 1.3 },
      { description: "Anfahrt", quantity: 1, unit: "Pauschal", unit_price: 15 },
    ],
    monthlyHours: 1.25, navigate: vi.fn(), note: "", pct: 0, proposalText: "", proposalTitle: "",
    selected: { value: "unterhalt", label: "Unterhaltsreinigung", area: 1.3, hourly: 35 },
    taxMode: "domestic", vatRate: 19, visitsPerMonth: 1, warnings: [], ...overrides,
  } as Parameters<typeof useCalculationQuote>[0]);
  return result.toQuote as unknown as { mutationFn: () => Promise<string> };
}

it("creates precisely the reviewed 210 EUR positions and matching document totals", async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  mocks.from.mockImplementation((table: string) => table === "document_items" ? { insert } : { update });
  await expect(quote().mutationFn()).resolves.toBe("quote-test");
  expect(insert.mock.calls[0]![0]).toMatchObject([
    { quantity: 150, unit_price: 1.3, position: 1 },
    { quantity: 1, unit_price: 15, position: 2 },
  ]);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ net_total: 210, vat_amount: 39.9, total: 249.9, discount_percent: 0, discount_amount: 0 }));
});

it.each([
  { confirmed: false }, { warnings: ["Unvollständig"] }, { lvPositions: [] },
])("rejects unsafe transfers before creating any document: %j", async (overrides) => {
  await expect(quote(overrides).mutationFn()).rejects.toThrow();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});
