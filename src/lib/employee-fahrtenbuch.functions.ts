import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getEmployeeFahrtenbuchOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { employeeFahrtenbuchOptions } = await import("./employee-fahrtenbuch.server");
    return employeeFahrtenbuchOptions(context.supabase, supabaseAdmin, context.userId);
  });
