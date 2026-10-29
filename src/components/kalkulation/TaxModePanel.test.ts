import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { TaxModePanel } from "./TaxModePanel";

vi.mock("@/components/ui/select", () => {
  const box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Select: box,
    SelectTrigger: box,
    SelectContent: box,
    SelectValue: () => null,
    SelectItem: ({ children, value }: PropsWithChildren<{ value: string }>) =>
      createElement("option", { value }, children),
  };
});
it("offers domestic cleaning §13b in the main calculation tax selector", () => {
  const html = renderToStaticMarkup(
    createElement(TaxModePanel, {
      state: {
        taxMode: "domestic_reverse_charge",
        setTaxMode: vi.fn(),
        taxNote: "",
      } as unknown as Parameters<typeof TaxModePanel>[0]["state"],
    }),
  );
  expect(html).toContain('value="domestic_reverse_charge"');
  expect(html).toContain("§ 13b Gebäudereinigung");
  for (const mode of ["domestic", "eu_reverse_charge", "kleinunternehmer"])
    expect(html).toContain(`value="${mode}"`);
});
