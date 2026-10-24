import { annualWorkingHours } from "./working-time";
import { hasOwnPrice, pricingFrequency } from "./calculation";
import type { LvNormalizedItem, LvValidationIssue } from "./types";

/**
 * Prüfregeln für extrahierte Positionen: fehlende Menge, Einheit, Intervall und Preis.
 */
export function validateItems(items: LvNormalizedItem[]): LvValidationIssue[] {
  const issues: LvValidationIssue[] = [];

  for (const item of items) {
    const name = item.item_number || item.description.slice(0, 40) || "Position";

    if (item.working_time && annualWorkingHours(item) === null) {
      issues.push({ itemId: item.id, field: "document", level: "error",
        message: `Zeitbezug für Position ${name} ist nicht eindeutig.`,
        hint: "Stunden je Einsatz, Jahresstunden und Bewertungsmengen mit dem Original abgleichen. Bis zur Klärung keine Preisempfehlung." });
    }
    if (!item.description.trim()) {
      issues.push({
        itemId: item.id,
        field: "description",
        level: "error",
        message: `Beschreibung für Position ${name} fehlt.`,
        hint: "Beschreibung aus dem Original ergänzen.",
      });
    }
    if (item.quantity === null || !Number.isFinite(item.quantity) || item.quantity <= 0) {
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
    if (item.working_time?.basis !== "evaluation_total" && item.working_time?.basis !== "annual_total" && (pricingFrequency(item).perYear === null || !Number.isFinite(pricingFrequency(item).perYear!) || pricingFrequency(item).perYear! <= 0)) {
      issues.push({
        itemId: item.id,
        field: "frequency",
        level: "warning",
        message: `Reinigungsintervall für Position ${name} wurde nicht eindeutig erkannt.`,
        hint: "Intervall manuell ergänzen, sofern es aus der Ausschreibung eindeutig hervorgeht.",
      });
    }
    if (!hasOwnPrice(item)) {
      issues.push({
        itemId: item.id,
        field: "unit_price",
        level: "warning",
        message: `Einheitspreis für Position ${name} fehlt.`,
        hint: "Preis aus der eigenen Kalkulation eintragen, bevor das Angebot abgegeben wird.",
      });
    }
    if (item.area_m2 !== null && (!Number.isFinite(item.area_m2) || item.area_m2 <= 0)) {
      issues.push({
        itemId: item.id,
        field: "document",
        level: "warning",
        message: `Position ${name}: ungültige Reinigungsfläche.`,
        hint: "Flächenangabe mit dem Originaldokument abgleichen.",
      });
    }
    if (item.working_hours !== null && (!Number.isFinite(item.working_hours) || item.working_hours <= 0)) {
      issues.push({
        itemId: item.id,
        field: "document",
        level: "warning",
        message: `Position ${name}: ungültiger Zeitansatz.`,
        hint: "Arbeitszeit mit den Anforderungen der Ausschreibung abgleichen.",
      });
    }
    if (item.area_m2 !== null && item.area_m2 > 0 && item.quantity !== null && item.quantity > 0 &&
        /^(m²|m2|qm|m\^2)$/i.test(item.unit.trim()) &&
        Math.abs(item.quantity - item.area_m2) / Math.max(item.quantity, item.area_m2) > 0.05) {
      issues.push({
        itemId: item.id,
        field: "document",
        level: "warning",
        message: `Position ${name}: Menge und erkannte Fläche weichen voneinander ab.`,
        hint: "Prüfen, ob Menge und Fläche tatsächlich dieselbe Bezugsgröße haben.",
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
