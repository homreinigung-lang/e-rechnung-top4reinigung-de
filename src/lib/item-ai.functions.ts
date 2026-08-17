import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const suggestItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string }) => {
    const prompt = String(input?.prompt ?? "").trim();
    if (prompt.length < 5) throw new Error("Bitte die Leistung kurz beschreiben.");
    return { prompt: prompt.slice(0, 4000) };
  })
  .handler(async ({ data }) => {
    const { generateItems } = await import("@/lib/item-ai.server");
    return { items: await generateItems(data.prompt) };
  });

export const analyzeCalculation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string }) => {
    const prompt = String(input?.prompt ?? "").trim();
    if (prompt.length < 5) throw new Error("Bitte die Leistung kurz beschreiben.");
    return { prompt: prompt.slice(0, 4000) };
  })
  .handler(async ({ data }) => {
    const { generateCalculation } = await import("@/lib/item-ai.server");
    return await generateCalculation(data.prompt);
  });

