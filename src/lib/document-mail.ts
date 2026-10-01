import { buildSignatureHtml } from "@/lib/signature";
import { DOC_TYPE_LABEL, formatDate } from "@/lib/format";

type MailSettings = Record<string, string | number | null> | null;

type BuildDocumentMailArgs = {
  documentType: string;
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  customerEmail: string;
  settings: MailSettings;
};

export function buildDocumentMail({
  documentType,
  documentNumber,
  issueDate,
  dueDate,
  customerEmail,
  settings,
}: BuildDocumentMailArgs) {
  const isInvoice = documentType === "invoice";
  const isOrder = documentType === "order";
  const label = DOC_TYPE_LABEL[documentType as keyof typeof DOC_TYPE_LABEL];
  const subject = `${label} ${documentNumber} – ${settings?.["company_name"] ?? ""}`;
  const baseLines = [
    "Sehr geehrte Damen und Herren,",
    "",
    `im Anhang finden Sie ${isInvoice ? "unsere Rechnung" : isOrder ? "unsere Auftragsbestätigung" : "unser Angebot"} ${documentNumber} vom ${formatDate(issueDate)} als PDF-Dokument.`,
    isInvoice && dueDate
      ? `Wir bitten um Begleichung des Rechnungsbetrags bis zum ${formatDate(dueDate)} ohne Abzug.`
      : "",
    "",
    "Alle Einzelheiten entnehmen Sie bitte dem beigefügten PDF. Für Rückfragen stehen wir Ihnen gerne zur Verfügung.",
    "",
    "Mit freundlichen Grüßen",
  ].filter(Boolean);

  const signatureText = [
    String(settings?.["email_signature"] ?? "") ||
      [settings?.["company_name"] ?? "", settings?.["phone"] ?? ""].filter(Boolean).join("\n"),
    settings?.["website_url"] ? String(settings["website_url"]) : "",
    settings?.["facebook_url"] ? String(settings["facebook_url"]) : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    to: customerEmail,
    subject,
    body: baseLines.join("\n"),
    signatureText,
    signatureHtml: buildSignatureHtml(settings as Record<string, unknown>),
  };
}
