import type { LvNormalizedItem, LvValidationIssue } from "./types";

/**
 * Prüfregeln für extrahierte Positionen: fehlende Menge, Einheit, Intervall und Preis.
 */
export function validateItems(items: LvNormalizedItem[]): LvValidationIssue[] {
  const issues: LvValidationIssue[] = [];

  for (const item of items) {
    const name = item.item_number || item.description.slice(0, 40) || "Position";

    if (!item.description.trim()) {
      issues.push({
        itemId: item.id,
        field: "description",
        level: "error",
        message: `Beschreibung für Position ${name} fehlt.`,
        hint: "Beschreibung aus dem Original ergänzen.",
      });
    }
    if (item.quantity === null || item.quantity <= 0) {
      issues.push({
        itemId: item.id,
        field: "quantity",
        level: "error",
        message: `Menge für Position ${name} fehlt.`,
        hint: "Menge (z. B. m², Stück, Stunden) aus der Ausschreibung nachtragen.",
      });
    }
    if (!item.unit.trim()) {
      issues.push({
        itemId: item.id,
        field: "unit",
        level: "error",
        message: `Einheit für Position ${name} fehlt.`,
        hint: "Einheit ergänzen (m², Stk, Std, Monat, pauschal).",
      });
    }
    if (item.frequency.perYear === null) {
      issues.push({
        itemId: item.id,
        field: "frequency",
        level: "warning",
        message: `Reinigungsintervall für Position ${name} wurde nicht eindeutig erkannt.`,
        hint: "Intervall manuell ergänzen, sofern es aus der Ausschreibung eindeutig hervorgeht.",
      });
    }
    if (item.unit_price === null || item.unit_price <= 0) {
      issues.push({
        itemId: item.id,
        field: "unit_price",
        level: "warning",
        message: `Einheitspreis für Position ${name} fehlt.`,
        hint: "Preis aus der eigenen Kalkulation eintragen, bevor das Angebot abgegeben wird.",
      });
    }
    if (item.confidence_score < 0.5) {
      issues.push({
        itemId: item.id,
        field: "description",
        level: "warning",
        message: `Position ${name}: geringe Erkennungssicherheit (${Math.round(item.confidence_score * 100)} %).`,
        hint: "Position gegen die Quellseite prüfen.",
      });
    }
  }

  return issues;
}

export function issuesByItem(issues: LvValidationIssue[]): Map<string, LvValidationIssue[]> {
  const map = new Map<string, LvValidationIssue[]>();
  for (const issue of issues) {
    if (!issue.itemId) continue;
    const list = map.get(issue.itemId) ?? [];
    list.push(issue);
    map.set(issue.itemId, list);
  }
  return map;
}
