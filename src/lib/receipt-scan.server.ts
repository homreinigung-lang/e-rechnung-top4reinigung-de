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

const EMPTY: ScannedReceipt = {
  supplier: "",
  document_number: "",
  expense_date: "",
  net_amount: 0,
  vat_amount: 0,
  gross_amount: 0,
  category: "",
  notes: "",
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
  const de = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
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
Wenn Netto oder Umsatzsteuer nicht ausgewiesen sind, berechne sie aus dem Bruttobetrag mit 19 % USt.
Kategorie nur aus: Material, Reinigungsmittel, Fahrzeug, Löhne, Miete, Versicherung, Sonstiges.
Antworte ausschließlich mit reinem JSON ohne Erklärung.`;

/** Extrahiert Belegdaten mit dem KI-Gateway aus PDF- oder Bilddateien. */
export async function extractReceipt(
  dataUrl: string,
  mimeType: string,
): Promise<ScannedReceipt> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");

  const content = mimeType === "application/pdf"
    ? [
        { type: "text", text: "Extrahiere die Belegdaten aus dieser PDF-Rechnung." },
        { type: "file", file: { filename: "beleg.pdf", file_data: dataUrl } },
      ]
    : [
        { type: "text", text: "Extrahiere die Belegdaten aus diesem Beleg-Foto." },
        { type: "image_url", image_url: { url: dataUrl } },
      ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "beleg",
          strict: true,
          schema: {
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
          },
        },
      },
    }),
  });

  if (res.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`Beleg konnte nicht gelesen werden (${res.status}).`);

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return EMPTY;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return EMPTY;
  }

  let net = num(parsed["net_amount"]);
  let vat = num(parsed["vat_amount"]);
  const gross = num(parsed["gross_amount"]);
  if (!net && gross) net = Math.round((gross / 1.19) * 100) / 100;
  if (!vat && gross && net) vat = Math.round((gross - net) * 100) / 100;

  return {
    supplier: String(parsed["supplier"] ?? "").trim(),
    document_number: String(parsed["document_number"] ?? "").trim(),
    expense_date: isoDate(parsed["expense_date"]),
    net_amount: net,
    vat_amount: vat < 0 ? 0 : vat,
    gross_amount: gross || Math.round((net + vat) * 100) / 100,
    category: String(parsed["category"] ?? "").trim(),
    notes: String(parsed["notes"] ?? "").trim(),
  };
}
