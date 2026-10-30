/** Missing modes use domestic VAT; keep the legacy Kleinunternehmer spelling readable. */
export function normalizeTaxMode(value: unknown): string {
  const mode = String(value ?? "").trim();
  if (mode === "small_business") return "kleinunternehmer";
  return mode || "domestic";
}

/** Keep the accounting/GoBD labels consistent with the selected tax treatment. */
export function taxModeLabel(value: unknown): string {
  const mode = normalizeTaxMode(value);
  if (mode === "domestic") return "19% Inland";
  if (mode === "kleinunternehmer") return "Kleinunternehmer § 19 UStG";
  if (mode === "domestic_reverse_charge") return "§ 13b Inland Gebäudereinigung";
  if (mode === "eu_reverse_charge") return "Reverse-Charge EU";
  return "Reverse-Charge § 13b UStG";
}
