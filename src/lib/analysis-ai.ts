/** The lightweight model was verified against both our PDF and LV JSON schemas. */
export function analysisAiOptions(configuredModel?: string) {
  return {
    model: configuredModel?.trim() || "gemini-3.5-flash-lite",
    fallbackOnQuota: true,
    fallbackModels: ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-flash-lite"],
    timeoutMs: 25_000,
    totalTimeoutMs: 45_000,
    attemptsPerModel: 1 as const,
  };
}
