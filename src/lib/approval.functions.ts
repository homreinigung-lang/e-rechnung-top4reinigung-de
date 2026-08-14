import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const requestSchema = z.object({
  authUserId: z.string().uuid(),
  fullName: z.string().max(200).optional(),
});

/**
 * Legt nach einer Registrierung einen Freigabe-Antrag an und informiert den
 * Inhaber per E-Mail mit Freigabe- und Ablehnungs-Link.
 * Mitarbeitende, deren E-Mail bereits hinterlegt ist, werden direkt freigegeben.
 */
export const requestAccountApproval = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mail = await import("./approval-mail.server");

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(data.authUserId);
    if (userError || !userData.user) throw new Error("Benutzer nicht gefunden.");
    const user = userData.user;
    const email = (user.email ?? "").toLowerCase();

    const existing = await supabaseAdmin
      .from("account_approvals")
      .select("status")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (existing.data) return { status: existing.data.status as string };

    // Bereits angelegte Mitarbeitende brauchen keine erneute Freigabe.
    const employee = await supabaseAdmin
      .from("employees")
      .select("id")
      .ilike("email", email)
      .limit(1);
    const autoApprove = (employee.data ?? []).length > 0;

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const fullName =
      (data.fullName ?? "").trim() ||
      ((user.user_metadata?.["full_name"] as string | undefined) ?? "");

    const { error } = await supabaseAdmin.from("account_approvals").insert({
      auth_user_id: user.id,
      email,
      full_name: fullName,
      token,
      status: autoApprove ? "approved" : "pending",
      decided_at: autoApprove ? new Date().toISOString() : null,
    });
    if (error) throw new Error(error.message);

    if (autoApprove) return { status: "approved" };

    const base = mail.siteUrl();
    const createdAt = new Date(user.created_at ?? Date.now()).toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
    });
    const body = mail.ownerRequestMail({
      name: fullName,
      email,
      createdAt,
      approveUrl: `${base}/api/public/konto-freigabe?token=${token}&aktion=freigeben`,
      rejectUrl: `${base}/api/public/konto-freigabe?token=${token}&aktion=ablehnen`,
    });

    try {
      await mail.sendMail({
        to: mail.OWNER_EMAIL,
        subject: `Neue Registrierung: ${email}`,
        text: body.text,
        html: body.html,
      });
    } catch (e) {
      console.error("Freigabe-E-Mail fehlgeschlagen:", e);
    }

    return { status: "pending" };
  });

/** Liefert den Freigabestatus des aktuell angemeldeten Kontos. */
export const getApprovalStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ authUserId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("account_approvals")
      .select("status")
      .eq("auth_user_id", data.authUserId)
      .maybeSingle();
    return { status: (row?.status as string | undefined) ?? "none" };
  });
