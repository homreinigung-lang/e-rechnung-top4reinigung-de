import { beforeEach, expect, it, vi } from "vitest";
import { useCalculationSave } from "./useCalculationSave";

const mocks = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useMutation: (options: unknown) => options }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, auth: { getUser: mocks.getUser } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
});

it.each([false, true])(
  "speichert einmalige Kalkulationen einschließlich Raumkalkulation dauerhaft als once (Räume: %s)",
  async (roomEnabled) => {
    const insert = vi
      .fn()
      .mockReturnValue({
        select: () => ({ single: async () => ({ data: { id: "calc" }, error: null }) }),
      });
    mocks.from.mockImplementation((table: string) =>
      table === "calculations"
        ? { insert }
        : { delete: () => ({ eq: async () => ({ error: null }) }) },
    );
    const result = useCalculationSave({
      roomCalculation: {
        version: 1,
        enabled: roomEnabled,
        rooms: roomEnabled
          ? [
              {
                id: "room",
                source: "manual",
                name: "Büro",
                floor: "",
                usage_type: "",
                floor_covering: "",
                area: "100",
                sqmPerHour: "100",
                rateLabel: "",
                frequency: "",
                frequencyUnit: "week",
                included: true,
              },
            ]
          : [],
      },
      calcTitle: "Einmalige Reinigung",
      proposalTitle: "",
      selected: { label: "Reinigung" },
      frequency: "7",
      frequencyUnit: "once",
      calcId: null,
      projectId: null,
      lvPositions: [],
      extras: [],
      hours: "3",
      hourlyRate: "40",
      lvTotal: 120,
    } as unknown as Parameters<typeof useCalculationSave>[0]);
    await (
      result.saveCalculation as unknown as { mutationFn: () => Promise<unknown> }
    ).mutationFn();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: 1, frequency_unit: "once" }),
    );
  },
);
