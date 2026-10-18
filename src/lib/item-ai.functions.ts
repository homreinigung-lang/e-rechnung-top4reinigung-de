import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { RecurrenceUnit } from "./constants";

const recurrenceSchema = z.object({
  value: z.number().finite().positive(),
  unit: z.enum(["week", "fortnight", "month", "quarter", "year"]),
});

export const suggestItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string }) => {
    const prompt = String(input?.prompt ?? "").trim();
    if (prompt.length < 5) throw new Error("Bitte die Leistung kurz beschreiben.");
    return { prompt: prompt.slice(0, 4000) };
  })
  .handler(async ({ data, context }) => {
    const { consumeCompanyAiQuota } = await import("./company-ai-access.server");
    await consumeCompanyAiQuota(context.supabase, context.userId);
    const { generateItems } = await import("@/lib/item-ai.server");
    return { items: await generateItems(data.prompt) };
  });

export const analyzeCalculation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { prompt: string; recurrence?: { value: number; unit: RecurrenceUnit } }) => {
      const prompt = String(input?.prompt ?? "").trim();
      if (prompt.length < 5) throw new Error("Bitte die Leistung kurz beschreiben.");
      return {
        prompt: prompt.slice(0, 4000),
        recurrence:
          input.recurrence === undefined ? undefined : recurrenceSchema.parse(input.recurrence),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { consumeCompanyAiQuota } = await import("./company-ai-access.server");
    await consumeCompanyAiQuota(context.supabase, context.userId);
    const { generateCalculation } = await import("@/lib/item-ai.server");
    return await generateCalculation(data.prompt, data.recurrence);
  });
