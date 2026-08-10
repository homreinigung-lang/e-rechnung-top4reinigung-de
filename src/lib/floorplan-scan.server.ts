export type ScannedFloorplan = {
  sqm: number;
  rooms: number;
  floors: number;
  note: string;
};

const EMPTY: ScannedFloorplan = { sqm: 0, rooms: 0, floors: 0, note: "" };

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

const SYSTEM = `Du bist ein Kalkulations-Assistent für ein deutsches Reinigungsunternehmen.
Analysiere den hochgeladenen Grundriss bzw. das Foto eines Objekts.
Ermittle die zu reinigende Gesamtfläche in Quadratmetern (Summe aller Raumflächen bzw. Angabe im Plan),
die Anzahl der Räume und die Anzahl der Etagen/Stockwerke.
Wenn Werte nicht direkt angegeben sind, schätze sie realistisch anhand der Maßketten, Raumbeschriftungen oder Proportionen.
Runde die Fläche auf ganze Quadratmeter. Wenn keine Etage erkennbar ist, nimm 1.
Schreibe in "note" eine kurze deutsche Zusammenfassung (Raumtypen, Bodenbeläge, Sanitärräume, Besonderheiten, Hinweis wenn geschätzt).
Antworte ausschließlich mit reinem JSON ohne Erklärung.`;

/** Analysiert Grundrisse (PDF/Bild) mit dem KI-Gateway und liefert m², Räume, Etagen. */
export async function extractFloorplan(
  dataUrl: string,
  mimeType: string,
): Promise<ScannedFloorplan> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");

  const content =
    mimeType === "application/pdf"
      ? [
          { type: "text", text: "Analysiere diesen Grundriss (PDF) für die Reinigungskalkulation." },
          { type: "file", file: { filename: "grundriss.pdf", file_data: dataUrl } },
        ]
      : [
          { type: "text", text: "Analysiere diesen Grundriss / dieses Foto für die Reinigungskalkulation." },
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
          name: "grundriss",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              sqm: { type: "number" },
              rooms: { type: "number" },
              floors: { type: "number" },
              note: { type: "string" },
            },
            required: ["sqm", "rooms", "floors", "note"],
          },
        },
      },
    }),
  });

  if (res.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`Grundriss konnte nicht analysiert werden (${res.status}).`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return EMPTY;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return EMPTY;
  }

  const sqm = Math.max(0, Math.round(num(parsed["sqm"])));
  const rooms = Math.max(0, Math.round(num(parsed["rooms"])));
  const floors = Math.max(0, Math.round(num(parsed["floors"])));

  return {
    sqm,
    rooms,
    floors: floors || 1,
    note: String(parsed["note"] ?? "").trim(),
  };
}
