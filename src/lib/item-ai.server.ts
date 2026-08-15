export type GeneratedItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

const SYSTEM = `Du bist Kalkulations-Assistent einer deutschen Gebäudereinigungsfirma.
Aus der Beschreibung des Auftrags erstellst du eine realistische Leistungsaufstellung (Positionen) für ein Angebot.
Regeln:
- Alle Texte auf Deutsch, fachlich und knapp (max. 140 Zeichen pro Position).
- Marktübliche Nettopreise in EUR für das Saarland/Deutschland.
- Stundensätze: Unterhalts-/Büro-/Glas-/Treppenhausreinigung 34–37 EUR/Std., Grund- und Bauendreinigung 42–45 EUR/Std.
- Einheiten nur: Std., m², Stk., Pauschal, Monat.
- 3 bis 10 Positionen, keine Umsatzsteuer, keine Summenzeile.
Antworte ausschließlich mit reinem JSON.`;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export async function generateItems(prompt: string): Promise<GeneratedItem[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "positionen",
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
                    description: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string" },
                    unit_price: { type: "number" },
                  },
                  required: ["description", "quantity", "unit", "unit_price"],
                },
              },
            },
            required: ["items"],
          },
        },
      },
    }),
  });

  if (res.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`Vorschlag fehlgeschlagen (${res.status}).`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];

  let parsed: { items?: unknown } = {};
  try {
    parsed = JSON.parse(match[0]) as { items?: unknown };
  } catch {
    return [];
  }
  const list = Array.isArray(parsed.items) ? parsed.items : [];
  return list.slice(0, 12).map((entry) => {
    const it = (entry ?? {}) as Record<string, unknown>;
    return {
      description: String(it["description"] ?? "").slice(0, 200),
      quantity: num(it["quantity"]) || 1,
      unit: String(it["unit"] ?? "Std.").slice(0, 20) || "Std.",
      unit_price: num(it["unit_price"]),
    };
  });
}
