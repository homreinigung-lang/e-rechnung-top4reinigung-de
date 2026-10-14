import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplementPanel } from "./SupplementPanel";
import type { DocumentDetailStateContext } from "./detail/useDocumentDetailState";

const queries = vi.hoisted(() => ({ children: [] as Record<string, unknown>[] }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => createElement("a", {}, children),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "supplements" ? queries.children : { number: "AB-2026-1" },
    isPending: false,
    error: null,
  }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => createElement("button", {}, children),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: () => null,
  DialogContent: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
  DialogFooter: () => null,
}));
function render(doc: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(SupplementPanel, {
      state: { id: "document", docRecord: doc } as unknown as DocumentDetailStateContext,
    }),
  );
}
beforeEach(() => {
  queries.children = [];
});
describe("Nachtrag workflow display", () => {
  it("shows approval only on drafts, execution only after approval, invoicing only after execution", () => {
    const base = { type: "quote", parent_order_id: "order", status: "draft" };
    const draft = render(base);
    expect(draft).toContain("Kundenfreigabe dokumentieren");
    expect(draft).not.toContain("Als ausgeführt markieren");
    const approved = render({ ...base, status: "accepted", approved_at: "2026-10-15" });
    expect(approved).toContain("Als ausgeführt markieren");
    expect(approved).not.toContain("Nachtrag in Rechnung übernehmen");
    const complete = render({ ...base, approved_at: "2026-10-15", completed_at: "2026-10-16" });
    expect(complete).toContain("Nachtrag in Rechnung übernehmen");
    const invoiced = render({
      ...base,
      approved_at: "2026-10-15",
      completed_at: "2026-10-16",
      converted_document_id: "invoice",
    });
    expect(invoiced).toContain("Nachtragsrechnung öffnen");
    expect(invoiced).not.toContain("Nachtrag in Rechnung übernehmen");
  });
  it("adds approved supplements only to the order overview", () => {
    queries.children = [
      { id: "draft", number: "AN-1", net_total: 999, status: "draft" },
      {
        id: "approved",
        number: "AN-2",
        net_total: 30,
        status: "accepted",
        approved_at: "2026-10-15",
      },
    ];
    const html = render({ type: "order", net_total: 100 });
    expect(html).toContain("130,00");
    expect(html).not.toContain("1.129,00");
    expect(html).toContain("Nachtrag erstellen");
    expect(render({ type: "invoice" })).toBe("");
  });
});
