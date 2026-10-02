import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Versand ist ausschließlich angemeldeten Firmenkonten vorbehalten. */
export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        to: z.string().email(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
        html: z.string().max(100000).optional(),
        filename: z.string().min(1).max(200),
        pdfBase64: z
          .string()
          .min(1)
          .max(20_000_000)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/),
        requestId: z.string().uuid().optional(),
        companyName: z.string().max(120).optional(),
        companyEmail: z.string().email().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.pdfBase64.startsWith("JVBERi0")) throw new Error("Ungültige PDF-Datei.");

    // The mail endpoint is not a generic authenticated relay: every send must
    // correspond to a document owned by the authenticated tenant.
    const { data: document, error: documentError } = await context.supabase
      .from("documents")
      .select("id")
      .eq("id", data.documentId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (documentError || !document) throw new Error("Dokument nicht gefunden.");

    const { data: settings } = await context.supabase
      .from("company_settings")
      .select("company_name,email")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Per-account outbound budget prevents a compromised account from turning
    // the application into a bulk-mail relay.
    const { allowPublicMail } = await import("./mail-throttle.server");
    const allowed = await allowPublicMail({
      email: `outbound:${context.userId}`,
      limitPerEmail: 40,
      windowEmailMinutes: 60,
      limitPerIp: 80,
      windowIpMinutes: 60,
    });
    if (!allowed) throw new Error("Zu viele E-Mails in kurzer Zeit. Bitte später erneut versuchen.");

    const { sendVerifiedEmail } = await import("./resend-email.server");
    const result = await sendVerifiedEmail({
      to: data.to,
      subject: data.subject,
      text: data.body,
      ...(data.html ? { html: data.html } : {}),
      ...(settings?.company_name ? { companyName: settings.company_name } : {}),
      ...(settings?.email ? { companyEmail: settings.email } : {}),
      attachments: [{ filename: data.filename, content: data.pdfBase64 }],
      ...(data.requestId ? { idempotencyKey: `document/${context.userId}/${data.requestId}` } : {}),
    });
    return { id: result.id, cc: result.cc };
  });
