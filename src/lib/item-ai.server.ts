import { generateGeminiJson } from "./gemini-json.server";

export type GeneratedItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

export type GeneratedCalculation = {
  cleaning_type: string;
  mode: "area" | "hours";
  area_sqm: number;
  hours: number;
  hourly_rate: number;
  price_per_sqm: number;
  frequency: number;
  frequency_unit: "week" | "month";
  floors: number;
  stairs: boolean;
  travel: number;
  note: string;
  items: GeneratedItem[];
};

const SYSTEM = `Du bist Kalkulations-Assistent einer deutschen Gebäudereinigungsfirma im Saarland.
Erstelle aus der Auftragsbeschreibung eine fachlich plausible, deterministische Kalkulation.
Regeln:
- Alle Texte auf Deutsch, knapp und professionell.
- Stundensätze netto: Unterhalts-/Büro-/Treppenhausreinigung 34–37 EUR/Std.; Grund- und Bauendreinigung 42–45 EUR/Std.; Glas/Fenster 38 EUR/Std.
- Keine erfundenen Kundendaten, Flächen oder Mengen. Unbekannte Zahlen = 0.
- Realistische Leistungswerte als Orientierung: Büro 200–250 m²/Std., Flur 300 m²/Std., Sanitär/WC 60 m²/Std., Teeküche 100 m²/Std., Treppenhaus 120 m²/Std.
- Wiederkehrende Leistungen auf Monatsbasis: wöchentlich = 4,33 Einsätze/Monat, 14-täglich = 2, monatlich = 1.
- Keine Doppelerfassung von Sanitär, Küche oder Flur, wenn bereits in einer Gesamtfläche enthalten.
- Treppenhaus bei Erwähnung als eigene Position; mindestens 12,50 EUR je Etage.
- Keine Umsatzsteuer und keine Summenzeile in items.
- Preise und Mengen auf 2 Nachkommastellen runden.`;

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string" },
    unit_price: { type: "number" },
  },
  required: ["description", "quantity", "unit", "unit_price"],
};

const ITEMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { items: { type: "array", items: ITEM_SCHEMA } },
  required: ["items"],
};

const CALC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cleaning_type: { type: "string" },
    mode: { type: "string" },
    area_sqm: { type: "number" },
    hours: { type: "number" },
    hourly_rate: { type: "number" },
    price_per_sqm: { type: "number" },
    frequency: { type: "number" },
    frequency_unit: { type: "string" },
    floors: { type: "number" },
    stairs: { type: "boolean" },
    travel: { type: "number" },
    note: { type: "string" },
    items: { type: "array", items: ITEM_SCHEMA },
  },
  required: [
    "cleaning_type",
    "mode",
    "area_sqm",
    "hours",
    "hourly_rate",
    "price_per_sqm",
    "frequency",
    "frequency_unit",
    "floors",
    "stairs",
    "travel",
    "note",
    "items",
  ],
};

function canonicalPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function normalizeItems(value: unknown): GeneratedItem[] {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 12).map((entry) => {
    const it = (entry ?? {}) as Record<string, unknown>;
    return {
      description: String(it["description"] ?? "").trim().slice(0, 200),
      quantity: num(it["quantity"]) || 1,
      unit: String(it["unit"] ?? "Std.").trim().slice(0, 20) || "Std.",
      unit_price: num(it["unit_price"]),
    };
  }).filter((item) => item.description);
}

export async function generateItems(prompt: string): Promise<GeneratedItem[]> {
  const parsed = await generateGeminiJson({
    model: process.env["GEMINI_MODEL_CALC"] || "gemini-3.6-flash",
    system: `${SYSTEM}\nAntworte ausschließlich mit JSON gemäß Schema.`,
    prompt: `Erstelle 3 bis 10 sinnvolle Angebotspositionen für: ${canonicalPrompt(prompt)}`,
    schema: ITEMS_SCHEMA,
  });
  return normalizeItems(parsed["items"]);
}

export async function generateCalculation(prompt: string): Promise<GeneratedCalculation> {
  const parsed = await generateGeminiJson({
    model: process.env["GEMINI_MODEL_CALC"] || "gemini-3.6-flash",
    system: `${SYSTEM}\nAntworte ausschließlich mit JSON gemäß Schema.`,
    prompt: `Analysiere diese Reinigungsanfrage für die Kalkulation: ${canonicalPrompt(prompt)}\ncleaning_type: unterhalt|grund|bau|glas|treppenhaus|buero. mode: area|hours. frequency_unit: week|month. Unbekannte Werte mit 0 bzw. leerem Text ausgeben.`,
    schema: CALC_SCHEMA,
  });

  const types = ["unterhalt", "grund", "bau", "glas", "treppenhaus", "buero"];
  const cleaningType = String(parsed["cleaning_type"] ?? "");
  return {
    cleaning_type: types.includes(cleaningType) ? cleaningType : "unterhalt",
    mode: parsed["mode"] === "hours" ? "hours" : "area",
    area_sqm: num(parsed["area_sqm"]),
    hours: num(parsed["hours"]),
    hourly_rate: num(parsed["hourly_rate"]),
    price_per_sqm: num(parsed["price_per_sqm"]),
    frequency: num(parsed["frequency"]),
    frequency_unit: parsed["frequency_unit"] === "week" ? "week" : "month",
    floors: num(parsed["floors"]),
    stairs: Boolean(parsed["stairs"]),
    travel: num(parsed["travel"]),
    note: String(parsed["note"] ?? "").trim().slice(0, 500),
    items: normalizeItems(parsed["items"]),
  };
}
