/**
 * Erkennung „leerer Entwürfe“: Ein neu erstellter Beleg, in den der Nutzer
 * nichts eingetragen hat, darf weder automatisch gespeichert noch als
 * Karteileiche in der Beleg-Liste stehen bleiben.
 */

export type EmptyDraftItem = {
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
};

const TEXT_FIELDS = [
  "order_number",
  "service_period",
  "customer_name",
  "customer_company",
  "customer_email",
  "customer_address_line",
  "customer_postal_code",
  "customer_city",
  "customer_vat_id",
  "customer_number",
  "title",
  "service_description",
  "notes",
  "attachment_title",
  "attachment_text",
  "discount_reason",
] as const;

/** Prüft, ob mindestens eine Position echte Daten enthält. */
export function hasMeaningfulItem(items: EmptyDraftItem[]): boolean {
  return items.some(
    (i) =>
      String(i.description ?? "").trim().length > 0 ||
      Number(i.quantity ?? 0) > 0 ||
      Number(i.unit_price ?? 0) > 0,
  );
}

/**
 * true, wenn der Beleg ausschließlich Standardwerte enthält:
 * kein Kunde, keine Position mit Menge/Preis, keine Freitexte.
 *
 * `baseline` ist der Formularstand direkt nach dem Laden. Weicht irgendein
 * Feld davon ab (z. B. Einleitungstext, Datum, Steuermodus, Kundenart), hat
 * der Nutzer etwas geändert – der Entwurf gilt dann nie als leer.
 */
export function isEmptyDraft(
  form: Record<string, string | boolean | null>,
  items: EmptyDraftItem[],
  baseline?: Record<string, string | boolean | null> | null,
): boolean {
  if (Object.keys(form).length === 0) return false;
  if (baseline && Object.keys(baseline).length > 0) {
    const keys = new Set([...Object.keys(baseline), ...Object.keys(form)]);
    for (const key of keys) {
      if (String(form[key] ?? "") !== String(baseline[key] ?? "")) return false;
    }
  }
  if (String(form["status"] ?? "draft") !== "draft") return false;
  if (form["customer_id"]) return false;
  if (hasMeaningfulItem(items)) return false;
  if (Number(String(form["discount_percent"] ?? "0").replace(",", ".")) > 0) return false;
  for (const field of TEXT_FIELDS) {
    if (String(form[field] ?? "").trim()) return false;
  }
  return true;
}
