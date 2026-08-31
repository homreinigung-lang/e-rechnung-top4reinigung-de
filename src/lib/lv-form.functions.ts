import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LvFormItem = {
  item_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
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

const SYSTEM = `Du bist ein Ausschreibungs-Experte für ein deutsches Gebäudereinigungsunternehmen.
Lies das Leistungsverzeichnis (LV) und extrahiere JEDE einzelne Position als JSON-Array.
Je Position:
- item_number: Ordnungszahl / Positionsnummer wörtlich (z. B. "01.0010"), sonst "".
- description: Positionstext wörtlich, kurz.
- quantity: Menge als Zahl (deutsches Komma in Punkt umwandeln), sonst 0.
- unit: Einheit (z. B. "m²", "Stk", "Monat", "Std"), sonst "".
- unit_price: Einheitspreis in EUR als Zahl; steht keiner im Dokument, 0.
ABSOLUTES VERBOT: Keine Beispiel- oder erfundenen Positionen. Nur übernehmen, was im Dokument steht.
Antworte ausschließlich mit reinem JSON: {"items": [...]}.`;

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "lv_positionen",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item_number: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unit_price: { type: "number" },
            },
            required: ["item_number", "description", "quantity", "unit", "unit_price"],
          },
        },
      },
      required: ["items"],
    },
  },
};

/** Ruft das KI-Gateway auf und normalisiert das Ergebnis auf LV-Positionen. */
async function runLvExtraction(userContent: unknown): Promise<LvFormItem[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-pro-preview",
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
      response_format: RESPONSE_FORMAT,
    }),
  });

  if (res.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`Analyse fehlgeschlagen (${res.status}).`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return [];
  }

  const items = Array.isArray(parsed["items"]) ? (parsed["items"] as Record<string, unknown>[]) : [];
  return items
    .map((i): LvFormItem => ({
      item_number: String(i["item_number"] ?? "").trim(),
      description: String(i["description"] ?? "").trim(),
      quantity: num(i["quantity"]),
      unit: String(i["unit"] ?? "").trim(),
      unit_price: num(i["unit_price"]),
    }))
    .filter((i) => i.description || i.item_number);
}

/** Analysiert einen LV-Text (PDF/TXT/Tabelle) und liefert die Positionen als JSON-Array. */
export const analyzeLvText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pdfText: string }) => {
    const text = String(input?.pdfText ?? "").slice(0, 120_000);
    if (!text.trim()) throw new Error("Die Datei enthält keinen lesbaren Text.");
    return { pdfText: text };
  })
  .handler(async ({ data }) =>
    runLvExtraction(`Extrahiere alle LV-Positionen aus diesem Text:\n\n${data.pdfText}`),
  );

/**
 * Analysiert ein gescanntes PDF (ohne Textebene) direkt als Dokument –
 * die Texterkennung (OCR) übernimmt das multimodale KI-Modell.
 */
export const analyzeLvScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; mimeType: string; base64: string }) => {
    const base64 = String(input?.base64 ?? "");
    if (!base64) throw new Error("Die Datei konnte nicht gelesen werden.");
    if (base64.length > 20_000_000) throw new Error("Die Datei ist zu groß für die Texterkennung.");
    return {
      fileName: String(input?.fileName ?? "dokument.pdf"),
      mimeType: String(input?.mimeType || "application/pdf"),
      base64,
    };
  })
  .handler(async ({ data }) =>
    runLvExtraction([
      {
        type: "text",
        text: "Dieses Dokument ist ein gescanntes Leistungsverzeichnis. Lies den Text (OCR) und extrahiere alle Positionen.",
      },
      {
        type: "file",
        file: {
          filename: data.fileName,
          file_data: `data:${data.mimeType};base64,${data.base64}`,
        },
      },
    ]),
  );
