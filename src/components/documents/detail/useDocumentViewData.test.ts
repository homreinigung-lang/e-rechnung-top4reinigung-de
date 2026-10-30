import { expect, it, vi } from "vitest";
import { useDocumentViewData } from "./useDocumentViewData";

vi.mock("@/lib/doc-number", () => ({
  ensureOfficialNumber: vi.fn(),
  isDraftPlaceholder: () => false,
}));

function pick(
  taxMode: string,
  customerId: string | null,
  customer: Record<string, unknown>,
  allowed = false,
) {
  let form: Record<string, string | boolean | null> = {
    tax_mode: taxMode,
    customer_id: customerId,
  };
  const view = useDocumentViewData({
    data: {
      doc: { type: "quote", number: "AN-TEST", status: "draft" },
      settings: {},
      customers: [customer],
      projects: [],
    },
    form,
    grossTotal: 1000,
    netTotal: 1000,
    vatAmount: 0,
    vatRate: 0,
    id: "isolated-quote",
    items: [],
    reverseChargeAllowed: allowed,
    queryClient: {},
    setItems: vi.fn(),
    setQuoteRecipientMode: vi.fn(),
    setForm: (fn: (value: typeof form) => typeof form) => {
      form = fn(form);
    },
  } as unknown as Parameters<typeof useDocumentViewData>[0]);
  view.pickCustomer(String(customer["id"]));
  return form["tax_mode"];
}

const company = {
  id: "customer-a",
  name: "Synthetic",
  company: "Synthetic GmbH",
  country: "Deutschland",
};
it("preserves explicitly selected domestic §13b for the same customer", () => {
  expect(pick("domestic_reverse_charge", "customer-a", company)).toBe("domestic_reverse_charge");
  expect(pick("domestic_reverse_charge", null, company)).toBe("domestic_reverse_charge");
});
it("requires a fresh §13b choice after switching to another customer", () => {
  expect(pick("domestic_reverse_charge", "customer-b", company)).toBe("domestic");
});
it("does not carry domestic §13b to a private customer", () => {
  expect(pick("domestic_reverse_charge", "customer-a", { ...company, company: "" })).toBe(
    "domestic",
  );
});
it("preserves the EU subscription gate and Kleinunternehmer priority", () => {
  const eu = { ...company, is_eu_customer: true, vat_id: "ATU12345678" };
  expect(pick("domestic_reverse_charge", "customer-a", eu)).toBe("domestic");
  expect(pick("domestic_reverse_charge", "customer-a", eu, true)).toBe("eu_reverse_charge");
  expect(pick("kleinunternehmer", "customer-a", eu, true)).toBe("kleinunternehmer");
});
