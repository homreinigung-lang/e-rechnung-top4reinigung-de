import { describe, it, expect } from "vitest";
import {
  blankDeliveryNote,
  deliveryNoteSchema,
  deliveryTotals,
  assertDeliveryNoteComplete,
  materialUnit,
  deliveryMonthlyTotals,
} from "./delivery-note";

describe("monthly material delivery note", () => {
  it("converts the supplied four-week example into two cartons, two cartons and 1.5 canisters", () => {
    const note = blankDeliveryNote("abc", "2026-10-30", "20012640", "Objekt");
    [
      ["16", "9", "2,5"],
      ["16", "6", "2"],
      ["16", "8", "1,5"],
      ["16", "7", "1,5"],
    ].forEach(([toiletPaper, handTowels, soap], i) => {
      note.rows[i] = {
        date: `2026-10-${String(i + 1).padStart(2, "0")}`,
        toiletPaper: toiletPaper!,
        handTowels: handTowels!,
        soap: soap!,
        signature: null,
      };
    });
    expect(deliveryTotals(note)).toEqual({ toiletPaper: 64, handTowels: 30, soap: 7.5 });
    expect(deliveryMonthlyTotals(note)).toEqual({ toiletPaper: 2, handTowels: 2, soap: 1.5 });
    delete note.packaging;
    expect(deliveryMonthlyTotals(note)).toEqual({ toiletPaper: 2, handTowels: 2, soap: 1.5 });
  });
  it("uses the package contents saved with a note and never converts old packaging-based entries twice", () => {
    const note = blankDeliveryNote("abc", "2026-10-30", "", "Objekt");
    note.rows[0] = {
      date: "2026-10-01",
      toiletPaper: "64",
      handTowels: "30",
      soap: "7,5",
      signature: null,
    };
    note.packaging = { toiletPaper: 16, handTowels: 10, soap: 2.5 };
    expect(deliveryMonthlyTotals(note)).toEqual({ toiletPaper: 4, handTowels: 3, soap: 3 });
    delete note.quantityMode;
    expect(deliveryMonthlyTotals(note)).toEqual({ toiletPaper: 64, handTowels: 30, soap: 7.5 });
  });
  it("rejects empty or negative package capacities", () => {
    const note = blankDeliveryNote("abc", "2026-10-30", "", "Objekt");
    note.packaging!.toiletPaper = 0;
    expect(deliveryNoteSchema.safeParse(note).success).toBe(false);
    note.packaging!.toiletPaper = 32;
    note.packaging!.soap = -5;
    expect(deliveryNoteSchema.safeParse(note).success).toBe(false);
  });
  it("totals weekly rolls, packs and fractional liters separately", () => {
    const note = blankDeliveryNote("abc", "2026-10-30", "20012640", "Objekt");
    ["2,5", "2", "1,5", "1.5"].forEach((v, i) => {
      note.rows[i] = {
        date: `2026-10-${String(i + 1).padStart(2, "0")}`,
        toiletPaper: "4",
        handTowels: String(i + 1),
        soap: v,
        signature: null,
      };
    });
    expect(deliveryTotals(deliveryNoteSchema.parse(note))).toEqual({
      toiletPaper: 16,
      handTowels: 10,
      soap: 7.5,
    });
  });
  it("uses individual weekly units while preserving the units of older packaging-based notes", () => {
    const note = blankDeliveryNote("abc", "2026-10-30", "", "Objekt");
    expect([
      materialUnit(note, "toiletPaper"),
      materialUnit(note, "handTowels"),
      materialUnit(note, "soap"),
    ]).toEqual(["Rollen", "Packungen", "Liter"]);
    delete note.quantityMode;
    expect([
      materialUnit(note, "toiletPaper"),
      materialUnit(note, "handTowels"),
      materialUnit(note, "soap"),
    ]).toEqual(["Kartons", "Kartons", "Kanister"]);
  });
  it("rejects negative, malformed, nonfinite and exponential quantities", () => {
    for (const input of ["-1", "NaN", "Infinity", "1e3", "1,2,3", "1abc", "9999999", "1.2345"]) {
      const note = blankDeliveryNote("abc", "2026-10-30", "", "Objekt");
      note.rows[0]!.date = "2026-10-01";
      note.rows[0]!.soap = input;
      expect(deliveryNoteSchema.safeParse(note).success, input).toBe(false);
    }
  });
  it("requires actual delivery dates in the selected month", () => {
    const note = blankDeliveryNote("abc", "2026-02-01", "", "Objekt");
    note.rows[0]!.soap = "1";
    for (const date of ["", "2026-03-01", "2026-02-30"]) {
      note.rows[0]!.date = date;
      expect(deliveryNoteSchema.safeParse(note).success).toBe(false);
    }
  });
  it("permits paper signing but prevents sending unsigned or empty notes", () => {
    const note = blankDeliveryNote("abc", "2026-10-01", "", "Objekt");
    expect(() => assertDeliveryNoteComplete(note, true)).toThrow("Menge");
    note.rows[0]!.soap = "1,5";
    note.rows[0]!.date = "2026-10-02";
    expect(() => assertDeliveryNoteComplete(note, false)).toThrow("unterschreiben");
    expect(() => assertDeliveryNoteComplete(note, true)).not.toThrow();
  });
});
