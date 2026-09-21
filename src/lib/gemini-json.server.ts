import "@tanstack/react-start/server-only";

type JsonSchema = Record<string, unknown>;

type GeminiJsonOptions = {
  model: string;
  system: string;
  prompt: string;
  schema: JsonSchema;
  dataUrl?: string;
  mimeType?: string;
  validate?: (value: Record<string, unknown>) => boolean;
  timeoutMs?: number;
};

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("Ungültiges Dateiformat für die KI-Analyse.");
  return { mimeType: match[1]!, data: match[2]! };
}

function extractText(payload: unknown): string {
  const json = payload as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  const candidate = json?.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") return "";
  return (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

function googleErrorMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message?.trim() || raw.trim();
  } catch {
    return raw.trim();
  }
}

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const FALLBACK_MODEL = "gemini-3.1-flash-lite";
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A successful HTTP response can still contain empty, truncated or unusable model output. */
function parseModelJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.keys(parsed).length)
    return null;
  return parsed as Record<string, unknown>;
}

export async function generateGeminiJson({
  model,
  system,
  prompt,
  schema,
  dataUrl,
  mimeType,
  validate,
  timeoutMs = 60_000,
}: GeminiJsonOptions): Promise<Record<string, unknown>> {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");
  const headers = { "Content-Type": "application/json", "x-goog-api-key": apiKey };

  const parts: Array<Record<string, unknown>> = [
    { text: `${prompt}\nAntwortformat (JSON Schema): ${JSON.stringify(schema)}` },
  ];
  if (dataUrl) {
    const decoded = parseDataUrl(dataUrl);
    parts.push({ inlineData: { mimeType: mimeType || decoded.mimeType, data: decoded.data } });
  }

  async function request(modelName: string, withSchema: boolean): Promise<Response> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
    return fetch(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          ...(withSchema ? { responseJsonSchema: schema } : {}),
        },
      }),
    });
  }

  const models = model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL];
  let lastStatus = 503;
  let invalidOutput = false;
  for (const [modelIndex, modelName] of models.entries()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await request(modelName, true);
        if (response.status === 400) {
          // Some models reject a structured response schema but support JSON mode.
          const detail = (await response.clone().text()).slice(0, 1000);
          if (/response[_ ]?json[_ ]?schema|response[_ ]?schema/i.test(detail)) {
            // Preserve the field names even when a model rejects schema enforcement.
            console.warn(`Gemini schema rejected for ${modelName}; retrying JSON mode`);
            response = await request(modelName, false);
          }
        }
      } catch (error) {
        console.warn(
          `Gemini network request failed for ${modelName}, attempt ${attempt + 1}`,
          error,
        );
        if (attempt === 0) {
          await sleep(1200);
          continue;
        }
        if (modelIndex < models.length - 1) break;
        throw new Error("KI-Dienst ist momentan nicht erreichbar. Bitte später erneut versuchen.");
      }

      if (response.ok) {
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = parseModelJson(extractText(await response.json()));
        } catch (error) {
          console.warn(
            `Gemini response could not be decoded for ${modelName}, attempt ${attempt + 1}`,
            error,
          );
        }
        if (parsed && (!validate || validate(parsed))) return parsed;
        invalidOutput = true;
        console.warn(`Gemini returned unusable JSON for ${modelName}, attempt ${attempt + 1}`);
        if (attempt === 0) await sleep(1200);
        continue;
      }

      lastStatus = response.status;
      const raw = (await response.text()).slice(0, 1000);
      const detail = googleErrorMessage(raw);
      console.warn(
        `Gemini request failed for ${modelName} [${lastStatus}]: ${detail.slice(0, 240)}`,
      );
      if (lastStatus === 401 || lastStatus === 403) {
        throw new Error("KI-Zugang ist nicht korrekt konfiguriert.");
      }
      if (lastStatus === 429) {
        throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
      }
      // A missing/retired model should switch immediately to the fallback.
      if (lastStatus === 404 && modelIndex < models.length - 1) break;
      if (!RETRYABLE_STATUSES.has(lastStatus)) {
        throw new Error(`KI-Analyse fehlgeschlagen (${lastStatus}): ${detail.slice(0, 240)}`);
      }
      if (attempt === 0) await sleep(1200);
    }
  }
  if (invalidOutput) {
    throw new Error(
      "Keine verlässlichen Belegdaten erkannt. Der Anhang bleibt erhalten. Bitte erneut auslesen oder die Beträge manuell ergänzen; erneutes Hochladen ist nicht nötig.",
    );
  }
  throw new Error(
    `KI-Analyse vorübergehend nicht verfügbar (${lastStatus}). Auch das Ersatzmodell konnte die Rechnung nicht lesen. Bitte später erneut versuchen.`,
  );
}
