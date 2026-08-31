import { describe, expect, it } from "vitest";
import { classifyLabel } from "./detect";
import { EMPTY_LV_INPUTS, deriveLvValues } from "./derive";
import { formatCents, formatGermanNumber, parseGermanCents, parseGermanNumber } from "./number";
import {
  hasBlockingWarnings,
  validateLvArithmetic,
  validateLvAssignment,
  validateLvForm,
} from "./validate";
import type { LvConstraint, LvInputs } from "./types";
import { cleanItems, itemsFromRows, itemsFromText } from "./import";
import { extractDocument } from "./import";
import { PDFDocument, StandardFonts } from "pdf-lib";

describe("deutsche Zahlen", () => {
  it("liest Tausenderpunkte und Dezimalkomma", () => {
    expect(parseGermanNumber("1.234,50")).toBe(1234.5);
    expect(parseGermanNumber("220,5")).toBe(220.5);
    expect(parseGermanNumber("1.250")).toBe(1250);
    expect(parseGermanNumber("")).toBeNull();
  });

  it("rechnet in Cent ohne Rundungsfehler", () => {
    expect(parseGermanCents("2.945,25")).toBe(294525);
    expect(parseGermanCents("0,07")).toBe(7);
    expect(formatCents(294525)).toBe("2.945,25");
    expect(formatGermanNumber(220.5)).toBe("220,50");
  });
});

describe("LV-Import", () => {
  it("liest die Texte aller PDF-Seiten in Reihenfolge", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const line of [
      "01.01.001 Bodenreinigung 1.250,00 m2",
      "01.02.003 Glasreinigung 18 Std.",
    ]) {
      const page = pdf.addPage();
      page.drawText(line, { x: 40, y: 760, size: 11, font });
    }
    const bytes = await pdf.save();
    const file = {
      name: "mehrseitiges-lv.pdf",
      type: "application/pdf",
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as File;

    const result = await extractDocument(file);
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("01.01.001 Bodenreinigung");
    expect(result.text).toContain("01.02.003 Glasreinigung");
  });

  it("erkennt verschachtelte OZ, deutsche Mengen und Einheiten", () => {
    const text = [
      "--- Seite 1 ---",
      "01.01.001 Unterhaltsreinigung Büroflächen 1.250,00 m²",
      "1.2.3 Glasreinigung innen und außen 18 Std.",
      "01.2 Verbrauchsmaterial 1 pauschal",
    ].join("\n");
    const items = itemsFromText(text);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ item_number: "01.01.001", quantity: 1250, unit: "m²" });
    expect(items[1]).toMatchObject({ item_number: "1.2.3", quantity: 18, unit: "Std" });
  });

  it("erhält mehrzeilige Beschreibungen bis zur Menge", () => {
    const items = itemsFromText(
      "01.01 Reinigung der Büroflächen\ninklusive Mobiliar und Papierkörbe\n2.400,50 m²\n01.02 Treppenhausreinigung 12 Monat",
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.description).toContain("inklusive Mobiliar");
    expect(items[0]?.quantity).toBe(2400.5);
  });

  it("erkennt deutsche Tabellenspalten und entfernt Dubletten", () => {
    const rows = [
      ["OZ", "Kurzbeschreibung", "Menge", "Einheit", "Einheitspreis"],
      ["01.01", "Bodenreinigung", "1.250,00", "m²", "2,50"],
      ["01.01", "Bodenreinigung", "1.250,00", "m²", "2,50"],
    ];
    const items = cleanItems(itemsFromRows(rows));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 1250, unit_price: 2.5 });
  });
});

describe("abgeleitete Werte", () => {
  const inputs: LvInputs = {
    ...EMPTY_LV_INPUTS,
    unterhalt_pauschale_monat: 294525,
    unterhalt_stunden_monat: 220.5,
    grund_pauschale_jahr: 180000,
    grund_stunden_jahr: 60,
    sonder_stundensatz: 3250,
    sonder_kontingent: 10,
    mwst_satz: 19,
  };

  it("berechnet Wertung, Jahresbetrag und MwSt.", () => {
    const d = deriveLvValues(inputs);
    expect(d.unterhalt_wertung).toBe(294525 * 12);
    expect(d.grund_wertung).toBe(180000);
    expect(d.sonder_wertung).toBe(32500);
    expect(d.jahr_netto).toBe(294525 * 12 + 180000 + 32500);
    expect(d.mwst_betrag).toBe(Math.round((d.jahr_netto * 19) / 100));
    expect(d.jahr_brutto).toBe(d.jahr_netto + d.mwst_betrag);
  });

  it("bleibt bei Nullwerten stabil", () => {
    const d = deriveLvValues(EMPTY_LV_INPUTS);
    expect(d.jahr_brutto).toBe(0);
  });
});

describe("Plausibilitätsprüfung", () => {
  const base: LvInputs = {
    ...EMPTY_LV_INPUTS,
    unterhalt_pauschale_monat: 294525,
    unterhalt_stunden_monat: 220.5,
    grund_pauschale_jahr: 180000,
    grund_stunden_jahr: 60,
    sonder_stundensatz: 3250,
    sonder_kontingent: 10,
  };
  const constraints: LvConstraint[] = [
    { kind: "min_hours_month", value: 220.5, pageIndex: 0, sourceLine: "Mindestumfang 220,5 Std." },
  ];

  it("meldet keine harte Warnung bei erfülltem Mindestumfang", () => {
    const warnings = validateLvForm(base, deriveLvValues(base), constraints);
    expect(hasBlockingWarnings(warnings)).toBe(false);
  });

  it("blockiert Unterschreitung des Mindestumfangs", () => {
    const low = { ...base, unterhalt_stunden_monat: 180 };
    const warnings = validateLvForm(low, deriveLvValues(low), constraints);
    expect(hasBlockingWarnings(warnings)).toBe(true);
    expect(warnings.some((w) => w.message.includes("220,50"))).toBe(true);
  });

  it("blockiert fehlende Basiswerte", () => {
    const warnings = validateLvForm(
      EMPTY_LV_INPUTS,
      deriveLvValues(EMPTY_LV_INPUTS),
      [],
    );
    expect(hasBlockingWarnings(warnings)).toBe(true);
  });
});

describe("Feldzuordnung aus Zeilentext", () => {
  it("erkennt die Monatspauschale", () => {
    expect(classifyLabel("Pauschalpreis pro Monat € / monatlich / netto").key).toBe(
      "unterhalt_pauschale_monat",
    );
  });

  it("erkennt Stunden pro Monat", () => {
    expect(classifyLabel("zugrunde liegende Stunden pro Monat").key).toBe(
      "unterhalt_stunden_monat",
    );
  });

  it("liefert null bei unbekanntem Text", () => {
    expect(classifyLabel("Anlage 7 Unterschrift Bieter").key).toBeNull();
  });
});

describe("Endprüfung vor Export", () => {
  const inputs: LvInputs = {
    ...EMPTY_LV_INPUTS,
    unterhalt_pauschale_monat: 100000,
    unterhalt_stunden_monat: 100,
    sonder_stundensatz: 3500,
    sonder_kontingent: 10,
  };

  it("meldet keine harten Fehler bei konsistenter Rechenkette", () => {
    const d = deriveLvValues(inputs);
    expect(validateLvArithmetic(inputs, d).filter((w) => w.level === "hard")).toHaveLength(0);
  });

  it("erkennt manipulierte Summen", () => {
    const d = { ...deriveLvValues(inputs), jahr_netto: 1 };
    expect(hasBlockingWarnings(validateLvArithmetic(inputs, d))).toBe(true);
  });

  it("blockiert fehlende und doppelte Zuordnungen", () => {
    const none = validateLvAssignment({
      type: "flat",
      assignedKeys: [],
      unassignedMarkers: 2,
      scanned: false,
    });
    expect(hasBlockingWarnings(none)).toBe(true);

    const dup = validateLvAssignment({
      type: "acroform",
      assignedKeys: ["jahr_netto", "jahr_netto", "mwst_betrag", "jahr_brutto"],
      unassignedMarkers: 0,
      scanned: false,
    });
    expect(hasBlockingWarnings(dup)).toBe(true);
  });
});
