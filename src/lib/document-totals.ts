/**
 * Zentrale Summenlogik für Belege (Angebot, Auftrag, Rechnung).
 *
 * Reihenfolge verbindlich: Positionen → Rabatt → Netto → MwSt. → Brutto.
 * Genutzt vom Belegeditor und von der Kalkulation, damit beide Bereiche
 * nie unterschiedliche Beträge erzeugen.
 */
import { roundCents } from "@/lib/money";

export type TotalsItem = { quantity: number; unit_price: number; description?: string | null };

export type DocumentTotals = {
  itemsTotal: number;
  discountAmount: number;
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
};

/** Summe der Positionen (cent-genau je Zeile, dann aufsummiert). */
export function itemsSubtotal(items: TotalsItem[]): number {
  return roundCents(
    items.reduce((sum, i) => sum + roundCents(Number(i.quantity) * Number(i.unit_price)), 0),
  );
}

/**
 * Berechnet alle Belegsummen.
 * @param discountPercent Rabatt in Prozent (0–100)
 * @param vatRate Steuersatz in Prozent (0 bei Reverse-Charge / § 19 UStG)
 */
export function computeDocumentTotals(
  items: TotalsItem[],
  discountPercent: number,
  vatRate: number,
): DocumentTotals {
  const percent = Math.min(100, Math.max(0, Number.isFinite(discountPercent) ? discountPercent : 0));
  const rate = Number.isFinite(vatRate) ? vatRate : 0;

  const itemsTotal = itemsSubtotal(items);
  const discountAmount = roundCents((itemsTotal * percent) / 100);
  const netTotal = roundCents(itemsTotal - discountAmount);
  const vatAmount = roundCents((netTotal * rate) / 100);
  const grossTotal = roundCents(netTotal + vatAmount);

  return { itemsTotal, discountAmount, netTotal, vatAmount, grossTotal };
}

/**
 * Erkennt eine aus der Kalkulation übertragene Rabattposition: negativer
 * Einzelpreis **und** eine als Rabatt bezeichnete Position. Ein zusätzlicher
 * Belegrabatt würde denselben Nachlass ein zweites Mal abziehen.
 *
 * Andere negative Zeilen (Gutschriften, Abzüge) sind kein Belegrabatt und
 * dürfen einen vereinbarten Prozentrabatt nicht entfernen.
 */
const DISCOUNT_LABEL = /(rabatt|nachlass|skonto)/i;

export function hasDiscountPosition(items: TotalsItem[]): boolean {
  return items.some(
    (i) => Number(i.unit_price) < 0 && DISCOUNT_LABEL.test(String(i.description ?? "")),
  );
}
