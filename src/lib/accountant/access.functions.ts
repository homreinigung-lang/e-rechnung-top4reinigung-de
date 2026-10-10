import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCode, expiryFrom, randomCode } from "./shared";

export const createAccountantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email?: string; password?: string; validDays?: number }) => ({
    email: (data.email ?? "").trim(),
    password: (data.password ?? "").trim(),
    validDays: Number(data.validDays ?? 0),
  }))
  .handler(async ({ data, context }) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    const accessCode = data.password ? normalizeCode(data.password) : randomCode();

    if (data.password && accessCode.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }

    const { hashAccessCode } = await import("@/lib/accountant-access.server");

    const { data: created, error } = await context.supabase
      .from("accountant_access")
      .insert({
        user_id: context.userId,
        email: data.email,
        token,
        // Klartext wird nicht gespeichert – nur die Prüfsumme.
        access_code: "",
        access_code_hash: await hashAccessCode(token, accessCode),
        expires_at: expiryFrom(data.validDays),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { id: created.id as string, token, accessCode };
  });

export const setAccountantPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; password: string; validDays?: number }) => ({
    id: data.id,
    password: normalizeCode(data.password ?? ""),
    validDays: Number(data.validDays ?? 0),
  }))
  .handler(async ({ data, context }) => {
    if (data.password.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }
    const { data: access, error: loadError } = await context.supabase
      .from("accountant_access")
      .select("id, token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!access) throw new Error("Zugang nicht gefunden.");

    const { hashAccessCode } = await import("@/lib/accountant-access.server");

    const { error } = await context.supabase
      .from("accountant_access")
      .update({
        access_code: "",
        access_code_hash: await hashAccessCode(access.token as string, data.password),
        expires_at: expiryFrom(data.validDays),
        active: true,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, accessCode: data.password };
  });
