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
  const cleaned = value.replace(/(?:EUR|€|\s)/gi, "").trim();
  if (!/^-?\d+(?:[.,]\d+)*$/.test(cleaned)) return 0;
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
  const de = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (de) {
    const [, d, m, y] = de;
    const year = y!.length === 2 ? `20${y}` : y!;
    const date = `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    return validDate(date) ? date : "";
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validDate(iso[0]!) ? iso[0]! : "";
  const written = s.toLocaleLowerCase("de-DE").match(/^(\d{1,2})\.?\s+([a-zä]+)\s+(\d{4})$/);
  if (!written) return "";
  const months = [
    "januar",
    "februar",
    "märz",
    "april",
    "mai",
    "juni",
    "juli",
    "august",
    "september",
    "oktober",
    "november",
    "dezember",
  ];
  const month = months.indexOf(written[2]!) + 1;
  const date = `${written[3]}-${String(month).padStart(2, "0")}-${written[1]!.padStart(2, "0")}`;
  return month && validDate(date) ? date : "";
}

function validDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const SYSTEM = `Du extrahierst Daten aus einer deutschen EINGANGSRECHNUNG oder einem Kassenbon für die Buchhaltung. Lies ausschließlich die tatsächlich im Dokument erkennbaren Angaben.
WICHTIG – Rollen unterscheiden:
- supplier = RECHNUNGSAUSSTELLER/VERKÄUFER/LEISTUNGSERBRINGER (Firma, die die Rechnung ausstellt bzw. auf dem Kassenbon als Händler steht). Übernimm den vollständigen gedruckten Firmennamen einschließlich Rechtsform, wenn lesbar. Nicht die Rechnungsadresse des Empfängers, nicht den Kunden, nicht die eigene Firma Hom Reinigung Service / top4reinigung.de und nicht eine Zahlungsplattform, sofern diese nicht selbst Aussteller ist. Bei mehreren Firmen orientiere dich an 'Rechnung von', Impressum, Verkäufer, USt-IdNr. des Ausstellers; rate bei Unklarheit nicht, sondern gib einen leeren String zurück und schreibe den Grund in notes.
- document_number = ausdrücklich bezeichnete Rechnungsnummer/Belegnummer; nicht Bestellnummer, Kundennummer, Transaktions-ID, Steuer-ID oder Datum. Zeichengetreu einschließlich führender Nullen und Trennzeichen, ohne Umdeuten von O/0 oder I/1. Wenn nicht eindeutig, leerer String.
- expense_date = ausdrücklich ausgewiesenes Rechnungsdatum/Belegdatum (bei Kassenbons das Kaufdatum); nicht Zahlungsziel, Leistungszeitraum oder Bestelldatum. Lies Tag, Monat und insbesondere alle vier Ziffern der Jahreszahl sorgfältig aus dem Dokument ab. Verwechsle 2/6, 0/8 und 1/7 nicht; interpretiere keine Jahreszahl aus dem aktuellen Datum. Wenn eine Ziffer nicht sicher erkennbar ist, gib einen leeren String zurück und erläutere dies in notes. Format YYYY-MM-DD.
- expense_date_text = das zu expense_date gehörende Datum exakt wie gedruckt, ohne Feldbezeichnung; bei unsicheren Ziffern leer. Prüfe vor der Antwort, dass alle Ziffern einschließlich der Jahreszahl mit expense_date übereinstimmen. Kein Datum aus Zahlungsziel oder Leistungszeitraum verwenden.
- net_amount, vat_amount, gross_amount = GESAMTBETRÄGE der gesamten Rechnung, keine Einzelpositionen, Zwischensummen, Rückgeld, bezahlten Teilbeträge oder früheren Salden. Berücksichtige ausgewiesene Rabatte. Zahlen mit Punkt als Dezimaltrennzeichen. Erfinde keine Beträge oder Steuersätze. Bei mehreren Umsatzsteuersätzen addiere nur die ausdrücklich ausgewiesenen Steuerbeträge. Wenn die Umsatzsteuer nicht ausgewiesen ist, setze vat_amount auf 0 und vermerke das in notes. Wenn Netto nicht ausgewiesen ist, aber Brutto und Steuer ausdrücklich ausgewiesen sind, berechne Netto als Brutto minus Steuer. Ist nur Brutto ausgewiesen, setze Netto=Brutto und VAT=0, und weise in notes ausdrücklich auf die fehlende Steueraufteilung hin – keine Vorsteuer erfinden. Kontrolliere Netto + Steuer = Brutto; keine Ziffer ändern, nur um die Summe passend zu machen.
- category nur aus: Material, Reinigungsmittel, Fahrzeug, Löhne, Sozialabgaben / Arbeitgeberabgaben, Miete, Versicherung, Sonstiges. Zahlungen an Sozialversicherungsträger wie Knappschaft-Bahn-See für Arbeitgeber-/Sozialabgaben ordnest du "Sozialabgaben / Arbeitgeberabgaben" zu, sofern der Beleg/Zahlungstext das eindeutig zeigt. Wähle nur bei eindeutigem Inhalt; sonst Sonstiges.
Bei schlechter Bildqualität oder uneindeutigen Feldern nichts erfinden. Erläutere unklare oder fehlende Angaben kurz in notes. Antworte ausschließlich mit reinem JSON gemäß Schema ohne Erklärung.`;

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    supplier: { type: "string" },
    document_number: { type: "string" },
    expense_date: { type: "string" },
    expense_date_text: { type: "string" },
    net_amount: { type: "number" },
    vat_amount: { type: "number" },
    gross_amount: { type: "number" },
    category: { type: "string" },
    notes: { type: "string" },
  },
  required: [
    "supplier",
    "document_number",
    "expense_date",
    "expense_date_text",
    "net_amount",
    "vat_amount",
    "gross_amount",
    "category",
    "notes",
  ],
} as const;

/** Extrahiert Belegdaten direkt mit der Gemini API aus PDF- oder Bilddateien. */
export async function extractReceipt(dataUrl: string, mimeType: string): Promise<ScannedReceipt> {
  const parsed = await generateGeminiJson({
    model: process.env["GEMINI_MODEL_RECEIPT"] || "gemini-3.8-flash",
    system: SYSTEM,
    prompt:
      mimeType === "application/pdf"
        ? "Lies alle relevanten Seiten dieser PDF-Eingangsrechnung. Unterscheide Aussteller und Empfänger und entnimm Beträge ausschließlich der Gesamtsumme."
        : "Lies dieses Belegfoto sorgfältig. Unterscheide Händler und Käufer und entnimm Beträge ausschließlich der Gesamtsumme.",
    schema: RECEIPT_SCHEMA as unknown as Record<string, unknown>,
    dataUrl,
    mimeType,
    timeoutMs: 10_000,
    totalTimeoutMs: 15_000,
    // Keep the existing model order, but switch immediately instead of retrying
    // the same overloaded model with a fixed sleep. One request on success.
    attemptsPerModel: 1,
    schemaInPrompt: false,
    validate: (value) => num(value["net_amount"]) !== 0 || num(value["gross_amount"]) !== 0,
  });

  let net = num(parsed["net_amount"]);
  const vat = num(parsed["vat_amount"]);
  const gross = num(parsed["gross_amount"]);
  if (net < 0 || vat < 0 || gross < 0) {
    throw new Error(
      "Negative Rechnungsbeträge konnten nicht sicher zugeordnet werden. Bitte manuell prüfen.",
    );
  }
  if (gross > 0 && net === 0 && vat > 0) net = Math.round((gross - vat) * 100) / 100;
  if (net === 0 && gross > 0 && vat === 0) net = gross;
  if (gross === 0 && net === 0) {
    throw new Error(
      "Kein Rechnungsbetrag erkannt. Bitte die Rechnung prüfen und den Betrag manuell eingeben.",
    );
  }
  if (net <= 0 && gross > 0) {
    throw new Error("Rechnungsbeträge sind nicht plausibel. Bitte manuell prüfen.");
  }
  const calculatedGross = Math.round((net + vat) * 100) / 100;
  if (gross > 0 && Math.abs(calculatedGross - gross) > 0.02) {
    throw new Error(
      "Netto-, Steuer- und Bruttobetrag stimmen nicht überein. Bitte die Rechnung manuell prüfen.",
    );
  }

  // Validate the extracted date locally: no second AI request or extra network latency.
  // Older receipts remain allowed; suspicious dates require user review.
  const extractedDate = isoDate(parsed["expense_date"]);
  const currentYear = new Date().getUTCFullYear();
  const receiptYear = extractedDate ? Number(extractedDate.slice(0, 4)) : 0;
  const printedDate = isoDate(parsed["expense_date_text"]);
  // This is a same-response consistency check, not independent OCR verification.
  const suspiciousDate =
    !extractedDate ||
    printedDate !== extractedDate ||
    receiptYear > currentYear + 1 ||
    receiptYear < currentYear - 3;
  const verifiedDate = suspiciousDate ? "" : extractedDate;
  const dateWarning = suspiciousDate
    ? "Belegdatum fehlt oder ist auffällig. Bitte das Datum auf dem Originalbeleg prüfen und manuell eingeben."
    : "";

  return {
    supplier: String(parsed["supplier"] ?? "").trim(),
    document_number: String(parsed["document_number"] ?? "").trim(),
    expense_date: verifiedDate,
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross || calculatedGross,
    category: String(parsed["category"] ?? "").trim(),
    notes: [String(parsed["notes"] ?? "").trim(), dateWarning].filter(Boolean).join(" · "),
  };
}
