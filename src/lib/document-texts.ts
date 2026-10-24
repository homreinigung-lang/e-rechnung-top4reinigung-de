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
  const sender = name ? `${name} bietet` : "Wir bieten";
  return `Vielen Dank für Ihre Anfrage. ${sender} Ihnen die nachfolgend aufgeführten Reinigungsleistungen zu den angegebenen Preisen an.`;
}

/** Überschrift mittig über dem Angebot. */
export function quoteHeadline(serviceName?: string | null): string {
  const service = (serviceName ?? "").trim() || "Gebäudereinigung";
  return `Angebot – ${service}`;
}

/** Leistungsbezeichnung aus Dokumentdaten ableiten. */
export function deriveServiceName(
  serviceDescription?: string | null,
  firstItemDescription?: string | null,
): string {
  const raw = (firstItemDescription || serviceDescription || "").split("\n")[0]?.split(" – ")[0]?.trim() ?? "";
  if (!raw) return "Gebäudereinigung";
  return raw.length > 60 ? `${raw.slice(0, 57).trimEnd()}…` : raw;
}

/** Einleitungstext für Angebote an Privatkunden. */
export const QUOTE_INTRO_PRIVAT =
  "Vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen die nachfolgend aufgeführten Reinigungsleistungen für Ihr Zuhause an.";

/** Rechtlicher Hinweis am Ende jedes Angebots. */
export const QUOTE_DISCLAIMER =
  "Dieses Angebot umfasst die beschriebenen Leistungen. Änderungen des Leistungsumfangs können eine Preisanpassung erfordern. Wir freuen uns auf Ihre Rückmeldung.";

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
