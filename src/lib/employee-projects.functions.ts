import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getEmployeeProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { employeeProjects } = await import("./employee-projects.server");
    return employeeProjects(context.supabase, supabaseAdmin, context.userId);
  });
