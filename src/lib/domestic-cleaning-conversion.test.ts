import { beforeEach, expect, it, vi } from "vitest";
import { convertOrderToInvoice, convertQuoteToInvoice, convertQuoteToOrder } from "./workflow";

const m = vi.hoisted(() => ({
  from: vi.fn(),
  docInsert: vi.fn(),
  itemInsert: vi.fn(),
  source: {} as Record<string, unknown>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: m.from,
    auth: { getUser: async () => ({ data: { user: { id: "synthetic-owner" } } }) },
  },
}));
vi.mock("./gobd", () => ({ logAudit: vi.fn() }));
vi.mock("./doc-number", () => ({
  draftPlaceholderNumber: () => "DEMO-TEST",
  ensureOfficialNumber: async () => "AN-TEST",
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.docInsert.mockImplementation(() => ({
    select: () => ({ single: async () => ({ data: { id: "synthetic-target" }, error: null }) }),
  }));
  m.itemInsert.mockResolvedValue({ error: null });
  m.from.mockImplementation((table: string) => {
    if (table === "company_settings")
      return {
        select: () => ({ maybeSingle: async () => ({ data: { payment_terms_days: 14 } }) }),
      };
    if (table === "document_items")
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [
                { quantity: 4, unit: "Std", unit_price: 250, description: "Synthetic cleaning" },
              ],
              error: null,
            }),
          }),
        }),
        insert: m.itemInsert,
      };
    const claim: Record<string, unknown> = {
      select: async () => ({ data: [{ id: "synthetic-source" }], error: null }),
    };
    for (const method of ["eq", "is", "or"]) claim[method] = () => claim;
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: m.source, error: null }) }) }),
      insert: m.docInsert,
      update: () => claim,
    };
  });
});

it.each(["domestic", "domestic_reverse_charge", "eu_reverse_charge", "kleinunternehmer"])(
  "preserves %s from quote to order/invoice and order to invoice",
  async (mode) => {
    for (const [sourceType, targetType, convert] of [
      ["quote", "order", convertQuoteToOrder],
      ["quote", "invoice", convertQuoteToInvoice],
      ["order", "invoice", convertOrderToInvoice],
    ] as const) {
      m.source = {
        id: "synthetic-source",
        user_id: "synthetic-owner",
        type: sourceType,
        status: sourceType === "quote" ? "accepted" : "sent",
        tax_mode: mode,
        reverse_charge: mode.includes("reverse_charge"),
        vat_rate: mode === "domestic" ? 19 : 0,
        net_total: 1000,
        vat_amount: mode === "domestic" ? 190 : 0,
        total: mode === "domestic" ? 1190 : 1000,
        locked_at: "2026-10-29T12:00:00Z",
        pdf_path: "synthetic-old.pdf",
        pdf_sha256: "old-hash",
      };
      await expect(convert("synthetic-source")).resolves.toBe("synthetic-target");
      expect(m.docInsert.mock.lastCall?.[0]).toMatchObject({
        type: targetType,
        status: "draft",
        tax_mode: mode,
        reverse_charge: mode.includes("reverse_charge"),
        vat_rate: m.source["vat_rate"],
        net_total: 1000,
        vat_amount: m.source["vat_amount"],
        total: m.source["total"],
      });
      expect(m.docInsert.mock.lastCall?.[0]).not.toHaveProperty("pdf_sha256");
      expect(m.docInsert.mock.lastCall?.[0]).not.toHaveProperty("locked_at");
      expect(m.itemInsert).toHaveBeenLastCalledWith([
        expect.objectContaining({ quantity: 4, unit_price: 250 }),
      ]);
    }
  },
);
