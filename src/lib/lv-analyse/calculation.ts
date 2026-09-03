/**
 * Strikte Trennung zwischen Ausschreibungsdaten (aus dem Dokument gelesen) und
 * Kalkulationsdaten (vom Benutzer selbst eingegeben).
 *
 * Grundregeln:
 * - Preise aus dem Dokument werden NIE als eigene Preise übernommen.
 * - Alte Kalkulationen aus früheren Analysen werden NIE kopiert.
 * - Ohne eigenen Einheitspreis findet keine Berechnung statt.
 */
import { fromCents, toCents } from "@/lib/kalkulation-engine";
import type { LvCalcStatus, LvCalculation, LvNormalizedItem } from "./types";

export const NO_OWN_PRICE_LABEL = "Noch kein eigener Preis eingetragen";
export const NO_OWN_PRICE_HINT = "Bitte eigenen Einheitspreis eingeben.";


export const CALC_STATUS_LABELS: Record<LvCalcStatus, string> = {
  not_calculated: "Noch nicht kalkuliert",
  calculated_review: "Kalkuliert – Prüfung erforderlich",
  released: "Freigegeben",
};

/** Leere Kalkulation – Ausgangszustand jeder neuen Position. */
export function emptyCalculation(): LvCalculation {
  return {
    own_unit_price: null,
    labor_cost: null,
    material_cost: null,
    overhead_cost: null,
    profit_percent: null,
  };
}

/** Eindeutige ID je Analyse-Durchlauf; verknüpft Positionen mit dem aktuellen Dokument. */
export function newAnalysisId(): string {
  return `lv-analyse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function hasOwnPrice(item: LvNormalizedItem): boolean {
  const p = item.calculation.own_unit_price;
  return p !== null && Number.isFinite(p) && p > 0;
}

/** Menge aus der Ausschreibung vorhanden? Ohne Menge ist kein Preis berechenbar. */
export function hasQuantity(item: LvNormalizedItem): boolean {
  return item.quantity !== null && Number.isFinite(item.quantity) && item.quantity > 0;
}

/** Position ist rechenbar: eigener Einheitspreis UND geforderte Menge liegen vor. */
export function isCalculable(item: LvNormalizedItem): boolean {
  return hasOwnPrice(item) && hasQuantity(item);
}

/**
 * Angebotspreis der Position. Ohne eigenen Einheitspreis ODER ohne geforderte
 * Menge: null (keine Berechnung) – eine fehlende Menge darf nie stillschweigend
 * als 1 angenommen werden.
 * Formel: (eigener EP × Menge + Lohn + Material + Gemeinkosten) × (1 + Gewinn %).
 * Gerechnet wird in ganzen Cent, damit Positions- und Gesamtsummen exakt passen.
 */
export function offerPrice(item: LvNormalizedItem): number | null {
  if (!isCalculable(item)) return null;
  const qty = item.quantity as number;
  const c = item.calculation;
  const baseCents =
    toCents((c.own_unit_price ?? 0) * qty) +
    toCents(c.labor_cost ?? 0) +
    toCents(c.material_cost ?? 0) +
    toCents(c.overhead_cost ?? 0);
  const withProfit = Math.round(baseCents * (1 + (c.profit_percent ?? 0) / 100));
  return fromCents(withProfit);
}


/** Jahrespreis nur bei vorhandenem eigenen Preis und erkanntem Intervall. */
export function annualOfferPrice(item: LvNormalizedItem): number | null {
  const price = offerPrice(item);
  if (price === null) return null;
  const perYear = item.frequency.perYear;
  return perYear === null ? null : fromCents(Math.round(toCents(price) * perYear));
}


export function calcStatus(item: LvNormalizedItem): LvCalcStatus {
  // Ohne eigenen Preis ODER ohne Menge ist die Position nicht kalkuliert.
  if (!isCalculable(item)) return "not_calculated";
  return item.approved ? "released" : "calculated_review";
}

/** Setzt alle Kalkulationsdaten und Freigaben zurück (neue Ausschreibung). */
export function resetCalculations(items: LvNormalizedItem[]): LvNormalizedItem[] {
  return items.map((item) => ({ ...item, calculation: emptyCalculation(), approved: false }));
}

/** Verknüpft Positionen fest mit der aktuellen Analyse-/Dokument-ID. */
export function stampAnalysis(items: LvNormalizedItem[], analysisId: string): LvNormalizedItem[] {
  return resetCalculations(items).map((item) => ({ ...item, analysis_id: analysisId }));
}

/** Nur Positionen der aktuellen Analyse – niemals Positionen früherer Uploads. */
export function itemsOfAnalysis(
  items: LvNormalizedItem[],
  analysisId: string | null,
): LvNormalizedItem[] {
  if (!analysisId) return [];
  return items.filter((i) => i.analysis_id === analysisId);
}

export type OwnCalculationSummary = {
  /** Positionen mit eigenem Preis. */
  calculatedItems: number;
  /** Positionen ohne eigenen Preis. */
  openItems: number;
  net: number;
  annualNet: number;
  vatRate: number;
  vat: number;
  gross: number;
  complete: boolean;
  /** Kalkulierte Positionen ohne erkanntes Intervall (nur einmalig in der Jahressumme). */
  itemsWithoutFrequency: number;
};

/**
 * Gesamtsumme ausschließlich aus eigenen Kalkulationsdaten.
 * `vatRate` stammt immer aus den Firmeneinstellungen – niemals aus dem
 * hochgeladenen Ausschreibungsdokument.
 */
export function summarizeOwnCalculation(
  items: LvNormalizedItem[],
  vatRate = 19,
): OwnCalculationSummary {
  const calculated = items.filter(isCalculable);
  // Summe der bereits gerundeten Positionen: die Gesamtsumme entspricht exakt
  // der Addition der sichtbaren Zeilen.
  const netCents = calculated.reduce((s, i) => s + toCents(offerPrice(i) ?? 0), 0);
  const annualCents = calculated.reduce(
    (s, i) => s + toCents(annualOfferPrice(i) ?? offerPrice(i) ?? 0),
    0,
  );
  const vatCents = Math.round((netCents * vatRate) / 100);
  return {
    calculatedItems: calculated.length,
    openItems: items.length - calculated.length,
    net: fromCents(netCents),
    annualNet: fromCents(annualCents),
    vatRate,
    vat: fromCents(vatCents),
    gross: fromCents(netCents + vatCents),
    itemsWithoutFrequency: calculated.filter((i) => i.frequency.perYear === null).length,
    complete: items.length > 0 && calculated.length === items.length,
  };

}
