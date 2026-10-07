import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManagementDashboard } from "@/components/ManagementDashboard";
import { EinsaetzeHeute } from "@/components/EinsaetzeHeute";

const query = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: query.useQuery }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => createElement("a", null, children as string),
}));

beforeEach(() => query.useQuery.mockReset());
describe("dashboard load failures", () => {
  it.each([ManagementDashboard, EinsaetzeHeute])(
    "shows an actionable failure instead of empty data",
    (component) => {
      query.useQuery.mockReturnValue({
        data: undefined,
        error: new Error("Verbindung unterbrochen"),
        isPending: false,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(createElement(component));
      expect(html).toContain('role="alert"');
      expect(html).toContain("Erneut versuchen");
      expect(html).not.toContain("keine Einsätze");
      expect(html).not.toContain("0 Einsätze");
      expect(html).not.toContain("Objekt-Umsatz netto");
    },
  );
  it.each([ManagementDashboard, EinsaetzeHeute])(
    "shows loading rather than zero activity",
    (component) => {
      query.useQuery.mockReturnValue({
        data: undefined,
        error: null,
        isPending: true,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(createElement(component));
      expect(html).toContain("geladen");
      expect(html).not.toContain("0 Einsätze");
      expect(html).not.toContain("Objekt-Umsatz netto");
    },
  );
});
