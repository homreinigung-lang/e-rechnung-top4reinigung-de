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
    return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0]! : "";
}

const SYSTEM = `Du bist ein Buchhaltungs-Assistent für ein deutsches Reinigungsunternehmen.
Lies den hochgeladenen Beleg bzw. die Eingangsrechnung und extrahiere die Daten exakt so, wie sie auf dem Dokument stehen.
Beträge als Zahl mit Punkt als Dezimaltrennzeichen. Datum als JJJJ-MM-TT.
Erfinde keine Beträge oder Steuersätze. Wenn die Umsatzsteuer nicht ausgewiesen ist, setze vat_amount auf 0 und erwähne die fehlende Angabe in notes. Wenn der Nettobetrag fehlt, aber Brutto und Umsatzsteuer ausdrücklich ausgewiesen sind, berechne Netto als Brutto minus Umsatzsteuer.
Kategorie nur aus: Material, Reinigungsmittel, Fahrzeug, Löhne, Miete, Versicherung, Sonstiges.
Antworte ausschließlich mit reinem JSON ohne Erklärung.`;

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
  required: [
    "supplier",
    "document_number",
    "expense_date",
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
        ? "Extrahiere die Belegdaten aus dieser PDF-Rechnung."
        : "Extrahiere die Belegdaten aus diesem Beleg-Foto.",
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
