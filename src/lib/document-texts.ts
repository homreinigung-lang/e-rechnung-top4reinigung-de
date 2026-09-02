/** Zentrale Textbausteine für Angebote (Rechnungen bleiben bewusst nüchtern). */

/** Standard-Einleitungstext für Rechnungen. */
export const INVOICE_INTRO =
  "Für unsere Leistungen erlauben wir uns, Ihnen folgende Positionen in Rechnung zu stellen:";

/**
 * Einleitungstext für Angebote. Der Firmenname wird immer dynamisch aus den
 * Firmeneinstellungen der angemeldeten Firma übernommen – niemals fest hinterlegt.
 */
export function quoteIntro(companyName?: string | null): string {
  const name = (companyName ?? "").trim();
  const subject = name ? `Wir bei ${name} verstehen` : "Wir verstehen";
  return `Qualität, die man sieht – Zuverlässigkeit, die man spürt. ${subject}, dass eine gepflegte Umgebung die Visitenkarte Ihres Gebäudes ist. Unser Anspruch ist Ihre höchste Zufriedenheit durch gründliche, zuverlässige und professionelle Reinigungsleistungen. Wir setzen auf transparente Kommunikation und individuelle Lösungen, die genau auf Ihre Bedürfnisse abgestimmt sind. Vertrauen Sie auf unser Know-how und unsere zuverlässige Arbeitsweise – wir sind jederzeit gerne für Sie da.`;
}

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

/** Einleitungstext für Angebote an Privatkunden. */
export const QUOTE_INTRO_PRIVAT =
  "Vielen Dank für das angenehme Gespräch und Ihr Vertrauen. Ihr Zuhause verdient eine Reinigung mit Sorgfalt und Aufmerksamkeit fürs Detail — genau dafür stehen wir. Als zuverlässiger Partner sorgen wir mit geschultem Personal und bewährten Reinigungsmethoden dafür, dass Sie sich in Ihren eigenen vier Wänden rundum wohlfühlen. Nachfolgend finden Sie unser maßgeschneidertes Angebot für die gewünschten Reinigungsarbeiten. Sollten Sie mit einem Ergebnis nicht zufrieden sein, reinigen wir selbstverständlich kostenfrei nach. Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.";

/** Rechtlicher Hinweis am Ende jedes Angebots. */
export const QUOTE_DISCLAIMER =
  "Dieses Angebot basiert auf der durchgeführten Besichtigung des Objekts und den dabei erfassten Angaben. Änderungen im Leistungsumfang können zu einer Anpassung des Preises führen. Wir würden uns über eine Zusammenarbeit freuen.";

/**
 * Standard-Einleitung für Angebote je nach Kundentyp. Wird als Vorbelegung im
 * Dokumenteneditor genutzt und greift beim PDF-Export, wenn das Feld leer ist.
 */
export function defaultQuoteIntro(isPrivat: boolean, companyName?: string | null): string {
  return isPrivat ? QUOTE_INTRO_PRIVAT : quoteIntro(companyName);
}

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
