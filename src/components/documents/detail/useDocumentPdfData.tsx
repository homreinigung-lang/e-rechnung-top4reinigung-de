import { toast } from "sonner";
import { DOC_TYPE_LABEL, formatDate, formatMoney, formatNumber } from "@/lib/format";

import {
  QUOTE_DISCLAIMER,
  CANCELLATION_TERMS,
  ORDER_INTRO,
  INVOICE_INTRO,
  defaultQuoteIntro,
  orderHeadline,
  deriveServiceName,
  quoteHeadline,
} from "@/lib/document-texts";

import { loadDocumentLogo } from "@/lib/document-logo";

import { type PdfDocData } from "@/lib/invoice-pdf";

import { OPTIONAL_NOTE } from "./shared";

import type { useDocumentViewData } from "./useDocumentViewData";
import type { useDocumentDetailForm } from "./useDocumentDetailForm";
import type { useDocumentDetailPersistence } from "./useDocumentDetailPersistence";

export function useDocumentPdfData(input: {
  cancelledBy: ReturnType<typeof useDocumentViewData>["cancelledBy"];
  discountAmount: ReturnType<typeof useDocumentDetailForm>["discountAmount"];
  discountPercent: ReturnType<typeof useDocumentDetailForm>["discountPercent"];
  discountReason: ReturnType<typeof useDocumentDetailForm>["discountReason"];
  doc: ReturnType<typeof useDocumentViewData>["doc"];
  docNumber: ReturnType<typeof useDocumentViewData>["docNumber"];
  epc: ReturnType<typeof useDocumentViewData>["epc"];
  form: ReturnType<typeof useDocumentDetailForm>["form"];
  grossTotal: ReturnType<typeof useDocumentDetailForm>["grossTotal"];
  hasOptionalItems: ReturnType<typeof useDocumentDetailForm>["hasOptionalItems"];
  introText: ReturnType<typeof useDocumentViewData>["introText"];
  isInvoice: ReturnType<typeof useDocumentViewData>["isInvoice"];
  isOrder: ReturnType<typeof useDocumentViewData>["isOrder"];
  isPrivat: ReturnType<typeof useDocumentDetailForm>["isPrivat"];
  isQuote: ReturnType<typeof useDocumentViewData>["isQuote"];
  isStorno: ReturnType<typeof useDocumentViewData>["isStorno"];
  items: ReturnType<typeof useDocumentDetailForm>["items"];
  itemsTotal: ReturnType<typeof useDocumentDetailForm>["itemsTotal"];
  locked: ReturnType<typeof useDocumentViewData>["locked"];
  logoSrc: ReturnType<typeof useDocumentDetailForm>["logoSrc"];
  netTotal: ReturnType<typeof useDocumentDetailForm>["netTotal"];
  paymentTermsDays: ReturnType<typeof useDocumentViewData>["paymentTermsDays"];
  regularTotal: ReturnType<typeof useDocumentDetailForm>["regularTotal"];
  save: ReturnType<typeof useDocumentDetailPersistence>["save"];
  senderLine: ReturnType<typeof useDocumentViewData>["senderLine"];
  settings: ReturnType<typeof useDocumentViewData>["settings"];
  sourceDoc: ReturnType<typeof useDocumentViewData>["sourceDoc"];
  stornoGrund: ReturnType<typeof useDocumentViewData>["stornoGrund"];
  stornoNumber: ReturnType<typeof useDocumentViewData>["stornoNumber"];
  taxNote: ReturnType<typeof useDocumentDetailForm>["taxNote"];
  vatAmount: ReturnType<typeof useDocumentDetailForm>["vatAmount"];
  vatRate: ReturnType<typeof useDocumentDetailForm>["vatRate"];
}) {
  const {
    cancelledBy,
    discountAmount,
    discountPercent,
    discountReason,
    doc,
    docNumber,
    epc,
    form,
    grossTotal,
    hasOptionalItems,
    introText,
    isInvoice,
    isOrder,
    isPrivat,
    isQuote,
    isStorno,
    items,
    itemsTotal,
    locked,
    logoSrc,
    netTotal,
    paymentTermsDays,
    regularTotal,
    save,
    senderLine,
    settings,
    sourceDoc,
    stornoGrund,
    stornoNumber,
    taxNote,
    vatAmount,
    vatRate,
  } = input;
  async function buildPdfData(numberOverride?: string): Promise<PdfDocData> {
    const number = numberOverride ?? docNumber;
    const companyName = String(settings?.["company_name"] ?? "");

    const meta: Array<{ label: string; value: string }> = [];
    if (form["customer_number"])
      meta.push({ label: "Kundennummer", value: String(form["customer_number"]) });
    meta.push({
      label: isInvoice ? "Rechnungsnummer" : isOrder ? "Auftragsnummer" : "Angebotsnummer",
      value: number,
    });
    meta.push({
      label: isInvoice ? "Rechnungsdatum" : "Datum",
      value: formatDate(String(form["issue_date"] ?? "")),
    });
    if (form["service_period"])
      meta.push({ label: "Leistungszeitraum", value: String(form["service_period"]) });
    if (form["due_date"])
      meta.push({
        label: isInvoice ? "Fällig am" : "Gültig bis",
        value: formatDate(String(form["due_date"])),
      });
    if (!isPrivat && form["order_number"])
      meta.push({ label: "Bestellnummer", value: String(form["order_number"]) });
    // Referenz auf den Quellbeleg (Angebot bzw. Auftragsbestätigung) – § 14 UStG.
    if (sourceDoc) {
      const refLabel =
        sourceDoc.type === "quote"
          ? "Angebot"
          : sourceDoc.type === "order"
            ? "Auftragsbestätigung"
            : "Referenz";
      meta.push({
        label: refLabel,
        value: sourceDoc.issue_date
          ? `${sourceDoc.number} vom ${formatDate(String(sourceDoc.issue_date))}`
          : sourceDoc.number,
      });
    }

    const summary: PdfDocData["summary"] = [];
    if (discountPercent > 0) {
      summary.push({ label: "Zwischensumme (netto)", value: formatMoney(itemsTotal) });
      summary.push({
        label: `Rabatt ${formatNumber(discountPercent)} %${discountReason ? ` – ${discountReason}` : ""}`,
        value: `−${formatMoney(discountAmount)}`,
      });
    }
    summary.push({ label: "Nettobetrag (Summe netto)", value: formatMoney(netTotal) });
    summary.push({
      label: `zzgl. Umsatzsteuer ${formatNumber(vatRate)} %`,
      value: formatMoney(vatAmount),
    });
    summary.push({
      label: vatRate > 0 ? "Bruttobetrag (inkl. MwSt.)" : "Gesamtbetrag",
      value: formatMoney(grossTotal),
      strong: true,
      rule: true,
    });

    const customTitle = String(form["title"] ?? "").trim();
    const autoTitle = `${isStorno ? "Stornorechnung" : DOC_TYPE_LABEL[doc.type]} ${number}`;

    return {
      isInvoice,
      // Auch bei Rechnungen ersetzt ein frei eingetragener Titel die
      // automatische Überschrift; die Nummer bleibt im Belegkopf sichtbar.
      title: isInvoice && customTitle ? customTitle : autoTitle,

      // Sichtbarer Stempel bei Stornobeleg und bei stornierter Originalrechnung.
      ...(isStorno || cancelledBy || doc.status === "cancelled"
        ? {
            watermark: "STORNO",
            ...(stornoGrund || stornoNumber
              ? {
                  watermarkNote: [
                    isStorno
                      ? stornoNumber
                        ? `Storno zu ${stornoNumber}`
                        : ""
                      : stornoNumber
                        ? `Storniert durch ${stornoNumber}`
                        : "",
                    stornoGrund ? `Grund: ${stornoGrund}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }
              : {}),
          }
        : {}),

      ...(isInvoice
        ? {}
        : {
            // Frei eingetragener Titel hat Vorrang vor der automatisch
            // erzeugten Überschrift (Logik bleibt als Fallback erhalten).
            headline: String(form["title"] ?? "").trim()
              ? String(form["title"]).trim()
              : (isOrder ? orderHeadline : quoteHeadline)(
                  deriveServiceName(
                    form["service_description"] ? String(form["service_description"]) : "",
                    items[0]?.description ?? "",
                  ),
                ),
          }),
      logo: (await loadDocumentLogo(logoSrc)) ?? null,
      logoInitials: companyName
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join(""),
      companyName,
      ownerName: settings?.["owner_name"] ? String(settings["owner_name"]) : undefined,
      contactEmail: settings?.["email"] ? String(settings["email"]) : undefined,
      contactPhone: settings?.["phone"] ? String(settings["phone"]) : undefined,
      senderLine,
      customer: [
        ...(isPrivat ? [] : [String(form["customer_company"] ?? "")]),
        String(form["customer_name"] ?? ""),
        String(form["customer_address_line"] ?? ""),
        `${String(form["customer_postal_code"] ?? "")} ${String(form["customer_city"] ?? "")}`.trim(),
        String(form["customer_country"] ?? ""),
      ],
      customerVatId:
        !isPrivat && form["customer_vat_id"] ? String(form["customer_vat_id"]) : undefined,
      meta,
      introText: isInvoice
        ? introText || INVOICE_INTRO
        : isQuote
          ? introText || defaultQuoteIntro(isPrivat, companyName)
          : `${ORDER_INTRO}${introText ? `\n\n${introText}` : ""}`,

      items: (hasOptionalItems
        ? [...items.filter((i) => !i.is_optional), ...items.filter((i) => i.is_optional)]
        : items
      ).map((i) => ({
        description: i.description,
        quantity: formatNumber(i.quantity),
        unit: i.unit,
        unitPrice: formatMoney(i.unit_price),
        total: formatMoney(i.quantity * i.unit_price),
        optional: Boolean(i.is_optional),
      })),
      regularSubtotal: formatMoney(regularTotal),
      optionalNote: OPTIONAL_NOTE,
      serviceDescription:
        !isInvoice && form["service_description"] ? String(form["service_description"]) : undefined,
      summary,
      taxNote: taxNote || undefined,
      notes: isInvoice
        ? form["notes"]
          ? String(form["notes"])
          : undefined
        : [
            form["notes"] ? String(form["notes"]) : "",
            isOrder ? "" : QUOTE_DISCLAIMER,
            isOrder ? CANCELLATION_TERMS : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
      // Bankdaten stehen bereits im Fußbereich – hier nicht wiederholen.
      paymentLines: isInvoice
        ? [
            `Zahlüberweisung in ${paymentTermsDays} Tagen`,
            "Vielen Dank für die gute Zusammenarbeit.",
          ]
        : [`Zahlüberweisung in ${paymentTermsDays} Tagen`],

      qrPayload: epc,
      footer: [
        {
          heading: companyName,
          lines: [
            String(settings?.["address_line"] ?? ""),
            `${String(settings?.["postal_code"] ?? "")} ${String(settings?.["city"] ?? "")}`.trim(),
            settings?.["phone"] ? `Tel. ${String(settings["phone"])}` : "",
            settings?.["email"] ? String(settings["email"]) : "",
          ],
        },
        {
          heading: "Steuerangaben",
          lines: [
            `USt-IdNr.: ${String(settings?.["vat_id"] ?? "")}`,
            `Steuernummer: ${String(settings?.["tax_number"] ?? "")}`,
            settings?.["owner_name"] ? `Inhaber: ${String(settings["owner_name"])}` : "",
          ],
        },
        {
          heading: "Bankverbindung",
          lines: [
            String(settings?.["bank_name"] ?? ""),
            `IBAN ${String(settings?.["iban"] ?? "")}`,
            `BIC ${String(settings?.["bic"] ?? "")}`,
          ],
        },
      ],
    };
  }

  /**
   * Vor jeder Ausgabe (PDF, E-Rechnung, Versand) den aktuellen Bearbeitungsstand
   * verbindlich speichern. Sonst kann ein PDF Positionen enthalten, die in der
   * Datenbank (und damit in Vorschau/Übersicht/Portal) gar nicht existieren.
   */
  async function persistBeforeOutput(): Promise<boolean> {
    if (locked) return true;
    try {
      await save.mutateAsync();
      return true;
    } catch {
      // Fehlermeldung kommt bereits aus der Mutation.
      return false;
    }
  }

  /** Versand/Festschreiben ohne Positionen verhindert leere Belege (§ 14 UStG). */
  function ensureHasItems(): boolean {
    if (items.length > 0) return true;
    toast.error("Der Beleg enthält keine Positionen. Bitte zuerst Positionen erfassen.", {
      duration: 8000,
    });
    return false;
  }
  return { buildPdfData, ensureHasItems, persistBeforeOutput };
}
