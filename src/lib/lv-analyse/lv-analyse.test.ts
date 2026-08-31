import { describe, expect, it, vi } from "vitest";
import { analyseLvFile, type AnalyseDeps } from "./pipeline";
import { classifyDocument } from "./classify";
import { normalizeItem } from "./normalize";
import {
  REVIEW_LABEL,
  buildCsv,
  buildExportRows,
  buildXlsx,
  canExport,
  reviewFields,
  selectExportItems,
} from "./export";
import {
  CALC_STATUS_LABELS,
  calcStatus,
  emptyCalculation,
  hasOwnPrice,
  newAnalysisId,
  offerPrice,
  resetCalculations,
  stampAnalysis,
  summarizeOwnCalculation,
} from "./calculation";
import { summarizeCost } from "./aggregate";
import { DOCUMENT_KIND_LABELS, type LvAnalysisResult, type LvNormalizedItem } from "./types";

const emptyAi = { document_kind: "", items: [] as any[], totals: [] as any[] } as any;

function file(name: string, content = "", type = ""): File {
  return new File([content], name, { type });
}

function deps(over: Partial<AnalyseDeps> = {}): AnalyseDeps {
  return {
    analyseText: vi.fn(async () => emptyAi),
    analyseScan: vi.fn(async () => emptyAi),
    ...over,
  };
}

const PDF_TEXT = [
  "--- Seite 1 ---",
  "Leistungsverzeichnis Gebäudereinigung",
  "01.01.001 Unterhaltsreinigung Büroflächen 5x wöchentlich 1.250,00 m² 0,85",
  "01.01.002 Sanitärreinigung täglich 180,00 m² 1,20",
  "--- Seite 2 ---",
  "01.02.001 Glasreinigung innen und außen 2x jährlich 320,00 m² 2,50",
].join("\n");

describe("1) PDF mit Textebene", () => {
  it("extrahiert Positionen mit Quellseite und Sicherheitswert", async () => {
    const result = await analyseLvFile(
      file("ausschreibung.pdf", "", "application/pdf"),
      deps({
        readDocument: async () => ({ text: PDF_TEXT, rows: [], hasTextLayer: true, pageCount: 2 }),
      }),
    );
    expect(result.kind).toBe("detailed_lv");
    expect(result.items.length).toBeGreaterThanOrEqual(3);
    expect(result.pageCount).toBe(2);
    const glas = result.items.find((i) => /Glasreinigung/i.test(i.description));
    expect(glas?.source_page).toBe(2);
    expect(result.items.every((i) => i.confidence_score > 0 && i.confidence_score <= 1)).toBe(true);
    expect(result.statusMessage).not.toBe("");
    expect(result.recommendedAction).not.toBe("");
  });
});

describe("2) Gescanntes PDF mit OCR", () => {
  it("startet OCR und übernimmt die OCR-Positionen", async () => {
    const analyseScan = vi.fn(async () => ({
      document_kind: "detailed_lv",
      items: [
        {
          item_number: "1",
          description: "Unterhaltsreinigung Treppenhaus",
          quantity: "240,00",
          unit: "m²",
          frequency: "2x wöchentlich",
          unit_price: "0,95",
          source_page: 1,
          confidence_score: 0.6,
        },
      ],
      totals: [],
    })) as any;
    const result = await analyseLvFile(
      file("scan.pdf", "", "application/pdf"),
      deps({
        analyseScan,
        readDocument: async () => ({ text: "", rows: [], hasTextLayer: false, pageCount: 3 }),
      }),
    );
    expect(analyseScan).toHaveBeenCalled();
    expect(result.kind).toBe("scanned_pdf");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.source_method).toBe("ocr");
    expect(result.items[0]?.source_page).toBe(1);
  });
});

describe("3) XLSX-Datei", () => {
  it("liest Tabellenzeilen als Positionen", async () => {
    const rows = [
      ["Pos", "Leistungsbeschreibung", "Menge", "Einheit", "Einheitspreis"],
      ["1.1", "Unterhaltsreinigung Büro", "1.250,00", "m²", "0,85"],
      ["1.2", "Glasreinigung", "320,00", "m²", "2,50"],
      ["1.3", "Sanitärreinigung", "180,00", "m²", "1,20"],
    ];
    const result = await analyseLvFile(
      file("lv.xlsx"),
      deps({
        readDocument: async () => ({
          text: rows.map((r) => r.join(" | ")).join("\n"),
          rows,
          hasTextLayer: true,
          pageCount: 1,
        }),
      }),
    );
    expect(result.items.length).toBe(3);
    expect(result.items[0]?.quantity).toBe(1250);
    expect(result.items[0]?.unit).toBe("m²");
    expect(result.items.every((i) => i.source_page === 1)).toBe(true);
  });
});

describe("4) CSV-Datei", () => {
  it("verarbeitet CSV-Spalten und normalisiert deutsche Zahlen", async () => {
    const rows = [
      ["Pos", "Beschreibung", "Menge", "Einheit", "Einheitspreis"],
      ["1", "Unterhaltsreinigung Flur", "500,50", "m²", "0,75"],
      ["2", "Grundreinigung Halle", "1.000,00", "m²", "3,20"],
      ["3", "Winterdienst Zuwegung", "12", "Stk", "45,00"],
    ];
    const result = await analyseLvFile(
      file("lv.csv", "", "text/csv"),
      deps({
        readDocument: async () => ({
          text: rows.map((r) => r.join(";")).join("\n"),
          rows,
          hasTextLayer: true,
          pageCount: 1,
        }),
      }),
    );
    expect(result.items).toHaveLength(3);
    expect(result.items[1]?.quantity).toBe(1000);
    expect(result.items[1]?.unit_price).toBe(3.2);
    expect(result.items[1]?.total_price).toBe(3200);
  });
});

describe("5) Preisblatt ohne vollständige LV-Struktur", () => {
  it("wird als Preisblatt eingestuft und nicht als detailliertes LV", async () => {
    const text = [
      "--- Seite 1 ---",
      "Preisblatt Angebot Gebäudereinigung",
      "Monatspreis Unterhaltsreinigung: 2.450,00 €",
      "Jahrespreis Glasreinigung: 1.980,00 €",
      "Angebotssumme netto: 30.380,00 €",
    ].join("\n");
    const result = await analyseLvFile(
      file("preisblatt.pdf", "", "application/pdf"),
      deps({ readDocument: async () => ({ text, rows: [], hasTextLayer: true, pageCount: 1 }) }),
    );
    expect(result.kind).toBe("pricing_form");
    expect(DOCUMENT_KIND_LABELS.pricing_form.de).toBe("Preisblatt – teilweise strukturierte Daten");
    expect(result.totals.length).toBeGreaterThanOrEqual(2);
    expect(result.totals[0]?.source_page).toBe(1);
    expect(result.status).toBe("partial");
    expect(result.statusMessage).toMatch(/Preisblatt/);
    expect(result.recommendedAction).toMatch(/Kostenanalyse|manuell/);
  });

  it("Klassifizierung liefert immer eine Begründung", () => {
    const out = classifyDocument({
      fileName: "x.pdf",
      text: "Nur ein kurzer Fließtext ohne Positionen und ohne Beträge im Dokument.",
      rows: [],
      hasTextLayer: true,
      itemCount: 0,
      totalCount: 0,
    });
    expect(out.reason.length).toBeGreaterThan(10);
  });
});

describe("6) Fehlende Preise", () => {
  it("erfindet keine Preise und markiert sie mit „Prüfung erforderlich“", () => {
    const item = normalizeItem(
      { item_number: "1", description: "Unterhaltsreinigung Büro", quantity: "100", unit: "m²", frequency: "wöchentlich" },
      "tabelle",
    );
    expect(item.unit_price).toBeNull();
    expect(item.total_price).toBeNull();
    expect(reviewFields(item)).toContain("unit_price");
    const row = buildExportRows([item])[0]!;
    expect(row[12]).toBe("Noch kein eigener Preis eingetragen");
    expect(row[17]).toBe("Noch kein eigener Preis eingetragen");
    expect(row[11]).toContain(REVIEW_LABEL);
  });
});

describe("7) Fehlende Flächen", () => {
  it("lässt die Fläche leer und meldet Prüfbedarf", () => {
    const item = normalizeItem(
      { item_number: "2", description: "Winterdienst Zuwegung", quantity: "12", unit: "Stk", unit_price: "45,00", frequency: "monatlich" },
      "tabelle",
    );
    expect(item.area_m2).toBeNull();
    expect(reviewFields(item)).toContain("area_m2");
    const row = buildExportRows([item])[0]!;
    expect(row[7]).toBe(REVIEW_LABEL);
    expect(row[18]).toBe(CALC_STATUS_LABELS.not_calculated);
  });
});

describe("8) Download nach abgeschlossener Analyse", () => {
  const baseResult = (status: LvAnalysisResult["status"]): LvAnalysisResult => ({
    analysisId: "analyse-1",
    fileName: "lv.pdf",
    fileSize: 1000,
    uploadedAt: new Date().toISOString(),
    kind: "detailed_lv",
    kindReason: "Test",
    status,
    statusMessage: "Test",
    recommendedAction: "Test",
    items: [],
    totals: [],
    issues: [],
    steps: [],
    pageCount: 1,
    rawText: "",
  });

  const item = {
    ...normalizeItem(
      { item_number: "1", description: "Unterhaltsreinigung Büro", quantity: "100", unit: "m²", unit_price: "0,90", frequency: "5x wöchentlich", source_page: 1, confidence_score: 0.9 },
      "tabelle",
    ),
    analysis_id: "analyse-1",
    calculation: { ...emptyCalculation(), own_unit_price: 0.9 },
    approved: true,
  };

  it("aktiviert den Export erst bei abgeschlossener oder teilweiser Analyse", () => {
    expect(canExport(null, [item])).toBe(false);
    expect(canExport(baseResult("empty"), [item])).toBe(false);
    expect(canExport(baseResult("error"), [item])).toBe(false);
    expect(canExport(baseResult("partial"), [item])).toBe(true);
    expect(canExport(baseResult("success"), [item])).toBe(true);
  });

  it("exportiert nur freigegebene Positionen", () => {
    const notApproved = { ...item, id: "x2", approved: false };
    expect(selectExportItems([item, notApproved])).toEqual([item]);
  });

  it("erzeugt CSV im Standardformat (UTF-8-BOM, Semikolon)", () => {
    const csv = buildCsv([item], baseResult("success"));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Beschreibung;Kategorie");
    expect(csv).toContain("Unterhaltsreinigung Büro");
    expect(csv).toContain("90");
  });

  it("erzeugt eine echte XLSX-Datei", async () => {
    const blob = await buildXlsx([item], baseResult("success"));
    expect(blob.size).toBeGreaterThan(500);
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
    expect([head[0], head[1]]).toEqual([0x50, 0x4b]); // ZIP/OOXML-Signatur
  });
});


// ---------------------------------------------------------------------------
// Trennung Ausschreibungsdaten / Kalkulationsdaten
// ---------------------------------------------------------------------------

function tenderItem(over: Partial<LvNormalizedItem> = {}): LvNormalizedItem {
  return {
    ...normalizeItem(
      {
        item_number: "1",
        description: "Unterhaltsreinigung Büro",
        quantity: "100",
        unit: "m²",
        unit_price: "0,85",
        total_price: "85,00",
        frequency: "5x wöchentlich",
        source_page: 1,
        confidence_score: 0.9,
      },
      "tabelle",
    ),
    ...over,
  };
}

describe("9) Neue Ausschreibung übernimmt keine alten Daten", () => {
  it("Preise aus dem Dokument werden nicht als eigene Preise übernommen", () => {
    const item = tenderItem();
    expect(item.unit_price).toBe(0.85);
    expect(item.calculation.own_unit_price).toBeNull();
    expect(hasOwnPrice(item)).toBe(false);
    expect(calcStatus(item)).toBe("not_calculated");
  });

  it("beim neuen Upload bleiben Kalkulationsfelder leer und nichts ist freigegeben", async () => {
    const rows = [
      ["Pos", "Beschreibung", "Menge", "Einheit", "Einheitspreis"],
      ["1", "Unterhaltsreinigung Flur", "500,00", "m²", "0,75"],
    ];
    const result = await analyseLvFile(
      file("neu.csv", "", "text/csv"),
      deps({
        readDocument: async () => ({
          text: rows.map((r) => r.join(";")).join("\n"),
          rows,
          hasTextLayer: true,
          pageCount: 1,
        }),
      }),
    );
    expect(result.analysisId).not.toBe("");
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.analysis_id).toBe(result.analysisId);
      expect(item.calculation).toEqual(emptyCalculation());
      expect(item.approved).toBe(false);
    }
  });

  it("alte Kalkulationen werden beim Stempeln einer neuen Analyse verworfen", () => {
    const old = tenderItem({
      analysis_id: "alt",
      approved: true,
      calculation: { ...emptyCalculation(), own_unit_price: 1.5, profit_percent: 10 },
    });
    const fresh = stampAnalysis([old], "neu")[0]!;
    expect(fresh.analysis_id).toBe("neu");
    expect(fresh.calculation.own_unit_price).toBeNull();
    expect(fresh.approved).toBe(false);
    expect(resetCalculations([old])[0]!.calculation).toEqual(emptyCalculation());
  });

  it("zwei Projekte bleiben vollständig getrennt", () => {
    const a = tenderItem({
      analysis_id: "A",
      approved: true,
      calculation: { ...emptyCalculation(), own_unit_price: 1 },
    });
    const b = stampAnalysis([tenderItem()], "B")[0]!;
    expect(selectExportItems([a, b], "B")).toEqual([]);
    expect(selectExportItems([a, b], "A")).toEqual([a]);
    expect(newAnalysisId()).not.toBe(newAnalysisId());
  });
});

describe("10) Berechnung erst nach eigener Preiseingabe", () => {
  it("ohne eigenen Einheitspreis wird nichts berechnet", () => {
    const item = tenderItem();
    expect(offerPrice(item)).toBeNull();
    const summary = summarizeOwnCalculation([item]);
    expect(summary.net).toBe(0);
    expect(summary.annualNet).toBe(0);
    expect(summary.openItems).toBe(1);
    expect(summarizeCost([item], []).net).toBe(0);
  });

  it("mit eigenem Preis wird Angebotspreis und Status berechnet", () => {
    const item = tenderItem({
      calculation: {
        own_unit_price: 1,
        labor_cost: 20,
        material_cost: 10,
        overhead_cost: 10,
        profit_percent: 10,
      },
    });
    // (1 × 100 + 20 + 10 + 10) × 1,1 = 154
    expect(offerPrice(item)).toBe(154);
    expect(calcStatus(item)).toBe("calculated_review");
    expect(calcStatus({ ...item, approved: true })).toBe("released");
    expect(summarizeOwnCalculation([item]).net).toBe(154);
  });
});

describe("11) Export enthält nur aktuelle, freigegebene und kalkulierte Positionen", () => {
  it("Positionen ohne eigenen Preis oder ohne Freigabe werden nicht exportiert", () => {
    const priced = tenderItem({
      analysis_id: "A",
      approved: true,
      calculation: { ...emptyCalculation(), own_unit_price: 2 },
    });
    const unpriced = tenderItem({ analysis_id: "A", approved: true });
    const notApproved = tenderItem({
      analysis_id: "A",
      calculation: { ...emptyCalculation(), own_unit_price: 2 },
    });
    expect(selectExportItems([priced, unpriced, notApproved], "A")).toEqual([priced]);
    const csv = buildCsv([priced]);
    expect(csv).toContain("Eigene Kalkulation");
    expect(csv).not.toContain("0,85");
  });
});
