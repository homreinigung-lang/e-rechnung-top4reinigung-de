import { describe, it, expect } from "vitest";
import {
  blankDeliveryNote,
  deliveryNoteSchema,
  deliveryTotals,
  assertDeliveryNoteComplete,
  materialUnit,
} from "./delivery-note";

describe("monthly material delivery note", () => {
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
