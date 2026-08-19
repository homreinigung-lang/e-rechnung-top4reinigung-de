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

/** Rechtlicher Hinweis am Ende jedes Angebots. */
export const QUOTE_DISCLAIMER =
  "Dieses Angebot basiert auf der durchgeführten Besichtigung des Objekts und den dabei erfassten Angaben. Änderungen im Leistungsumfang können zu einer Anpassung des Preises führen. Wir würden uns über eine Zusammenarbeit freuen.";

/** Storno- und Terminbedingungen (Angebot und Auftragsbestätigung). */
export const CANCELLATION_TERMS =
  "Terminverschiebungen oder -änderungen müssen bis spätestens 24 Stunden vor dem vereinbarten Termin mitgeteilt werden. Eine komplette Stornierung des Auftrags oder Vertrages muss schriftlich erfolgen und bis spätestens 14 Tage vor dem vereinbarten Leistungstermin eingehen. Bei einer späteren Stornierung des gesamten Auftrags behalten wir uns das Recht vor, eine Ausfallpauschale in Höhe von 50% des Auftragswertes zu berechnen.";

/** Einleitungstext der Auftragsbestätigung. */
export const ORDER_INTRO =
  "Vielen Dank für Ihren Auftrag. Hiermit bestätigen wir Ihnen die nachfolgend aufgeführten Leistungen verbindlich zu den genannten Konditionen. Sollten sich Änderungen ergeben, informieren Sie uns bitte rechtzeitig.";

/** Überschrift mittig über der Auftragsbestätigung. */
export function orderHeadline(serviceName?: string | null): string {
  const service = (serviceName ?? "").trim() || "Gebäudereinigung";
  return `Auftragsbestätigung – ${service}`;
}
