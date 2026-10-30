import { beforeEach, expect, it, vi } from "vitest";
import { buildInitialDocumentForm } from "@/lib/document-initial-form";
import { useDocumentDetailForm } from "./useDocumentDetailForm";

const m = vi.hoisted(() => ({
  stateIndex: 0,
  form: {} as Record<string, unknown>,
  data: {} as Record<string, unknown>,
  canReverse: false,
  update: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => [
    m.stateIndex++ === 2
      ? m.form
      : m.stateIndex === 4
        ? [
            {
              id: "item",
              position: 1,
              description: "Reinigung",
              quantity: 4,
              unit: "Std",
              unit_price: 250,
            },
          ]
        : initial,
    vi.fn(),
  ],
  useEffect: vi.fn(),
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  getRouteApi: () => ({
    useParams: () => ({ id: "isolated-document" }),
    useSearch: () => ({ bearbeiten: true }),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: m.data, isLoading: false }),
  useQueryClient: () => ({}),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from, auth: { getUser: m.getUser } },
}));
vi.mock("@/lib/subscriptions", () => ({
  useCanReverseCharge: () => ({ canReverseCharge: m.canReverse, isLoading: false }),
}));
vi.mock("@/hooks/useFileUrl", () => ({ useFileUrl: () => "" }));
vi.mock("@/lib/invoice-duplicate", () => ({ findDuplicateInvoice: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  m.stateIndex = 0;
  m.canReverse = false;
  m.getUser.mockResolvedValue({ data: { user: { id: "isolated-owner" } } });
  m.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  m.from.mockImplementation((table: string) =>
    table === "documents"
      ? { update: m.update }
      : {
          delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        },
  );
});

function editor(mode: string, type = "invoice", extra: Record<string, unknown> = {}) {
  m.form = { tax_mode: mode, status: "draft", issue_date: "2026-10-29", discount_percent: "10" };
  m.data = {
    doc: { type, status: "draft", number: "TEST-2026", tax_mode: mode },
    settings: {},
    projects: [],
    ...extra,
  };
  return useDocumentDetailForm();
}

it.each(["invoice", "quote"])("saves and reopens all four tax modes for %s", async (type) => {
  for (const mode of [
    "domestic",
    "domestic_reverse_charge",
    "eu_reverse_charge",
    "kleinunternehmer",
  ]) {
    m.stateIndex = 0;
    const view = editor(mode, type);
    await view.persistDocument();
    const payload = m.update.mock.lastCall?.[0];
    expect(payload).toMatchObject({
      tax_mode: mode,
      vat_rate: mode === "domestic" ? 19 : 0,
      reverse_charge: mode.includes("reverse_charge"),
      net_total: 900,
      vat_amount: mode === "domestic" ? 171 : 0,
      total: mode === "domestic" ? 1071 : 900,
    });
    expect(buildInitialDocumentForm({ doc: payload, settings: {} })["tax_mode"]).toBe(mode);
  }
});

it("keeps §19 priority even if domestic §13b is selected", async () => {
  const view = editor("domestic_reverse_charge", "invoice", { settings: { small_business: true } });
  await view.persistDocument();
  expect(m.update.mock.lastCall?.[0]).toMatchObject({
    tax_mode: "kleinunternehmer",
    reverse_charge: false,
    vat_rate: 0,
    vat_amount: 0,
    total: 900,
  });
});
it("blocks saving a locked domestic §13b invoice before any database write", async () => {
  const view = editor("domestic_reverse_charge", "invoice", {
    doc: {
      type: "invoice",
      tax_mode: "domestic_reverse_charge",
      locked_at: "2026-10-29T12:00:00Z",
    },
  });
  await expect(view.persistDocument()).rejects.toThrow("festgeschrieben");
  expect(m.from).not.toHaveBeenCalled();
});
