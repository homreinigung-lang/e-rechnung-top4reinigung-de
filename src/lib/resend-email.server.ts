type Attachment = {
  filename: string;
  content: string;
};

type SendVerifiedEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  companyName?: string;
  companyEmail?: string;
  attachments?: Attachment[];
};

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendVerifiedEmail(options: SendVerifiedEmailOptions) {
  const resendKey = process.env["RESEND_API_KEY"];
  if (!resendKey) throw new Error("E-Mail-Versand ist nicht konfiguriert.");

  const baseFrom = process.env["RESEND_FROM"] || "GebCalc <info@top4reinigung.de>";
  const baseAddress = baseFrom.match(/<([^>]+)>/)?.[1] ?? baseFrom;
  const senderName = (options.companyName ?? "").replace(/[<>\"]/g, "").trim();
  const fromAddress = senderName ? `${senderName} <${baseAddress}>` : baseFrom;
  const copyTo = options.companyEmail?.trim() || null;

  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [options.to],
        ...(copyTo ? { cc: [copyTo], reply_to: copyTo } : {}),
        subject: options.subject,
        text: options.text,
        ...(options.html ? { html: options.html } : {}),
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Netzwerkfehler";
    console.error(`Resend request failed before response: ${detail}`);
    throw new Error(`E-Mail konnte nicht gesendet werden: ${detail}`);
  }

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string; name?: string };
      detail = parsed.message || parsed.error || parsed.name || body;
    } catch {
      // Textantwort des Anbieters unverändert als Fehlerdetail verwenden.
    }
    console.error(`Resend request failed [${response.status}]: ${body}`);
    throw new Error(`E-Mail konnte nicht gesendet werden [${response.status}]: ${detail}`);
  }

  const result = (await response.json()) as { id?: string; error?: { message?: string } | string };
  if (result.error) {
    const detail = typeof result.error === "string" ? result.error : result.error.message;
    throw new Error(
      `E-Mail konnte nicht gesendet werden: ${detail || "Unbekannter Anbieterfehler"}`,
    );
  }
  if (!result.id) {
    console.error("Resend accepted the request without returning a message id.");
    throw new Error("E-Mail konnte nicht gesendet werden: Keine Versandbestätigung erhalten.");
  }

  console.info(`Resend accepted email ${result.id} for ${options.to}.`);
  return { id: result.id, cc: copyTo, from: fromAddress };
}
import "@tanstack/react-start/server-only";
