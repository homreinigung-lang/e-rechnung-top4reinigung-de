import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  html: z.string().max(100000).optional(),
  filename: z.string().min(1).max(200),
  pdfBase64: z.string().min(1),
  /** Absendername und Kopie-Adresse der angemeldeten Firma (keine feste Adresse). */
  companyName: z.string().max(120).optional(),
  companyEmail: z.string().email().optional(),
});

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const resendKey = process.env["RESEND_API_KEY"];
    if (!lovableKey || !resendKey) throw new Error("E-Mail-Versand ist nicht konfiguriert.");

    const fromAddress =
      process.env["RESEND_FROM"] || "Hom Reinigung Service <info@top4reinigung.de>";

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
        ...(data.html ? { html: data.html } : {}),
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
