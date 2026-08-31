import { MONTHS_PER_YEAR } from "@/lib/constants";
import { fromCents, toCents } from "@/lib/kalkulation-engine";
import { annualOfferPrice, hasOwnPrice, offerPrice } from "./calculation";
import type { LvItemCategory, LvNormalizedItem, LvTotalLine } from "./types";

const round2 = (n: number) => fromCents(toCents(n));

export type CategoryAggregate = {
  category: LvItemCategory;
  items: number;
  area_m2: number;
  hours: number;
  total: number;
};

export function aggregateByCategory(items: LvNormalizedItem[]): CategoryAggregate[] {
  const map = new Map<LvItemCategory, CategoryAggregate>();
  for (const item of items) {
    const entry = map.get(item.category) ?? {
      category: item.category,
      items: 0,
      area_m2: 0,
      hours: 0,
      total: 0,
    };
    entry.items += 1;
    entry.area_m2 += item.area_m2 ?? 0;
    entry.hours += item.working_hours ?? 0;
    entry.total += offerPrice(item) ?? 0;
    map.set(item.category, entry);
  }
  return [...map.values()]
    .map((e) => ({
      ...e,
      area_m2: round2(e.area_m2),
      hours: round2(e.hours),
      total: round2(e.total),
    }))
    .sort((a, b) => b.total - a.total || b.items - a.items);
}

export type AreaSummary = {
  totalArea: number;
  itemsWithArea: number;
  itemsWithoutArea: number;
  /** Jahresfläche = Fläche × Einsätze pro Jahr. */
  annualArea: number;
  largest: LvNormalizedItem[];
};

export function summarizeArea(items: LvNormalizedItem[]): AreaSummary {
  const withArea = items.filter((i) => (i.area_m2 ?? 0) > 0);
  const totalArea = withArea.reduce((s, i) => s + (i.area_m2 ?? 0), 0);
  const annualArea = withArea.reduce(
    (s, i) => s + (i.area_m2 ?? 0) * (i.frequency.perYear ?? 0),
    0,
  );
  return {
    totalArea: round2(totalArea),
    itemsWithArea: withArea.length,
    itemsWithoutArea: items.length - withArea.length,
    annualArea: round2(annualArea),
    largest: [...withArea].sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0)).slice(0, 8),
  };
}

export type HoursSummary = {
  totalHours: number;
  annualHours: number;
  monthlyHours: number;
  itemsWithHours: number;
  /** Aus Fläche geschätzte Stunden (Leistungswert m²/Std). */
  estimatedFromArea: number;
  performanceRate: number;
};

/** Standard-Leistungswert Unterhaltsreinigung: 250 m² pro Stunde. */
export const DEFAULT_PERFORMANCE_RATE = 250;

export function summarizeHours(
  items: LvNormalizedItem[],
  performanceRate = DEFAULT_PERFORMANCE_RATE,
): HoursSummary {
  const withHours = items.filter((i) => (i.working_hours ?? 0) > 0);
  const totalHours = withHours.reduce((s, i) => s + (i.working_hours ?? 0), 0);
  const annualHours = withHours.reduce(
    (s, i) => s + (i.working_hours ?? 0) * (i.frequency.perYear ?? 1),
    0,
  );
  const areaWithoutHours = items
    .filter((i) => (i.working_hours ?? 0) <= 0 && (i.area_m2 ?? 0) > 0)
    .reduce((s, i) => s + (i.area_m2 ?? 0) * (i.frequency.perYear ?? 1), 0);
  return {
    totalHours: round2(totalHours),
    annualHours: round2(annualHours),
    monthlyHours: round2(annualHours / MONTHS_PER_YEAR),
    itemsWithHours: withHours.length,
    estimatedFromArea: round2(performanceRate > 0 ? areaWithoutHours / performanceRate : 0),
    performanceRate,
  };
}

export type CostSummary = {
  net: number;
  vat: number;
  gross: number;
  vatRate: number;
  annualNet: number;
  pricedItems: number;
  unpricedItems: number;
  documentTotals: LvTotalLine[];
  /**
   * Abweichender Steuersatz aus dem hochgeladenen Dokument – nur als Hinweis,
   * er fließt bewusst NICHT in die Berechnung ein.
   */
  documentVatRateHint: number | null;
};

/**
 * Kostenübersicht der eigenen Kalkulation.
 *
 * `vatRate` kommt immer aus den Firmeneinstellungen (Inland 19 %,
 * Reverse-Charge/Kleinunternehmer 0 %). Ein im Ausschreibungsdokument
 * genannter Steuersatz wird nur noch als Hinweis zurückgegeben.
 */
export function summarizeCost(
  items: LvNormalizedItem[],
  totals: LvTotalLine[],
  vatRate = 19,
): CostSummary {
  // Ausschließlich eigene Kalkulationsdaten – Preise aus dem Dokument fließen nie ein.
  const priced = items.filter(hasOwnPrice);
  const netCents = priced.reduce((s, i) => s + toCents(offerPrice(i) ?? 0), 0);
  const annualCents = priced.reduce(
    (s, i) => s + toCents(annualOfferPrice(i) ?? offerPrice(i) ?? 0),
    0,
  );
  const vatCents = Math.round((netCents * vatRate) / 100);
  const documentRate = items.find((i) => i.vat_rate !== null)?.vat_rate ?? null;
  return {
    net: fromCents(netCents),
    vat: fromCents(vatCents),
    gross: fromCents(netCents + vatCents),
    vatRate,
    annualNet: fromCents(annualCents),
    pricedItems: priced.length,
    unpricedItems: items.length - priced.length,
    documentTotals: totals,
    documentVatRateHint: documentRate !== null && documentRate !== vatRate ? documentRate : null,
  };
}


export type PriceRecommendation = {
  hourlyRate: number;
  annualHours: number;
  laborCost: number;
  overheadPercent: number;
  profitPercent: number;
  recommendedAnnualNet: number;
  recommendedMonthlyNet: number;
  recommendedPerSqm: number;
  documentAnnualNet: number;
  deltaPercent: number | null;
};

export type PriceInputs = {
  hourlyRate: number;
  overheadPercent: number;
  profitPercent: number;
  performanceRate: number;
};

export const DEFAULT_PRICE_INPUTS: PriceInputs = {
  hourlyRate: 22,
  overheadPercent: 15,
  profitPercent: 8,
  performanceRate: DEFAULT_PERFORMANCE_RATE,
};

/** Bottom-up Preisempfehlung: Stunden × Stundensatz + Gemeinkosten + Gewinn. */
export function recommendPrice(
  items: LvNormalizedItem[],
  inputs: PriceInputs,
): PriceRecommendation {
  const hours = summarizeHours(items, inputs.performanceRate);
  const annualHours = round2(hours.annualHours + hours.estimatedFromArea);
  const labor = annualHours * inputs.hourlyRate;
  const withOverhead = labor * (1 + inputs.overheadPercent / 100);
  const recommended = round2(withOverhead * (1 + inputs.profitPercent / 100));
  const area = summarizeArea(items).totalArea;
  const documentAnnualNet = summarizeCost(items, []).annualNet; // eigene Jahressumme
  return {
    hourlyRate: inputs.hourlyRate,
    annualHours,
    laborCost: round2(labor),
    overheadPercent: inputs.overheadPercent,
    profitPercent: inputs.profitPercent,
    recommendedAnnualNet: recommended,
    recommendedMonthlyNet: round2(recommended / MONTHS_PER_YEAR),
    recommendedPerSqm: area > 0 ? round2(recommended / area) : 0,
    documentAnnualNet,
    deltaPercent:
      documentAnnualNet > 0
        ? round2(((documentAnnualNet - recommended) / recommended) * 100)
        : null,
  };
}
