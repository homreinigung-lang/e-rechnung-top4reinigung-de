import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { quoteRecurrencePosition, readQuoteRecurrence, quoteVisitPrice } from "./quote-recurrence";
import { DocumentPositionsEditor } from "@/components/documents/DocumentPositionsEditor";

it.each([
  ["week", "1", 433.33, "1 × pro Woche"],
  ["week", "2", 866.67, "2 × pro Woche"],
  ["fortnight", "1", 216.67, "1 × alle 2 Wochen (14-tägig)"],
  ["month", "3", 300, "3 × pro Monat"],
  ["month", "0,5", 50, "0,5 × pro Monat"],
  ["quarter", "1", 33.33, "1 × pro Quartal"],
  ["year", "1", 8.33, "1 × pro Jahr"],
  ["once", "9", 100, "einmalige Reinigung"],
] as const)("calculates direct quote %s %s and restores saved rhythm", (unit, frequency, total, label) => {
  const patch = quoteRecurrencePosition({ description: "Büroreinigung", frequency, unit, pricePerVisit: "100" });
  expect(patch).toMatchObject({ quantity: 1, unit: unit === "once" ? "Einsatz" : "Monat", unit_price: total });
  expect(patch.description).toBe("Büroreinigung; Turnus: " + label);
  expect(readQuoteRecurrence(patch.description)).toEqual({ frequency: unit === "once" ? "1" : frequency, unit });
  const again = quoteRecurrencePosition({ description: patch.description, frequency, unit, pricePerVisit: "100" });
  expect(again).toEqual(patch);
});

it("replaces a previous rhythm without multiplying a monthly price again", () => {
  const patch = quoteRecurrencePosition({ description: "Büro; Turnus: 1 × pro Woche", frequency: "2", unit: "month", pricePerVisit: "75" });
  expect(patch.description).toBe("Büro; Turnus: 2 × pro Monat");
  expect(patch.unit_price).toBe(150);
});

it.each(["", "0", "-1"])("rejects missing or invalid counts (%s)", (frequency) => {
  expect(() => quoteRecurrencePosition({ description: "Büro", frequency, unit: "week", pricePerVisit: "75" })).toThrow();
});

it("does not guess an unknown existing rhythm", () => {
  expect(readQuoteRecurrence("Büroreinigung")).toBeNull();
});

it("shows rhythm controls in the editor used by Neues Angebot", () => {
  const html = renderToStaticMarkup(createElement(DocumentPositionsEditor, {
    allowRecurrence: true,
    items: [{ id: "one", position: 1, description: "Büro", quantity: 1, unit: "Monat", unit_price: 400 }],
    unitOptions: ["Monat"], defaultNetRate: 35, vatRate: 19, onItemsChange: vi.fn(), onUpdateItem: vi.fn(),
  }));
  expect(html).toContain("Reinigungsrhythmus");
  expect(html).toContain("Anzahl Einsätze");
  expect(html).toContain("Nach Stunden");
  expect(html).toContain("Pauschal");
  expect(html).toContain("Reinigungsintervall");
  expect(html).toContain("Preis übernehmen");
  expect(html).toContain("400,00");
});

it("keeps invoice editing free of quote rhythm controls", () => {
  const html = renderToStaticMarkup(createElement(DocumentPositionsEditor, {
    items: [{ id: "one", position: 1, description: "Büro", quantity: 1, unit: "Monat", unit_price: 400 }],
    unitOptions: ["Monat"], defaultNetRate: 35, vatRate: 19, onItemsChange: vi.fn(), onUpdateItem: vi.fn(),
  }));
  expect(html).not.toContain("Reinigungsrhythmus");
});

it("removes the previous monthly visit count when changing an imported position", () => {
  const patch = quoteRecurrencePosition({ description: "Büroreinigung – 3 Std. je Einsatz, 4,33 Einsätze/Monat", frequency: "2", unit: "month", pricePerVisit: "75" });
  expect(patch.description).not.toContain("4,33 Einsätze/Monat");
  expect(readQuoteRecurrence(patch.description)).toEqual({ frequency: "2", unit: "month" });
});

it("replaces room cadence while retaining the room and its tasks", () => {
  const patch = quoteRecurrencePosition({ description: "Büro – 100 m², 1 pro Woche – Monatsdurchschnitt; Leistungen: Wischen", frequency: "1", unit: "fortnight", pricePerVisit: "100" });
  expect(patch.description).not.toContain("pro Woche");
  expect(patch.description).toContain("Leistungen: Wischen");
  expect(readQuoteRecurrence(patch.description)).toEqual({ frequency: "1", unit: "fortnight" });
});

it("calculates two hours per visit at 30 EUR, twice weekly, without manual multiplication", () => {
  const price = quoteVisitPrice({ basis: "hour", price: "30", hours: "2" });
  expect(price).toBe(60);
  const position = quoteRecurrencePosition({ description: "Büro", frequency: "2", unit: "week", pricePerVisit: String(price) });
  expect(position.unit_price).toBe(520);
});
it("accepts decimal hours and a German hourly rate", () => {
  expect(quoteVisitPrice({ basis: "hour", price: "32,50", hours: "1,5" })).toBe(48.75);
});
it("uses a fixed visit price without multiplying hours", () => {
  expect(quoteVisitPrice({ basis: "visit", price: "60", hours: "2" })).toBe(60);
});
it("requires a duration when billing by hours", () => {
  expect(quoteVisitPrice({ basis: "hour", price: "30", hours: "" })).toBe(0);
});
