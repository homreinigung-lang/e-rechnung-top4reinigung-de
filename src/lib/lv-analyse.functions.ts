import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateGeminiJson } from "@/lib/gemini-json.server";

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
  warnings?: string[];
};

const SYSTEM = `Du bist Ausschreibungs-Analyst für ein deutsches Gebäudereinigungsunternehmen.
Analysiere ausschließlich den Inhalt des hochgeladenen Leistungsverzeichnisses, Preisblatts oder der Leistungsbeschreibung.
Bestimme document_kind als detailed_lv | pricing_form | cleaning_spec | unsupported.
Extrahiere JEDE reale Position. Keine erfundenen Positionen, Mengen, Preise oder Frequenzen.
item_number: Ordnungszahl wörtlich, sonst leer.
description: Positionstext knapp und nah am Dokument.
category: unterhaltsreinigung|glasreinigung|grundreinigung|sonderreinigung|winterdienst|verbrauchsmaterial|sonstiges.
quantity, area_m2, working_hours, unit_price, total_price, vat_rate: nur aus dem Dokument, sonst 0.
unit und frequency: wörtlich bzw. leer.
source_page: erkannte Seite, sonst 0.
confidence_score: 0 bis 1.
totals enthält nur ausdrücklich vorhandene Summenzeilen.
Wichtig: Dokumentpreise sind Ausschreibungsdaten und niemals automatisch unsere eigenen Preise.
Antworte ausschließlich als JSON gemäß Schema.`;

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

const RESPONSE_SCHEMA = {
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
};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalize(parsed: Record<string, unknown>): LvAnalyseResponse {
  const items = Array.isArray(parsed["items"]) ? (parsed["items"] as Record<string, unknown>[]) : [];
  const totals = Array.isArray(parsed["totals"]) ? (parsed["totals"] as Record<string, unknown>[]) : [];
  return {
    document_kind: String(parsed["document_kind"] ?? "unsupported").trim() || "unsupported",
    summary: String(parsed["summary"] ?? "").trim(),
    items: items
      .map((i) => ({
        item_number: String(i["item_number"] ?? "").trim(),
        description: String(i["description"] ?? "").trim(),
        category: String(i["category"] ?? "sonstiges").trim() || "sonstiges",
        quantity: num(i["quantity"]),
        unit: String(i["unit"] ?? "").trim(),
        frequency: String(i["frequency"] ?? "").trim(),
        area_m2: num(i["area_m2"]),
        working_hours: num(i["working_hours"]),
        unit_price: num(i["unit_price"]),
        total_price: num(i["total_price"]),
        vat_rate: num(i["vat_rate"]),
        source_page: num(i["source_page"]),
        confidence_score: Math.max(0, Math.min(1, num(i["confidence_score"]))),
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

async function analyseWithGemini(prompt: string, dataUrl?: string, mimeType?: string): Promise<LvAnalyseResponse> {
  const parsed = await generateGeminiJson({
    model: process.env["GEMINI_MODEL_LV"] || "gemini-3.6-flash",
    system: SYSTEM,
    prompt,
    schema: RESPONSE_SCHEMA,
    ...(dataUrl ? { dataUrl } : {}),
    ...(mimeType ? { mimeType } : {}),
  });
  return normalize(parsed);
}

function chunkText(text: string, size = 45_000): string[] {
  if (text.length <= size) return [text];
  return text.split(/(?=--- Seite \d+ ---)/).reduce<string[]>((parts, page) => {
    const last = parts.at(-1);
    if (last !== undefined && last.length + page.length <= size) {
      parts[parts.length - 1] = `${last}\n${page}`;
    } else if (page.length > size) {
      for (let offset = 0; offset < page.length; offset += size) parts.push(page.slice(offset, offset + size));
    } else {
      parts.push(page);
    }
    return parts;
  }, []);
}

const MAX_CHUNKS = 12;

function dedupeRawItems(items: LvAnalyseRawItem[]): LvAnalyseRawItem[] {
  const map = new Map<string, LvAnalyseRawItem>();
  for (const item of items) {
    const key = [
      item.item_number.trim().toLowerCase(),
      item.description.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120),
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
      warnings.push(`Das Dokument ist sehr umfangreich: Es wurden die ersten ${MAX_CHUNKS} von ${all.length} Textabschnitten analysiert.`);
    }
    const merged: LvAnalyseResponse = { document_kind: "", summary: "", items: [], totals: [] };
    let ok = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk?.trim()) continue;
      try {
        const result = await analyseWithGemini(
          `Textabschnitt ${i + 1} von ${chunks.length}. Analysiere ausschließlich diesen Abschnitt:\n\n${chunk}`,
        );
        ok += 1;
        if (!merged.document_kind && result.document_kind) merged.document_kind = result.document_kind;
        if (!merged.summary && result.summary) merged.summary = result.summary;
        merged.items.push(...result.items);
        merged.totals.push(...result.totals);
      } catch (error) {
        warnings.push(`Textabschnitt ${i + 1} konnte nicht analysiert werden: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (ok === 0) throw new Error(warnings[0] ?? "Die KI-Analyse lieferte kein Ergebnis.");
    merged.items = dedupeRawItems(merged.items);
    merged.totals = dedupeRawTotals(merged.totals);
    if (warnings.length) merged.warnings = warnings;
    return merged;
  });

export const analyseLvScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { fileName: string; mimeType: string; base64: string }) => {
    const base64 = String(input?.base64 ?? "");
    if (!base64) throw new Error("Die Datei konnte nicht gelesen werden.");
    if (base64.length > 20_000_000) throw new Error("Die Datei ist zu groß für die Texterkennung (max. ca. 15 MB).");
    return {
      fileName: String(input?.fileName ?? "dokument.pdf"),
      mimeType: String(input?.mimeType || "application/pdf"),
      base64,
    };
  })
  .handler(async ({ data }): Promise<LvAnalyseResponse> =>
    analyseWithGemini(
      `Gescanntes Ausschreibungsdokument „${data.fileName}“. Führe Texterkennung durch und analysiere ausschließlich den Dokumentinhalt.`,
      `data:${data.mimeType};base64,${data.base64}`,
      data.mimeType,
    ),
  );
