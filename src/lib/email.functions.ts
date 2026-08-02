import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  filename: z.string().min(1).max(200),
  pdfBase64: z.string().min(1),
});

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const COMPANY_COPY = "info@top4reinigung.de";

export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const resendKey = process.env["RESEND_API_KEY"];
    if (!lovableKey || !resendKey) throw new Error("E-Mail-Versand ist nicht konfiguriert.");

    // Resend test sender until top4reinigung.de is verified; replies/CC go to the company address.
    const fromAddress = process.env["MAIL_FROM"] ?? "Hom Reinigung Service <onboarding@resend.dev>";

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [data.to],
        cc: [COMPANY_COPY],
        reply_to: COMPANY_COPY,
        subject: data.subject,
        text: data.body,
        attachments: [{ filename: data.filename, content: data.pdfBase64 }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Resend request failed [${response.status}]: ${errorBody}`);
      throw new Error(`E-Mail konnte nicht gesendet werden [${response.status}]: ${errorBody}`);
    }

    const result = (await response.json()) as { id?: string };
    return { id: result.id ?? null, cc: COMPANY_COPY };
  });
