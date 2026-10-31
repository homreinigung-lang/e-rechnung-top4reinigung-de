/** Preisfreie Angebotstexte je Leistungsart. */
export type QuoteTextContext = { companyName?: string | null; isPrivat?: boolean };
type ServiceTemplate = { label: string; scope: string; hint: string };
export const QUOTE_SERVICE_TEMPLATES: Record<string, ServiceTemplate> = {
  unterhalt: { label: "Unterhaltsreinigung", scope: "regelmäßige Unterhaltsreinigung Ihrer Räumlichkeiten", hint: "Die Reinigung erfolgt im vereinbarten Turnus. Terminänderungen teilen Sie uns bitte rechtzeitig mit." },
  grund: { label: "Grundreinigung", scope: "gründliche Grundreinigung Ihrer Räumlichkeiten", hint: "Die Grundreinigung wird einmalig zum vereinbarten Termin durchgeführt. Bei außergewöhnlich starker Verschmutzung stimmen wir uns vorab mit Ihnen ab." },
  bau: { label: "Bauendreinigung", scope: "Reinigung nach Abschluss Ihrer Bau- bzw. Renovierungsarbeiten", hint: "Grundlage ist ein baustellenüblicher Verschmutzungsgrad (z. B. Staub, Farb- und Mörtelreste, Folien). Vorhandene Beschädigungen an Oberflächen können durch die Reinigung nicht behoben werden." },
  glas: { label: "Glas- und Fensterreinigung", scope: "Reinigung Ihrer Fenster und Glasflächen", hint: "Die Reinigung erfolgt bei geeigneter Witterung und freiem Zugang zu allen Glasflächen. Bei witterungsbedingter Verschiebung vereinbaren wir kurzfristig einen Ersatztermin." },
  treppenhaus: { label: "Treppenhausreinigung", scope: "regelmäßige Reinigung Ihres Treppenhauses", hint: "Voraussetzung sind ein freier Zugang zu Treppenhaus, Etagen und gegebenenfalls Aufzug sowie ein Wasseranschluss im Gebäude." },
  buero: { label: "Büroreinigung", scope: "regelmäßige Reinigung Ihrer Büroräume", hint: "Persönliche Gegenstände und Unterlagen auf den Arbeitsplätzen werden nicht bewegt; für die Reinigung setzen wir freie Oberflächen voraus." },
  wohn: { label: "Wohnungsreinigung", scope: "Reinigung Ihrer Wohnung", hint: "Für die Reinigung benötigen wir Zutritt zu allen vereinbarten Räumen sowie einen Wasser- und Stromanschluss. Den Termin stimmen wir gerne individuell mit Ihnen ab." },
  praxis: { label: "Praxisreinigung", scope: "Reinigung Ihrer Praxisräume", hint: "Die Reinigung erfolgt unter Beachtung Ihrer Hygienevorgaben, die Sie uns bitte vorab mitteilen. Medizinische Geräte und patientenbezogene Unterlagen werden nicht gereinigt bzw. bewegt." },
};
export const QUOTE_CLOSING_BASE = "Änderungen des Leistungsumfangs können eine Preisanpassung erfordern. Zur Beauftragung genügt eine kurze Bestätigung per E-Mail. Wir freuen uns auf Ihre Rückmeldung.";
function uniqueKnown(keys: string[]): string[] {
  return [...new Set(keys)].filter((key) => Object.prototype.hasOwnProperty.call(QUOTE_SERVICE_TEMPLATES, key));
}
function joinScopes(scopes: string[]): string {
  const parts = scopes.map((scope) => `die ${scope}`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} sowie ${parts[parts.length - 1]}`;
}
export function quoteIntroFor(serviceKeys: string[], ctx: QuoteTextContext = {}): string | null {
  const keys = uniqueKnown(serviceKeys);
  if (!keys.length) return null;
  const name = (ctx.companyName ?? "").trim();
  const sender = ctx.isPrivat ? "Gerne unterbreiten wir Ihnen" : name ? `${name} unterbreitet Ihnen` : "Wir unterbreiten Ihnen";
  return `Vielen Dank für Ihre Anfrage. ${sender} ein Angebot für ${joinScopes(keys.map((key) => QUOTE_SERVICE_TEMPLATES[key]!.scope))}. Die vorgesehenen Leistungen finden Sie nachfolgend aufgelistet.`;
}
export function quoteClosingFor(serviceKeys: string[]): string | null {
  const keys = uniqueKnown(serviceKeys);
  if (!keys.length) return null;
  return `${keys.map((key) => QUOTE_SERVICE_TEMPLATES[key]!.hint).join(" ")} ${QUOTE_CLOSING_BASE}`;
}
/** Nur explizite Leistungsbezeichnungen erkennen, keine beiläufig erwähnten Fenster. */
const SERVICE_PATTERNS: [string, RegExp][] = [
  ["bau", /^(?:bauendreinigung|baureinigung)\b/i],
  ["grund", /^grundreinigung\b/i],
  ["glas", /^(?:glas(?:-|\s|reinigung)|fensterreinigung)\b/i],
  ["treppenhaus", /^treppenhausreinigung\b/i],
  ["praxis", /^praxisreinigung\b/i],
  ["buero", /^(?:büroreinigung|bueroreinigung)\b/i],
  ["wohn", /^wohnungsreinigung\b/i],
  ["unterhalt", /^unterhaltsreinigung\b/i],
];
export function serviceKeysFromTexts(texts: string[]): string[] {
  return SERVICE_PATTERNS.filter(([, pattern]) => texts.some((text) => pattern.test(text.trim()))).map(([key]) => key);
}
