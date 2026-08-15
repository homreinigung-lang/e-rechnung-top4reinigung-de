/** Zentrale Textbausteine für Angebote (Rechnungen bleiben bewusst nüchtern). */

export const QUOTE_INTRO =
  "Qualität, die man sieht – Zuverlässigkeit, die man spürt. Wir bei Hom Reinigung Service verstehen, dass eine gepflegte Umgebung die Visitenkarte Ihres Gebäudes ist. Unser Anspruch ist Ihre höchste Zufriedenheit durch gründliche, zuverlässige und professionelle Reinigungsleistungen. Wir setzen auf transparente Kommunikation und individuelle Lösungen, die genau auf Ihre Bedürfnisse abgestimmt sind. Vertrauen Sie auf unser Know-how und unsere zuverlässige Arbeitsweise – wir sind jederzeit gerne für Sie da.";

/** Überschrift mittig über dem Angebot. */
export function quoteHeadline(serviceName?: string | null): string {
  const service = (serviceName ?? "").trim() || "Gebäudereinigung";
  return `Professionelle ${service} – Zuverlässige Reinigung für ein dauerhaft gepflegtes Gebäude`;
}

/** Leistungsbezeichnung aus Dokumentdaten ableiten. */
export function deriveServiceName(
  serviceDescription?: string | null,
  firstItemDescription?: string | null,
): string {
  const raw = (serviceDescription || firstItemDescription || "").split("\n")[0]?.trim() ?? "";
  if (!raw) return "Gebäudereinigung";
  return raw.length > 60 ? `${raw.slice(0, 57).trimEnd()}…` : raw;
}
