// EPC069-12 (GiroCode) Nutzdaten für SEPA-Überweisung per QR-Code.
export function buildEpcPayload(params: {
  name: string;
  iban: string;
  bic?: string;
  amount: number;
  reference: string;
}): string | null {
  const iban = params.iban.replace(/\s+/g, "").toUpperCase();
  const name = (params.name || "").trim().slice(0, 70) || "Hom Reinigung Service";
  if (!iban) return null;
  // Betrag ist optional: bei 0 EUR wird das Feld leer gelassen (Bank-App fragt nach).
  const amount = params.amount > 0 ? `EUR${params.amount.toFixed(2)}` : "";
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    (params.bic ?? "").replace(/\s+/g, "").toUpperCase(),
    name,
    iban,
    amount,
    "",
    "",
    params.reference.slice(0, 140),
  ].join("\n");
}
