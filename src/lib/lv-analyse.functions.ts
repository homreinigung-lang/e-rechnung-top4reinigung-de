import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Rohposition, wie sie das KI-Modell liefert (Normalisierung passiert im Client-Modul). */
export type LvAnalyseRawItem = {
  item_number: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  frequency: string;
  area_m2: number;
  working_hours: number;
  unit_price: number;
  total_price: number;
  vat_rate: number;
  source_page: number;
  confidence_score: number;
};

export type LvAnalyseRawTotal = { label: string; amount: number; source_page: number };

export type LvAnalyseResponse = {
  document_kind: string;
  summary: string;
  items: LvAnalyseRawItem[];
  totals: LvAnalyseRawTotal[];
  /** Hinweise zu Teilausfällen (einzelne Textabschnitte) – nie stillschweigend. */
  warnings?: string[];
};

const SYSTEM = `Du bist Ausschreibungs-Analyst für ein deutsches Gebäudereinigungsunternehmen.
Analysiere das übergebene Ausschreibungsdokument (Leistungsverzeichnis, Preisblatt oder Leistungsbeschreibung).

Bestimme zuerst document_kind – genau einer dieser Werte:
- "detailed_lv": Positionsliste mit Mengen/Einheiten.
- "pricing_form": nur Preis-/Summenfelder ohne Einzelpositionen.
- "cleaning_spec": beschreibende Reinigungs-Leistungsbeschreibung ohne kalkulierbare Positionen.
- "unsupported": kein verwertbarer Reinigungsbezug.

Extrahiere anschließend JEDE Position:
- item_number: Ordnungszahl wörtlich, sonst "".
- description: Positionstext, kurz und wörtlich.
- category: eine von unterhaltsreinigung|glasreinigung|grundreinigung|sonderreinigung|winterdienst|verbrauchsmaterial|sonstiges.
- quantity: Menge als Zahl (deutsches Komma -> Punkt), sonst 0.
- unit: Einheit ("m²", "Stk", "Std", "Monat", "psch"), sonst "".
- frequency: Reinigungsintervall wörtlich (z. B. "5x wöchentlich"), sonst "".
- area_m2: Fläche in m², sonst 0.
- working_hours: Stunden je Einsatz, sonst 0.
- unit_price / total_price: EUR-Beträge, sonst 0.
- vat_rate: Steuersatz in Prozent, sonst 0.
- source_page: Seitenzahl aus den Markierungen "--- Seite N ---", sonst 0.
- confidence_score: 0 bis 1, wie sicher die Position gelesen wurde.

Erfasse in totals alle reinen Summenzeilen (Gesamt, Netto, MwSt, Jahrespreis) mit label, amount und source_page.
ABSOLUTES VERBOT: keine erfundenen Positionen oder Beispielwerte. Nur was im Dokument steht.
Antworte ausschließlich mit reinem JSON.`;

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    item_number: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string" },
    frequency: { type: "string" },
    area_m2: { type: "number" },
    working_hours: { type: "number" },
    unit_price: { type: "number" },
    total_price: { type: "number" },
    vat_rate: { type: "number" },
    source_page: { type: "number" },
    confidence_score: { type: "number" },
  },
  required: [
    "item_number",
    "description",
    "category",
    "quantity",
    "unit",
    "frequency",
    "area_m2",
    "working_hours",
    "unit_price",
    "total_price",
    "vat_rate",
    "source_page",
    "confidence_score",
  ],
};

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "lv_analyse",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        document_kind: { type: "string" },
        summary: { type: "string" },
        items: { type: "array", items: ITEM_SCHEMA },
        totals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              amount: { type: "number" },
              source_page: { type: "number" },
            },
            required: ["label", "amount", "source_page"],
          },
        },
      },
      required: ["document_kind", "summary", "items", "totals"],
    },
  },
};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(
    String(value ?? "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : 0;
}

async function callGateway(userContent: unknown): Promise<LvAnalyseResponse> {
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

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as {
        message?: string;
        error?: { message?: string } | string;
      };
      detail =
        body.message ?? (typeof body.error === "string" ? body.error : body.error?.message) ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    const reason = detail.trim() ? `: ${detail.trim()}` : "";
    if (res.status === 429)
      throw new Error(`KI-Limit erreicht. Bitte in einigen Minuten erneut versuchen${reason}`);
    if (res.status === 402) throw new Error(`KI-Guthaben aufgebraucht${reason}`);
    if (res.status === 401) throw new Error(`KI-Dienst ist nicht korrekt konfiguriert${reason}`);
    if (res.status === 403)
      throw new Error(`KI-Analyse ist für diesen Arbeitsbereich gesperrt${reason}`);
    throw new Error(`KI-Analyse fehlgeschlagen (${res.status})${reason}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Die KI-Antwort enthielt kein auswertbares JSON.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Die KI-Antwort konnte nicht gelesen werden: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const items = Array.isArray(parsed["items"])
    ? (parsed["items"] as Record<string, unknown>[])
    : [];
  const totals = Array.isArray(parsed["totals"])
    ? (parsed["totals"] as Record<string, unknown>[])
    : [];

  return {
    document_kind: String(parsed["document_kind"] ?? "").trim(),
    summary: String(parsed["summary"] ?? "").trim(),
    items: items
      .map((i) => ({
        item_number: String(i["item_number"] ?? "").trim(),
        description: String(i["description"] ?? "").trim(),
        category: String(i["category"] ?? "").trim(),
        quantity: num(i["quantity"]),
        unit: String(i["unit"] ?? "").trim(),
        frequency: String(i["frequency"] ?? "").trim(),
        area_m2: num(i["area_m2"]),
        working_hours: num(i["working_hours"]),
        unit_price: num(i["unit_price"]),
        total_price: num(i["total_price"]),
        vat_rate: num(i["vat_rate"]),
        source_page: num(i["source_page"]),
        confidence_score: num(i["confidence_score"]),
      }))
      .filter((i) => i.description || i.item_number),
    totals: totals
      .map((t) => ({
        label: String(t["label"] ?? "").trim(),
        amount: num(t["amount"]),
        source_page: num(t["source_page"]),
      }))
      .filter((t) => t.label && t.amount !== 0),
  };
}

function chunkText(text: string, size = 45_000): string[] {
  if (text.length <= size) return [text];
  return text.split(/(?=--- Seite \d+ ---)/).reduce<string[]>((parts, page) => {
    const last = parts.at(-1);
    if (last !== undefined && last.length + page.length <= size) {
      parts[parts.length - 1] = `${last}\n${page}`;
    } else if (page.length > size) {
      for (let offset = 0; offset < page.length; offset += size)
        parts.push(page.slice(offset, offset + size));
    } else {
      parts.push(page);
    }
    return parts;
  }, []);
}

/** Analysiert Ausschreibungstext (PDF-Textebene, CSV, Excel, GAEB). */
export const analyseLvDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { text: string }) => {
    const text = String(input?.text ?? "").slice(0, 400_000);
    if (!text.trim()) throw new Error("Die Datei enthält keinen lesbaren Text.");
    return { text };
  })
  .handler(async ({ data }): Promise<LvAnalyseResponse> => {
    const all = chunkText(data.text);
    const chunks = all.slice(0, MAX_CHUNKS);
    const warnings: string[] = [];
    if (all.length > MAX_CHUNKS) {
      warnings.push(
        `Das Dokument ist sehr umfangreich: Es wurden die ersten ${MAX_CHUNKS} von ${all.length} Textabschnitten analysiert. Bitte den Rest separat hochladen.`,
      );
    }

    const merged: LvAnalyseResponse = { document_kind: "", summary: "", items: [], totals: [] };
    let ok = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk?.trim()) continue;
      try {
        const result = await callGateway(
          `Textabschnitt ${i + 1} von ${chunks.length}. Analysiere ausschließlich diesen Abschnitt:\n\n${chunk}`,
        );
        ok += 1;
        if (!merged.document_kind && result.document_kind)
          merged.document_kind = result.document_kind;
        if (!merged.summary && result.summary) merged.summary = result.summary;
        merged.items.push(...result.items);
        merged.totals.push(...result.totals);
      } catch (error) {
        // Ein fehlgeschlagener Abschnitt darf nie das gesamte Ergebnis verwerfen.
        const reason = error instanceof Error ? error.message : String(error);
        warnings.push(`Textabschnitt ${i + 1} von ${chunks.length} konnte nicht analysiert werden: ${reason}`);
      }
    }
    if (ok === 0) {
      throw new Error(
        warnings[0] ?? "Die KI-Analyse lieferte kein Ergebnis für dieses Dokument.",
      );
    }

    // Doppelerfassung an Abschnittsgrenzen entfernen (gleiche Position in zwei Abschnitten).
    merged.items = dedupeRawItems(merged.items);
    merged.totals = dedupeRawTotals(merged.totals);
    if (warnings.length) merged.warnings = warnings;
    return merged;
  });

/** Höchstzahl der KI-Abschnitte je Analyse (Kosten- und Laufzeitgrenze). */
const MAX_CHUNKS = 12;

function dedupeRawItems(items: LvAnalyseRawItem[]): LvAnalyseRawItem[] {
  const map = new Map<string, LvAnalyseRawItem>();
  for (const item of items) {
    const key = [
      item.item_number.trim().toLowerCase(),
      item.description.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100),
      item.quantity,
      item.unit.trim().toLowerCase(),
    ].join("|");
    const existing = map.get(key);
    if (!existing || item.confidence_score > existing.confidence_score) map.set(key, item);
  }
  return [...map.values()];
}

function dedupeRawTotals(totals: LvAnalyseRawTotal[]): LvAnalyseRawTotal[] {
  const map = new Map<string, LvAnalyseRawTotal>();
  for (const total of totals) {
    const key = `${total.label.trim().toLowerCase().replace(/\s+/g, " ")}|${total.amount}`;
    if (!map.has(key)) map.set(key, total);
  }
  return [...map.values()];
}

/** OCR-Analyse gescannter PDFs – die Texterkennung übernimmt das multimodale Modell. */
export const analyseLvScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { fileName: string; mimeType: string; base64: string }) => {
    const base64 = String(input?.base64 ?? "");
    if (!base64) throw new Error("Die Datei konnte nicht gelesen werden.");
    if (base64.length > 20_000_000)
      throw new Error("Die Datei ist zu groß für die Texterkennung (max. ca. 15 MB).");
    return {
      fileName: String(input?.fileName ?? "dokument.pdf"),
      mimeType: String(input?.mimeType || "application/pdf"),
      base64,
    };
  })
  .handler(async ({ data }): Promise<LvAnalyseResponse> =>
    callGateway([
      {
        type: "text",
        text: "Gescanntes Ausschreibungsdokument. Führe eine Texterkennung (OCR) durch und analysiere es anschließend.",
      },
      {
        type: "file",
        file: { filename: data.fileName, file_data: `data:${data.mimeType};base64,${data.base64}` },
      },
    ]),
  );
