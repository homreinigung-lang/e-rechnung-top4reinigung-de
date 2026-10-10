import { DOC_TYPE_LABEL, today } from "@/lib/format";

import { buildEpcPayload } from "@/lib/epc";

import { buildDocumentMail } from "@/lib/document-mail";
import { buildDocumentSenderLine } from "@/lib/document-sender-line";

import { type DocumentItem as Item } from "@/lib/document-detail-query";

import { ensureOfficialNumber, isDraftPlaceholder } from "@/lib/doc-number";

import { dueInfo, mahnungAllowed } from "@/lib/workflow";
import {
  checkInvoiceDates,
  formatPeriod,
  periodForIssueDate,
  syncMonthInText,
} from "@/lib/invoice-period";

import { validateERechnung, type ERechnungInput } from "@/lib/erechnung";

import type { useDocumentDetailForm } from "./useDocumentDetailForm";

export function useDocumentViewData(input: {
  data: NonNullable<ReturnType<typeof useDocumentDetailForm>["data"]>;
  form: ReturnType<typeof useDocumentDetailForm>["form"];
  grossTotal: ReturnType<typeof useDocumentDetailForm>["grossTotal"];
  id: ReturnType<typeof useDocumentDetailForm>["id"];
  items: ReturnType<typeof useDocumentDetailForm>["items"];
  netTotal: ReturnType<typeof useDocumentDetailForm>["netTotal"];
  queryClient: ReturnType<typeof useDocumentDetailForm>["queryClient"];
  reverseChargeAllowed: ReturnType<typeof useDocumentDetailForm>["reverseChargeAllowed"];
  setForm: ReturnType<typeof useDocumentDetailForm>["setForm"];
  setItems: ReturnType<typeof useDocumentDetailForm>["setItems"];
  setQuoteRecipientMode: ReturnType<typeof useDocumentDetailForm>["setQuoteRecipientMode"];
  vatAmount: ReturnType<typeof useDocumentDetailForm>["vatAmount"];
  vatRate: ReturnType<typeof useDocumentDetailForm>["vatRate"];
}) {
  const {
    data,
    form,
    grossTotal,
    id,
    items,
    netTotal,
    queryClient,
    reverseChargeAllowed,
    setForm,
    setItems,
    setQuoteRecipientMode,
    vatAmount,
    vatRate,
  } = input;
  const doc = data.doc;
  const docRecord = doc as unknown as Record<string, unknown>;
  const lockedAt = (docRecord["locked_at"] as string | null) ?? null;
  const locked = Boolean(lockedAt);
  // A finalized invoice is not proof of successful email delivery.
  const emailPending =
    doc.type === "invoice" && locked && !docRecord["sent_at"] && doc.status === "sent";
  const isStorno = Boolean(docRecord["is_storno"]);
  const cancelledBy = (docRecord["cancelled_by_document_id"] as string | null) ?? null;
  const relatedDoc = (data as { related?: Record<string, unknown> | null }).related ?? null;
  // Stornogrund steht am Stornobeleg – für die Originalrechnung wird er dort gelesen.
  const stornoGrund = String(
    (isStorno ? docRecord["storno_reason"] : relatedDoc?.["storno_reason"]) ?? "",
  ).trim();
  const stornoNumber = String(relatedDoc?.["number"] ?? "").trim();
  const settings = data.settings as Record<string, string | number | null> | null;
  const isInvoice = doc.type === "invoice";
  const isOrder = doc.type === "order";
  const isQuote = doc.type === "quote";
  const reminderLevel = Number(docRecord["reminder_level"] ?? 0);
  const canMahnen = mahnungAllowed(docRecord["due_date"] as string | null);

  const convertedId = (docRecord["converted_document_id"] as string | null) ?? null;
  const plannedHoursMonth = Number(
    docRecord["planned_hours_month"] ?? form["planned_hours_month"] ?? 0,
  );
  const plannedVisitsMonth = Number(
    docRecord["planned_visits_month"] ?? form["planned_visits_month"] ?? 0,
  );
  const followUpDoc =
    (data as { followUp?: { id: string; number: string; type: string } | null }).followUp ?? null;
  const sourceDoc =
    (
      data as {
        source?: { id: string; number: string; type: string; issue_date?: string } | null;
      }
    ).source ?? null;
  const due = dueInfo(doc.due_date, doc.status);
  const docNumber = doc.number;
  const introText = String(form["intro_text"] ?? "").trim();
  // Datumsprüfung: Rechnungsdatum darf nicht vor der Leistung liegen (§ 14 UStG).
  const dateCheck = isInvoice
    ? checkInvoiceDates(String(form["issue_date"] ?? ""), String(form["service_period"] ?? ""))
    : { level: "ok" as const, message: "" };

  const senderLine = buildDocumentSenderLine(settings as Record<string, unknown> | null);

  function setField(key: string, value: string | boolean | null) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Status "Bezahlt" und Zahlungsdatum bleiben automatisch synchron.
      if (key === "status") {
        if (value === "paid" && !next["paid_at"]) next["paid_at"] = today();
        if (value !== "paid") next["paid_at"] = null;
      }
      if (key === "paid_at" && value) next["status"] = "paid";
      // Monats-Synchronisierung: Leistungszeitraum folgt automatisch dem
      // Rechnungsdatum, solange noch kein Zeitraum gepflegt wurde.
      if (key === "issue_date" && typeof value === "string" && doc.type === "invoice") {
        const period = periodForIssueDate(value);
        if (period && !String(next["service_period"] ?? "").trim()) {
          next["service_period"] = formatPeriod(period);
        }
        const desc = String(next["service_description"] ?? "");
        if (desc) next["service_description"] = syncMonthInText(desc, value);
      }
      return next;
    });
  }

  /** Übernimmt den Monat des Rechnungsdatums als Leistungszeitraum. */
  function applyIssueMonth() {
    const period = periodForIssueDate(String(form["issue_date"] ?? ""));
    if (!period) return;
    setForm((f) => ({
      ...f,
      service_period: formatPeriod(period),
      service_description: syncMonthInText(String(f["service_description"] ?? ""), period.start),
    }));
  }

  function pickCustomer(customerId: string) {
    const c = data!.customers.find((x) => x.id === customerId);
    if (!c) return;
    setQuoteRecipientMode("kunde");
    // Reverse-Charge greift nur bei EU-Kunden MIT gültiger USt-IdNr. (§ 13b UStG / Art. 196 MwStSystRL)
    const euReverseCharge =
      Boolean((c as { is_eu_customer?: boolean }).is_eu_customer) && Boolean(c.vat_id?.trim());
    setForm((f) => ({
      ...f,
      customer_id: c.id,
      project_id: data!.projects.some(
        (p) => p.id === String(f["project_id"] ?? "") && p.customer_id === c.id,
      )
        ? String(f["project_id"] ?? "")
        : null,
      customer_type: c.company?.trim() ? "firma" : "privat",
      customer_number: (c as { customer_number?: string }).customer_number ?? "",

      customer_name: c.name,
      customer_company: c.company,
      customer_email: c.email,
      customer_phone: c.phone,
      customer_address_line: c.address_line,
      customer_postal_code: c.postal_code,
      customer_city: c.city,
      customer_country: c.country,
      customer_vat_id: c.vat_id,
      tax_mode:
        String(f["tax_mode"] ?? "") === "kleinunternehmer"
          ? "kleinunternehmer"
          : euReverseCharge && reverseChargeAllowed
            ? "eu_reverse_charge"
            : "domestic",
    }));
  }

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const mail = buildDocumentMail({
    documentType: doc.type,
    documentNumber: docNumber,
    issueDate: String(form["issue_date"] ?? doc.issue_date),
    dueDate: String(form["due_date"] ?? ""),
    customerEmail: String(form["customer_email"] ?? ""),
    settings,
  });

  const paymentTermsDays = Number(settings?.["payment_terms_days"] ?? 14);

  const iban = String(settings?.["iban"] ?? "");
  const bic = String(settings?.["bic"] ?? "");

  const epc = isInvoice
    ? buildEpcPayload({
        name: String(settings?.["company_name"] ?? ""),
        iban,
        bic,
        amount: grossTotal,
        reference: `${DOC_TYPE_LABEL[doc.type]} ${docNumber}`,
      })
    : null;

  // ---- E-Rechnung (XRechnung / ZUGFeRD) ----------------------------------
  function eRechnungInput(numberOverride?: string): ERechnungInput {
    const number = numberOverride ?? docNumber;
    return {
      doc: { ...docRecord, ...form, number },
      items,
      settings: settings as Record<string, unknown> | null,
      netTotal,
      vatAmount,
      grossTotal,
      vatRate,
      number,
    };
  }

  function warnIfIncomplete(input: ERechnungInput, format: "xrechnung" | "zugferd" = "zugferd") {
    const problems = validateERechnung(input, format);
    if (problems.length > 0) {
      throw new Error(problems.join(" "));
    }
  }

  /**
   * Vor jeder verbindlichen Ausgabe (Versand, E-Rechnung) die offizielle,
   * fortlaufende Nummer vergeben – der Kunde darf nie eine DEMO-Nummer erhalten.
   */
  async function assignOfficialNumberNow(): Promise<string> {
    if (locked || !isDraftPlaceholder(docNumber)) return docNumber;
    const number = await ensureOfficialNumber(id);
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
    await queryClient.refetchQueries({ queryKey: ["document", id] });
    return number;
  }
  return {
    applyIssueMonth,
    assignOfficialNumberNow,
    canMahnen,
    cancelledBy,
    convertedId,
    dateCheck,
    doc,
    docNumber,
    docRecord,
    due,
    eRechnungInput,
    emailPending,
    epc,
    followUpDoc,
    introText,
    isInvoice,
    isOrder,
    isQuote,
    isStorno,
    locked,
    lockedAt,
    mail,
    paymentTermsDays,
    pickCustomer,
    plannedHoursMonth,
    plannedVisitsMonth,
    reminderLevel,
    senderLine,
    setField,
    settings,
    sourceDoc,
    stornoGrund,
    stornoNumber,
    updateItem,
    warnIfIncomplete,
  };
}
