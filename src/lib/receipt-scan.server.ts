import { generateGeminiJson } from "./gemini-json.server";

export type ScannedReceipt = {
  supplier: string;
  document_number: string;
  expense_date: string; // YYYY-MM-DD
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  category: string;
  notes: string;
};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return 0;
  const normalized =
    cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Wandelt Datumsangaben (TT.MM.JJJJ oder JJJJ-MM-TT) in ISO um. */
function isoDate(value: unknown): string {
  const s = String(value ?? "").trim();
  const de = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (de) {
    const [, d, m, y] = de;
    const year = y!.length === 2 ? `20${y}` : y!;
    const date = `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    return validDate(date) ? date : "";
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso && validDate(iso[0]!) ? iso[0]! : "";
}

function validDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

const SYSTEM = `Du extrahierst Daten aus einer deutschen EINGANGSRECHNUNG oder einem Kassenbon für die Buchhaltung. Lies ausschließlich die tatsächlich im Dokument erkennbaren Angaben.
WICHTIG – Rollen unterscheiden:
- supplier = RECHNUNGSAUSSTELLER/VERKÄUFER/LEISTUNGSERBRINGER (Firma, die die Rechnung ausstellt bzw. auf dem Kassenbon als Händler steht). Übernimm den vollständigen gedruckten Firmennamen einschließlich Rechtsform, wenn lesbar. Nicht die Rechnungsadresse des Empfängers, nicht den Kunden, nicht die eigene Firma Hom Reinigung Service / top4reinigung.de und nicht eine Zahlungsplattform, sofern diese nicht selbst Aussteller ist. Bei mehreren Firmen orientiere dich an 'Rechnung von', Impressum, Verkäufer, USt-IdNr. des Ausstellers; rate bei Unklarheit nicht, sondern gib einen leeren String zurück und schreibe den Grund in notes.
- document_number = ausdrücklich bezeichnete Rechnungsnummer/Belegnummer; nicht Bestellnummer, Kundennummer, Transaktions-ID, Steuer-ID oder Datum. Wenn nicht eindeutig, leerer String.
- expense_date = ausdrücklich ausgewiesenes Rechnungsdatum/Belegdatum (bei Kassenbons das Kaufdatum); nicht Zahlungsziel, Leistungszeitraum oder Bestelldatum. Bei fehlendem Datum leerer String. Format YYYY-MM-DD.
- net_amount, vat_amount, gross_amount = GESAMTBETRÄGE der gesamten Rechnung, keine Einzelpositionen, Zwischensummen, Rückgeld, bezahlten Teilbeträge oder früheren Salden. Berücksichtige ausgewiesene Rabatte. Zahlen mit Punkt als Dezimaltrennzeichen. Erfinde keine Beträge oder Steuersätze. Bei mehreren Umsatzsteuersätzen addiere nur die ausdrücklich ausgewiesenen Steuerbeträge. Wenn die Umsatzsteuer nicht ausgewiesen ist, setze vat_amount auf 0 und vermerke das in notes. Wenn Netto nicht ausgewiesen ist, aber Brutto und Steuer ausdrücklich ausgewiesen sind, berechne Netto als Brutto minus Steuer. Ist nur Brutto ausgewiesen, setze Netto=Brutto und VAT=0, und weise in notes ausdrücklich auf die fehlende Steueraufteilung hin – keine Vorsteuer erfinden.
- category nur aus: Material, Reinigungsmittel, Fahrzeug, Löhne, Miete, Versicherung, Sonstiges. Wähle nur bei eindeutigem Inhalt; sonst Sonstiges.
Bei schlechter Bildqualität oder uneindeutigen Feldern nichts erfinden. Erläutere unklare oder fehlende Angaben kurz in notes. Antworte ausschließlich mit reinem JSON gemäß Schema ohne Erklärung.`;

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    supplier: { type: "string" },
    document_number: { type: "string" },
    expense_date: { type: "string" },
    net_amount: { type: "number" },
    vat_amount: { type: "number" },
    gross_amount: { type: "number" },
    category: { type: "string" },
    notes: { type: "string" },
  },
  required: ["supplier", "document_number", "expense_date", "net_amount", "vat_amount", "gross_amount", "category", "notes"],
} as const;

/** Extrahiert Belegdaten direkt mit der Gemini API aus PDF- oder Bilddateien. */
export async function extractReceipt(dataUrl: string, mimeType: string): Promise<ScannedReceipt> {
  const parsed = await generateGeminiJson({
    model: process.env["GEMINI_MODEL_RECEIPT"] || "gemini-3.8-flash",
    system: SYSTEM,
    prompt: mimeType === "application/pdf"
      ? "Lies alle relevanten Seiten dieser PDF-Eingangsrechnung. Unterscheide Aussteller und Empfänger und entnimm Beträge ausschließlich der Gesamtsumme."
      : "Lies dieses Belegfoto sorgfältig. Unterscheide Händler und Käufer und entnimm Beträge ausschließlich der Gesamtsumme.",
    schema: RECEIPT_SCHEMA as unknown as Record<string, unknown>,
    dataUrl,
    mimeType,
  });

  let net = num(parsed["net_amount"]);
  let vat = num(parsed["vat_amount"]);
  const gross = num(parsed["gross_amount"]);
  if (net < 0 || vat < 0 || gross < 0) {
    throw new Error("Negative Rechnungsbeträge konnten nicht sicher zugeordnet werden. Bitte manuell prüfen.");
  }
  if (gross > 0 && net === 0 && vat > 0) net = Math.round((gross - vat) * 100) / 100;
  if (net === 0 && gross > 0 && vat === 0) net = gross;
  if (gross === 0 && net === 0) {
    throw new Error("Kein Rechnungsbetrag erkannt. Bitte die Rechnung prüfen und den Betrag manuell eingeben.");
  }
  if (net <= 0 && gross > 0) {
    throw new Error("Rechnungsbeträge sind nicht plausibel. Bitte manuell prüfen.");
  }
  const calculatedGross = Math.round((net + vat) * 100) / 100;
  if (gross > 0 && Math.abs(calculatedGross - gross) > 0.02) {
    throw new Error("Netto-, Steuer- und Bruttobetrag stimmen nicht überein. Bitte die Rechnung manuell prüfen.");
  }

  return {
    supplier: String(parsed["supplier"] ?? "").trim(),
    document_number: String(parsed["document_number"] ?? "").trim(),
    expense_date: isoDate(parsed["expense_date"]),
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross || calculatedGross,
    category: String(parsed["category"] ?? "").trim(),
    notes: String(parsed["notes"] ?? "").trim(),
  };
}
