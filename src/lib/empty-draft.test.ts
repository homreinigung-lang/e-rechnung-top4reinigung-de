import { describe, expect, it } from "vitest";
import { isEmptyDraft } from "./empty-draft";

const blank = {
  status: "draft",
  customer_id: null,
  customer_name: "",
  discount_percent: "0",
  intro_text: "Standardtext aus der Vorbelegung",
};

describe("isEmptyDraft", () => {
  it("erkennt einen unberührten Entwurf", () => {
    expect(isEmptyDraft(blank, [])).toBe(true);
  });

  it("erkennt einen Entwurf mit Kunde als befüllt", () => {
    expect(isEmptyDraft({ ...blank, customer_id: "abc" }, [])).toBe(false);
  });

  it("erkennt eine Position mit Preis als Eingabe", () => {
    expect(isEmptyDraft(blank, [{ description: "", quantity: 0, unit_price: 12 }])).toBe(false);
  });

  it("ignoriert komplett leere Positionszeilen", () => {
    expect(isEmptyDraft(blank, [{ description: "", quantity: 0, unit_price: 0 }])).toBe(true);
  });

  it("erkennt Freitexte", () => {
    expect(isEmptyDraft({ ...blank, notes: "Hinweis" }, [])).toBe(false);
  });

  it("lässt festgeschriebene Belege unangetastet", () => {
    expect(isEmptyDraft({ ...blank, status: "sent" }, [])).toBe(false);
  });
});
