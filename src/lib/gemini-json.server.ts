type JsonSchema = Record<string, unknown>;

type GeminiJsonOptions = {
  model: string;
  system: string;
  prompt: string;
  schema: JsonSchema;
  dataUrl?: string;
  mimeType?: string;
};

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("Ungültiges Dateiformat für die KI-Analyse.");
  return { mimeType: match[1]!, data: match[2]! };
}

function extractText(payload: unknown): string {
  const json = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (json.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("").trim();
}

function googleErrorMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message?.trim() || raw.trim();
  } catch {
    return raw.trim();
  }
}

export async function generateGeminiJson({
  model,
  system,
  prompt,
  schema,
  dataUrl,
  mimeType,
}: GeminiJsonOptions): Promise<Record<string, unknown>> {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");
  const apiKeyValue: string = apiKey;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (dataUrl) {
    const decoded = parseDataUrl(dataUrl);
    parts.push({ inlineData: { mimeType: mimeType || decoded.mimeType, data: decoded.data } });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  async function request(withSchema: boolean) {
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKeyValue },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          ...(withSchema ? { responseSchema: schema } : {}),
        },
      }),
    });
  }

  let response = await request(true);

  // Einige Gemini-Endpunkte/Schema-Kombinationen lehnen ein gültiges, aber nicht
  // unterstütztes responseSchema mit HTTP 400 ab. In diesem Fall fällt der
  // zentrale Helfer einmal auf JSON-Modus ohne Schema zurück. Die Fachlogik
  // bleibt unverändert und der Aufrufer erhält weiterhin valides JSON.
  if (response.status === 400) {
    const firstDetail = (await response.text()).slice(0, 1000);
    console.warn(`Gemini schema request rejected [400], retrying JSON mode: ${firstDetail}`);
    response = await request(false);
  }

  if (response.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (response.status === 401 || response.status === 403)
    throw new Error("KI-Zugang ist nicht korrekt konfiguriert.");
  if (!response.ok) {
    const raw = (await response.text()).slice(0, 1000);
    const detail = googleErrorMessage(raw);
    console.error(`Gemini request failed [${response.status}]: ${raw}`);
    throw new Error(
      detail
        ? `KI-Analyse fehlgeschlagen (${response.status}): ${detail.slice(0, 240)}`
        : `KI-Analyse fehlgeschlagen (${response.status}).`,
    );
  }

  const raw = extractText(await response.json());
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
