/** Missing modes use domestic VAT; keep the legacy Kleinunternehmer spelling readable. */
export function normalizeTaxMode(value: unknown): string {
  const mode = String(value ?? "").trim();
  if (mode === "small_business") return "kleinunternehmer";
  return mode || "domestic";
}
