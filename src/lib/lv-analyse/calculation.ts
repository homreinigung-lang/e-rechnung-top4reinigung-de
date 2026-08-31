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

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Angebotspreis der Position. Ohne eigenen Einheitspreis: null (keine Berechnung).
 * Formel: (eigener EP × Menge + Lohn + Material + Gemeinkosten) × (1 + Gewinn %).
 */
export function offerPrice(item: LvNormalizedItem): number | null {
  if (!hasOwnPrice(item)) return null;
  const qty = item.quantity !== null && item.quantity > 0 ? item.quantity : 1;
  const c = item.calculation;
  const base =
    (c.own_unit_price ?? 0) * qty +
    (c.labor_cost ?? 0) +
    (c.material_cost ?? 0) +
    (c.overhead_cost ?? 0);
  return round2(base * (1 + (c.profit_percent ?? 0) / 100));
}

/** Jahrespreis nur bei vorhandenem eigenen Preis und erkanntem Intervall. */
export function annualOfferPrice(item: LvNormalizedItem): number | null {
  const price = offerPrice(item);
  if (price === null) return null;
  const perYear = item.frequency.perYear;
  return perYear === null ? null : round2(price * perYear);
}

export function calcStatus(item: LvNormalizedItem): LvCalcStatus {
  if (!hasOwnPrice(item)) return "not_calculated";
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
};

/** Gesamtsumme ausschließlich aus eigenen Kalkulationsdaten. */
export function summarizeOwnCalculation(
  items: LvNormalizedItem[],
  vatRate = 19,
): OwnCalculationSummary {
  const calculated = items.filter(hasOwnPrice);
  const net = round2(calculated.reduce((s, i) => s + (offerPrice(i) ?? 0), 0));
  const annualNet = round2(
    calculated.reduce((s, i) => s + (annualOfferPrice(i) ?? offerPrice(i) ?? 0), 0),
  );
  const vat = round2((net * vatRate) / 100);
  return {
    calculatedItems: calculated.length,
    openItems: items.length - calculated.length,
    net,
    annualNet,
    vatRate,
    vat,
    gross: round2(net + vat),
    complete: items.length > 0 && calculated.length === items.length,
  };
}
