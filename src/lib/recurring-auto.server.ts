import "@tanstack/react-start/server-only";

import { createClient } from "@supabase/supabase-js";
import { buildDocumentPdfBytes, type PdfDocData } from "@/lib/invoice-pdf";
import { formatDate, formatMoney, formatNumber, taxNoteForTaxMode } from "@/lib/format";
import { sendVerifiedEmail } from "@/lib/resend-email.server";

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
};

type DueRow = {
  document_id: string;
  document_number: string;
  owner_user_id: string;
  scheduled_date: string;
  interval_months: number;
  already_sent: boolean;
};

function localTodayBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d!, lastDay);
  return [
    first.getUTCFullYear(),
    String(first.getUTCMonth() + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function germanMonthYear(dateStr: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateStr}T12:00:00+02:00`));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function asText(v: unknown): string {
  return String(v ?? "");
}

function makePdfData(
  doc: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  settings: Record<string, unknown>,
): PdfDocData {
  const companyName = asText(settings["company_name"]) || "Unternehmen";
  const net = Number(doc["net_total"] ?? 0);
  const vat = Number(doc["vat_amount"] ?? 0);
  const gross = Number(doc["total"] ?? 0);
  const vatRate = Number(doc["vat_rate"] ?? 0);
  const customerType = asText(doc["customer_type"] || "firma");
  const isPrivat = customerType === "privat";
  const number = asText(doc["number"]);
  const issueDate = asText(doc["issue_date"]);
  const dueDate = asText(doc["due_date"]);

  return {
    isInvoice: true,
    title: asText(doc["title"]).trim() || `Rechnung ${number}`,
    logo: null,
    logoInitials: companyName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join(""),
    companyName,
    ownerName: asText(settings["owner_name"]) || undefined,
    contactEmail: asText(settings["email"]) || undefined,
    contactPhone: asText(settings["phone"]) || undefined,
    senderLine: [
      companyName,
      asText(settings["address_line"]),
      [asText(settings["postal_code"]), asText(settings["city"])].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(" · "),
    customer: [
      ...(isPrivat ? [] : [asText(doc["customer_company"])]),
      asText(doc["customer_name"]),
      asText(doc["customer_address_line"]),
      [asText(doc["customer_postal_code"]), asText(doc["customer_city"])].filter(Boolean).join(" "),
      asText(doc["customer_country"]),
    ].filter(Boolean),
    customerVatId: !isPrivat && asText(doc["customer_vat_id"]) ? asText(doc["customer_vat_id"]) : undefined,
    meta: [
      ...(asText(doc["customer_number"])
        ? [{ label: "Kundennummer", value: asText(doc["customer_number"]) }]
        : []),
      { label: "Rechnungsnummer", value: number },
      { label: "Rechnungsdatum", value: formatDate(issueDate) },
      ...(asText(doc["service_period"])
        ? [{ label: "Leistungszeitraum", value: asText(doc["service_period"]) }]
        : []),
      ...(dueDate ? [{ label: "Fällig am", value: formatDate(dueDate) }] : []),
      ...(asText(doc["order_number"])
        ? [{ label: "Bestellnummer", value: asText(doc["order_number"]) }]
        : []),
    ],
    introText: asText(doc["intro_text"]) || "Für die erbrachten Leistungen berechnen wir wie folgt:",
    items: items.map((item) => ({
      description: asText(item["description"]),
      quantity: formatNumber(Number(item["quantity"] ?? 0)),
      unit: asText(item["unit"]),
      unitPrice: formatMoney(Number(item["unit_price"] ?? 0)),
      total: formatMoney(Number(item["quantity"] ?? 0) * Number(item["unit_price"] ?? 0)),
      optional: Boolean(item["is_optional"]),
    })),
    summary: [
      { label: "Nettobetrag (Summe netto)", value: formatMoney(net) },
      { label: `zzgl. Umsatzsteuer ${formatNumber(vatRate)} %`, value: formatMoney(vat) },
      {
        label: vatRate > 0 ? "Bruttobetrag (inkl. MwSt.)" : "Gesamtbetrag",
        value: formatMoney(gross),
        strong: true,
        rule: true,
      },
    ],
    taxNote: taxNoteForTaxMode(asText(doc["tax_mode"]) || "domestic") || undefined,
    notes: asText(doc["notes"]) || undefined,
    paymentLines: [
      `Zahlüberweisung in ${Number(settings["payment_terms_days"] ?? 14)} Tagen`,
      "Vielen Dank für die gute Zusammenarbeit.",
    ],
    qrPayload: null,
    footer: [
      {
        heading: companyName,
        lines: [
          asText(settings["address_line"]),
          [asText(settings["postal_code"]), asText(settings["city"])].filter(Boolean).join(" "),
          asText(settings["phone"]) ? `Tel. ${asText(settings["phone"])}` : "",
          asText(settings["email"]),
        ],
      },
      {
        heading: "Steuerangaben",
        lines: [
          `USt-IdNr.: ${asText(settings["vat_id"])}`,
          `Steuernummer: ${asText(settings["tax_number"])}`,
          asText(settings["owner_name"]) ? `Inhaber: ${asText(settings["owner_name"])}` : "",
        ],
      },
      {
        heading: "Bankverbindung",
        lines: [
          asText(settings["bank_name"]),
          `IBAN ${asText(settings["iban"])}`,
          `BIC ${asText(settings["bic"])}`,
        ],
      },
    ],
  };
}

export async function runAutomaticRecurringInvoices(env: Env) {
  const supabaseAdminKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !supabaseAdminKey || !env.RESEND_API_KEY) {
    const missing = [
      ...(!env.SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!supabaseAdminKey ? ["SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY"] : []),
      ...(!env.RESEND_API_KEY ? ["RESEND_API_KEY"] : []),
    ];
    throw new Error(`Automatischer Rechnungsversand: Konfiguration fehlt (${missing.join(", ")}).`);
  }

  const isOpaqueSecret = supabaseAdminKey.startsWith("sb_secret_");
  const admin = createClient(env.SUPABASE_URL, supabaseAdminKey, {
    global: isOpaqueSecret
      ? {
          fetch: (input, init) => {
            const headers = new Headers(
              typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
            );
            if (init?.headers) {
              new Headers(init.headers).forEach((value, key) => headers.set(key, value));
            }
            if (headers.get("Authorization") === `Bearer ${supabaseAdminKey}`) {
              headers.delete("Authorization");
            }
            headers.set("apikey", supabaseAdminKey);
            return fetch(input, { ...init, headers });
          },
        }
      : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const today = localTodayBerlin();

  const { data: recurring, error: recurringError } = await admin
    .from("recurring_invoices")
    .select("id,user_id,title,next_run,interval_months,active,template_document_id")
    .eq("active", true)
    .lte("next_run", today)
    .not("template_document_id", "is", null)
    .order("next_run", { ascending: true });
  if (recurringError) throw recurringError;

  const results: Array<{ id: string; status: string; detail?: string }> = [];

  for (const rec of recurring ?? []) {
    try {
      const { data: createdRows, error: createError } = await admin.rpc(
        "create_due_recurring_invoice",
        { _recurring_id: rec.id, _today: today },
      );
      if (createError) throw createError;
      const run = (createdRows?.[0] ?? null) as DueRow | null;
      if (!run) continue;

      const nextRun = addMonths(run.scheduled_date, Number(run.interval_months) || 1);

      if (run.already_sent) {
        const { error: advanceError } = await admin
          .from("recurring_invoices")
          .update({ next_run: nextRun, updated_at: new Date().toISOString() })
          .eq("id", rec.id)
          .eq("next_run", run.scheduled_date);
        if (advanceError) throw advanceError;
        results.push({ id: rec.id, status: "already-sent-advanced" });
        continue;
      }

      const [{ data: doc, error: docError }, { data: items, error: itemError }, { data: settings, error: settingsError }] =
        await Promise.all([
          admin.from("documents").select("*").eq("id", run.document_id).single(),
          admin.from("document_items").select("*").eq("document_id", run.document_id).order("position"),
          admin.from("company_settings").select("*").eq("user_id", run.owner_user_id).maybeSingle(),
        ]);
      if (docError || !doc) throw docError ?? new Error("Automatische Rechnung nicht gefunden.");
      if (itemError) throw itemError;
      if (settingsError || !settings) throw settingsError ?? new Error("Firmendaten fehlen.");
      if (!asText(doc.customer_email).trim()) throw new Error("Kunden-E-Mail fehlt.");

      if (Number(run.interval_months) === 1) {
        const servicePeriod = germanMonthYear(run.scheduled_date);
        const { error: periodError } = await admin
          .from("documents")
          .update({ service_period: servicePeriod })
          .eq("id", run.document_id);
        if (periodError) throw periodError;
        doc.service_period = servicePeriod;
      }

      let pdfBytes: Uint8Array;
      let pdfPath = asText(doc.pdf_path).trim();
      let pdfHash = asText(doc.pdf_sha256).trim();

      if (pdfPath && pdfHash) {
        const { data: stored, error: downloadError } = await admin.storage
          .from("firmen-dateien")
          .download(pdfPath);
        if (downloadError || !stored) throw downloadError ?? new Error("Archiv-PDF fehlt.");
        pdfBytes = new Uint8Array(await stored.arrayBuffer());
        const actualHash = await sha256Hex(pdfBytes);
        if (actualHash !== pdfHash.toLowerCase()) {
          throw new Error("Archiv-PDF-Prüfsumme stimmt nicht.");
        }
      } else {
        pdfBytes = await buildDocumentPdfBytes(
          makePdfData(doc as unknown as Record<string, unknown>, (items ?? []) as unknown as Array<Record<string, unknown>>, settings as unknown as Record<string, unknown>),
        );
        pdfHash = await sha256Hex(pdfBytes);
        pdfPath = `${run.owner_user_id}/gobd/${run.document_number.replace(/[^\w.-]+/g, "_")}.pdf`;
        const { error: uploadError } = await admin.storage
          .from("firmen-dateien")
          .upload(pdfPath, pdfBytes, { upsert: false, contentType: "application/pdf" });
        if (uploadError) {
          const { data: existing, error: existingError } = await admin.storage
            .from("firmen-dateien")
            .download(pdfPath);
          if (existingError || !existing) throw uploadError;
          const existingBytes = new Uint8Array(await existing.arrayBuffer());
          if ((await sha256Hex(existingBytes)) !== pdfHash) throw uploadError;
          pdfBytes = existingBytes;
        }
        const { error: archiveError } = await admin
          .from("documents")
          .update({
            pdf_path: pdfPath,
            pdf_sha256: pdfHash,
            archived_at: new Date().toISOString(),
          })
          .eq("id", run.document_id);
        if (archiveError) throw archiveError;
      }

      const customer = asText(doc.customer_company || doc.customer_name || "Kunde");
      const companyName = asText(settings.company_name || "Hom Reinigung Service");
      const subject = `Rechnung ${run.document_number} – ${companyName}`;
      const body = [
        `Guten Tag ${customer},`,
        "",
        `anbei erhalten Sie Ihre Rechnung ${run.document_number} vom ${formatDate(run.scheduled_date)}.`,
        "",
        `Rechnungsbetrag: ${formatMoney(Number(doc.total ?? 0))}`,
        `Fällig am: ${formatDate(asText(doc.due_date))}`,
        "",
        "Vielen Dank für die gute Zusammenarbeit.",
        "",
        `Freundliche Grüße\n${companyName}`,
      ].join("\n");

      const companyEmail = asText(settings.email).trim();
      await sendVerifiedEmail({
        to: asText(doc.customer_email).trim(),
        subject,
        text: body,
        companyName,
        ...(companyEmail ? { companyEmail } : {}),
        attachments: [
          {
            filename: `Rechnung_${run.document_number.replace(/[^\w.-]+/g, "_")}.pdf`,
            content: toBase64(pdfBytes),
          },
        ],
        idempotencyKey: `recurring/${rec.id}/${run.scheduled_date}`,
        resendApiKey: env.RESEND_API_KEY,
        ...(env.RESEND_FROM ? { resendFrom: env.RESEND_FROM } : {}),
      });

      const now = new Date().toISOString();
      const { error: sentError } = await admin
        .from("documents")
        .update({ status: "sent", sent_at: now, locked_at: now })
        .eq("id", run.document_id);
      if (sentError) throw sentError;

      const { error: auditError } = await admin.from("document_audit_log").insert({
        user_id: run.owner_user_id,
        document_id: run.document_id,
        document_number: run.document_number,
        action: "recurring_auto_sent",
        details: {
          recurring_id: rec.id,
          scheduled_date: run.scheduled_date,
          recipient: asText(doc.customer_email).trim(),
          pdf_path: pdfPath,
          pdf_sha256: pdfHash,
        },
      });
      if (auditError) throw auditError;

      const { error: advanceError } = await admin
        .from("recurring_invoices")
        .update({ next_run: nextRun, updated_at: now })
        .eq("id", rec.id)
        .eq("next_run", run.scheduled_date);
      if (advanceError) throw advanceError;

      results.push({ id: rec.id, status: "sent" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Recurring invoice ${rec.id} failed: ${detail}`);
      results.push({ id: rec.id, status: "failed", detail });
    }
  }

  return results;
}
