import type { LvDocumentKind } from "./types";

const SUPPORTED_EXT = /\.(pdf|xlsx|xlsm|csv|txt|x8[1-9]|d8[1-9]|p8[1-9]|gaeb|xml)$/i;

export function isSupportedFile(fileName: string): boolean {
  return SUPPORTED_EXT.test(fileName.trim());
}

export function isGaebFile(fileName: string): boolean {
  return /\.(x8[1-9]|d8[1-9]|p8[1-9]|gaeb)$/i.test(fileName.trim());
}

const MONEY_LINE = /(?:€|EUR)\s*[\d.]+,\d{2}|[\d.]+,\d{2}\s*(?:€|EUR)/i;
const TOTAL_WORDS =
  /(gesamt|summe|angebotssumme|endsumme|nettosumme|bruttosumme|jahrespreis|monatspreis|zwischensumme|preisblatt|angebotspreis)/i;
const SPEC_WORDS =
  /(leistungsbeschreibung|reinigungsanweisung|qualität|hygiene|raumgruppe|reinigungsintervall|objektbeschreibung|arbeitsanweisung)/i;
const POSITION_LINE = /^\s*(\d{1,3}(?:[.-]\d{1,4}){0,4})\s+\S/;

export type ClassifyInput = {
  fileName: string;
  text: string;
  rows: string[][];
  hasTextLayer: boolean;
  /** Zahl der regelbasiert/KI erkannten Positionen. */
  itemCount: number;
  /** Zahl der erkannten reinen Summenzeilen. */
  totalCount: number;
  /** Positionen mit vollständiger LV-Struktur (Menge + Einheit vorhanden). */
  structuredItemCount?: number;
};

export type ClassifyOutput = { kind: LvDocumentKind; reason: string };

/**
 * Erkennt anhand von Struktur und Inhalt, um welche Art Ausschreibungsdokument es sich handelt.
 * Wird nie "leer" zurückliefern – im Zweifel "unsupported" mit Begründung.
 */
export function classifyDocument(input: ClassifyInput): ClassifyOutput {
  const { fileName, text, rows, hasTextLayer, itemCount, totalCount } = input;
  const structuredItemCount = input.structuredItemCount ?? itemCount;

  if (!isSupportedFile(fileName)) {
    return {
      kind: "unsupported",
      reason: `Das Dateiformat von „${fileName}" wird nicht unterstützt. Erlaubt sind PDF, XLSX, CSV und GAEB.`,
    };
  }

  const trimmed = text.trim();
  if (!hasTextLayer || trimmed.length < 40) {
    if (/\.pdf$/i.test(fileName)) {
      return {
        kind: "scanned_pdf",
        reason:
          "Das PDF enthält keine auswertbare Textebene – es wurde als Scan eingestuft und per OCR verarbeitet.",
      };
    }
    return {
      kind: "unsupported",
      reason: "Die Datei enthält keinen lesbaren Inhalt.",
    };
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const positionLines = lines.filter((l) => POSITION_LINE.test(l)).length;
  const moneyLines = lines.filter((l) => MONEY_LINE.test(l)).length;
  const totalLines = lines.filter((l) => TOTAL_WORDS.test(l) && MONEY_LINE.test(l)).length;
  const specHits = lines.filter((l) => SPEC_WORDS.test(l)).length;

  if (itemCount >= 3 && structuredItemCount >= 3 && (positionLines >= 3 || rows.length >= 4)) {
    return {
      kind: "detailed_lv",
      reason: `Vollständige LV-Struktur erkannt (${structuredItemCount} Positionen mit Menge und Einheit).`,
    };
  }

  // Preisblatt: überwiegend Preis-/Jahresbeträge ohne vollständige LV-Tabelle.
  if (structuredItemCount < 3 && (totalCount > 0 || totalLines > 0 || moneyLines >= 1)) {
    return {
      kind: "pricing_form",
      reason:
        "Das Dokument enthält überwiegend Preisangaben bzw. Jahresbeträge und keine vollständige LV-Tabelle mit Positionen, Flächen, Mengen und Einheiten.",
    };
  }

  if (specHits >= 2 && itemCount < 3) {
    return {
      kind: "cleaning_spec",
      reason: `Beschreibender Leistungstext ohne kalkulierbare Positionen erkannt (${specHits} Fachbegriffe der Leistungsbeschreibung).`,
    };
  }

  if (itemCount > 0) {
    return {
      kind: structuredItemCount >= 3 ? "detailed_lv" : "pricing_form",
      reason: `Es wurden ${itemCount} Positionen erkannt, davon ${structuredItemCount} mit vollständiger Struktur (Menge und Einheit).`,
    };
  }

  return {
    kind: "cleaning_spec",
    reason:
      "Es konnten keine kalkulierbaren Positionen erkannt werden. Der Text wurde als beschreibendes Dokument eingestuft.",
  };
}
