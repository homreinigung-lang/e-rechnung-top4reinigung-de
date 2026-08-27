import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Versand ist ausschließlich angemeldeten Firmenkonten vorbehalten. */
export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        to: z.string().email(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
        html: z.string().max(100000).optional(),
        filename: z.string().min(1).max(200),
        pdfBase64: z.string().min(1),
        companyName: z.string().max(120).optional(),
        companyEmail: z.string().email().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { sendVerifiedEmail } = await import("./resend-email.server");
    const result = await sendVerifiedEmail({
      to: data.to,
      subject: data.subject,
      text: data.body,
      ...(data.html ? { html: data.html } : {}),
      ...(data.companyName ? { companyName: data.companyName } : {}),
      ...(data.companyEmail ? { companyEmail: data.companyEmail } : {}),
      attachments: [{ filename: data.filename, content: data.pdfBase64 }],
    });
    return { id: result.id, cc: result.cc };
  });
