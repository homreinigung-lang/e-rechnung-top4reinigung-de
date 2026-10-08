import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assistantInput, type AssistantAnswer } from "@/lib/assistant";
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(assistantInput)
  .handler(async ({ data, context }): Promise<AssistantAnswer> => {
    const { answerAssistant } = await import("@/lib/assistant.server");
    return answerAssistant(context.supabase, context.userId, data);
  });
export const assistantAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assistantEmployee } = await import("@/lib/assistant.server");
    const me = await assistantEmployee(context.supabase, context.userId);
    return { ready: Boolean(process.env["GEMINI_API_KEY"]?.trim()), worker: Boolean(me) };
  });
