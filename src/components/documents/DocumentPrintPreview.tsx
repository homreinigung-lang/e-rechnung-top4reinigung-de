import { Fragment } from "react";
import { GiroCode } from "@/components/GiroCode";
import { DOC_TYPE_LABEL, formatDate, formatMoney, formatNumber } from "@/lib/format";
import {
  CANCELLATION_TERMS,
  INVOICE_INTRO,
  QUOTE_DISCLAIMER,
  QUOTE_INTRO_PRIVAT,
  defaultQuoteIntro,
  deriveServiceName,
  orderHeadline,
  quoteHeadline,
  quoteIntro,
} from "@/lib/document-texts";

type PreviewItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_optional?: boolean;
};

type DocumentPrintPreviewProps = {
  cancelledBy: unknown;
  isStorno: boolean;
  logoSrc: string;
  settings: Record<string, string | number | null> | null;
  senderLine: string;
  isPrivat: boolean;
  form: Record<string, string | boolean | null>;
  isInvoice: boolean;
  isOrder: boolean;
  isQuote: boolean;
  docType: string;
  docNumber: string;
  items: PreviewItem[];
  introText: string;
  hasOptionalItems: boolean;
  regularTotal: number;
  optionalNote: string;
  discountPercent: number;
  discountReason: string;
  itemsTotal: number;
  discountAmount: number;
  netTotal: number;
  vatRate: number;
  vatAmount: number;
  grossTotal: number;
  taxNote: string;
  paymentTermsDays: number;
  epc: string | null;
};

export function DocumentPrintPreview({
  cancelledBy,
  isStorno,
  logoSrc,
  settings,
  senderLine,
  isPrivat,
  form,
  isInvoice,
  isOrder,
  isQuote,
  docType,
  docNumber,
  items,
  introText,
  hasOptionalItems,
  regularTotal,
  optionalNote,
  discountPercent,
  discountReason,
  itemsTotal,
  discountAmount,
  netTotal,
  vatRate,
  vatAmount,
  grossTotal,
  taxNote,
  paymentTermsDays,
  epc,
}: DocumentPrintPreviewProps) {
  return (
    <article className="paper print-area relative mx-auto text-sm">
      {(cancelledBy || isStorno) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex size-64 rotate-[-25deg] items-center justify-center rounded-full border-[6px] border-destructive/60" aria-hidden>
            <div className="flex size-[calc(100%-1rem)] items-center justify-center rounded-full border-2 border-destructive/60">
              <span className="font-black uppercase tracking-widest text-3xl text-destructive/60 select-none">STORNO</span>
            </div>
          </div>
        </div>
      )}
      <div>
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            {logoSrc ? (
              <img src={logoSrc} alt="Firmenlogo" crossOrigin="anonymous" referrerPolicy="no-referrer" className="invoice-logo w-auto max-w-56 object-contain" />
            ) : (
              <div className="invoice-logo flex h-14 w-14 items-center justify-center rounded-md border border-border bg-muted font-display text-lg font-bold text-muted-foreground">
                {String(settings?.["company_name"] ?? "").split(/\s+/).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("")}
              </div>
            )}
            <div>
              <h1 className="font-display text-2xl font-bold">{String(settings?.["company_name"] ?? "")}</h1>
              {settings?.["owner_name"] && <p className="text-xs text-muted-foreground">Inhaber: {String(settings["owner_name"])}</p>}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {settings?.["email"] && <div>{String(settings["email"])}</div>}
            {settings?.["phone"] && <div>{String(settings["phone"])}</div>}
          </div>
        </header>

        <div className="mt-7 grid gap-8 sm:grid-cols-2">
          <address className="not-italic">
            <div className="border-b pb-1 text-[10px] text-muted-foreground">{senderLine}</div>
            {!isPrivat && <div className="mt-3 font-medium">{String(form["customer_company"] ?? "")}</div>}
            <div className={isPrivat ? "mt-3 font-medium" : undefined}>{String(form["customer_name"] ?? "")}</div>
            <div>{String(form["customer_address_line"] ?? "")}</div>
            <div>{String(form["customer_postal_code"] ?? "")} {String(form["customer_city"] ?? "")}</div>
            <div>{String(form["customer_country"] ?? "")}</div>
            {!isPrivat && form["customer_vat_id"] && <div className="mt-1 text-xs">USt-IdNr.: {String(form["customer_vat_id"])}</div>}
          </address>
          <dl className="space-y-1 text-right">
            {form["customer_number"] && <div><dt className="inline text-muted-foreground">Kundennummer: </dt><dd className="inline font-medium">{String(form["customer_number"])}</dd></div>}
            <div>
              <dt className="inline text-muted-foreground">{isInvoice ? "Rechnungsnummer" : isOrder ? "Auftragsnummer" : "Angebotsnummer"}: </dt>
              <dd className="inline font-medium">{docNumber}</dd>
            </div>
            <div><dt className="inline text-muted-foreground">{isInvoice ? "Rechnungsdatum" : "Datum"}: </dt><dd className="inline">{formatDate(String(form["issue_date"] ?? ""))}</dd></div>
            {form["service_period"] && <div><dt className="inline text-muted-foreground">Leistungszeitraum: </dt><dd className="inline">{String(form["service_period"])}</dd></div>}
            {form["due_date"] && <div><dt className="inline text-muted-foreground">{isInvoice ? "Fällig am" : "Gültig bis"}: </dt><dd className="inline">{formatDate(String(form["due_date"]))}</dd></div>}
            {!isPrivat && form["order_number"] && <div><dt className="inline text-muted-foreground">Bestellnummer: </dt><dd className="inline font-medium">{String(form["order_number"])}</dd></div>}
          </dl>
        </div>

        {isInvoice ? (
          <h2 className="mt-7 font-display text-xl font-semibold">{String(form["title"] ?? "").trim() ? String(form["title"]).trim() : `${DOC_TYPE_LABEL[docType]} ${docNumber}`}</h2>
        ) : (
          <>
            <h2 className="mt-7 text-center font-display text-lg font-bold text-balance">
              {String(form["title"] ?? "").trim() ? String(form["title"]).trim() : (isOrder ? orderHeadline : quoteHeadline)(deriveServiceName(form["service_description"] ? String(form["service_description"]) : "", items[0]?.description ?? ""))}
            </h2>
            {!isQuote && <p className="mt-3 text-justify text-sm leading-relaxed">{isPrivat ? QUOTE_INTRO_PRIVAT : quoteIntro(String(settings?.["company_name"] ?? ""))}</p>}
          </>
        )}
        {isInvoice && !introText && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{INVOICE_INTRO}</p>}
        {isQuote && !introText && <p className="mt-3 whitespace-pre-line text-justify text-sm leading-relaxed">{defaultQuoteIntro(isPrivat, String(settings?.["company_name"] ?? ""))}</p>}
        {introText && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{introText}</p>}

        <div className="invoice-table-wrap mt-4 overflow-x-auto">
          <table className="invoice-table w-full border-collapse text-left text-sm">
            <colgroup><col style={{ width: "6%" }} /><col style={{ width: "38%" }} /><col style={{ width: "10%" }} /><col style={{ width: "11%" }} /><col style={{ width: "17%" }} /><col style={{ width: "18%" }} /></colgroup>
            <thead><tr className="bg-muted text-[11px] tracking-normal text-muted-foreground uppercase"><th className="px-2 py-2 font-medium">Pos.</th><th className="px-2 py-2 font-medium">Bezeichnung</th><th className="px-2 py-2 text-right font-medium whitespace-nowrap">Menge</th><th className="px-2 py-2 font-medium">Einheit</th><th className="px-2 py-2 text-right font-medium">Einzelpreis netto €</th><th className="px-2 py-2 text-right font-medium">Gesamtpreis netto €</th></tr></thead>
            <tbody>
              {(hasOptionalItems ? [...items.filter((item) => !item.is_optional), ...items.filter((item) => item.is_optional)] : items).map((item, index, orderedItems) => (
                <Fragment key={item.id}>
                  {hasOptionalItems && index === 0 && <tr className="bg-muted/70"><td colSpan={6} className="px-2 py-2 text-sm font-semibold">Regelmäßige Leistungen</td></tr>}
                  {hasOptionalItems && item.is_optional && !orderedItems[index - 1]?.is_optional && (
                    <>
                      <tr className="border-b border-border"><td colSpan={5} className="px-2 py-2 text-sm font-semibold">Monatlicher Festpreis (netto)</td><td className="px-2 py-2 text-right text-sm font-semibold tabular-nums whitespace-nowrap">{formatMoney(regularTotal)}</td></tr>
                      <tr className="bg-muted/70"><td colSpan={6} className="px-2 py-2 text-sm font-semibold">Optionale Zusatzleistungen</td></tr>
                    </>
                  )}
                  <tr className="border-b border-border align-top">
                    <td className="px-2 py-2 tabular-nums">{index + 1}</td><td className="px-2 py-2 break-words whitespace-pre-line">{item.description}</td><td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{formatNumber(item.quantity)}</td><td className="px-2 py-2">{item.unit}</td><td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{formatMoney(item.unit_price)}</td><td className="px-2 py-2 text-right font-medium tabular-nums whitespace-nowrap">{formatMoney(item.quantity * item.unit_price)}</td>
                  </tr>
                  {hasOptionalItems && !item.is_optional && index === orderedItems.length - 1 && <tr className="border-b border-border"><td colSpan={5} className="px-2 py-2 text-sm font-semibold">Monatlicher Festpreis (netto)</td><td className="px-2 py-2 text-right text-sm font-semibold tabular-nums whitespace-nowrap">{formatMoney(regularTotal)}</td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
          {hasOptionalItems && <p className="mt-2 text-xs text-muted-foreground">{optionalNote}</p>}
        </div>

        {!isInvoice && form["service_description"] && (
          <section className="invoice-description mt-6">
            <h3 className="font-display text-base font-semibold">Leistungsbeschreibung</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {String(form["service_description"]).split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
                const bullet = /^[-•*]\s*/.test(line);
                const text = line.replace(/^[-•*]\s*/, "");
                return bullet ? <li key={index} className="flex gap-2"><span aria-hidden="true">•</span><span className="break-words">{text}</span></li> : <li key={index} className="list-none font-medium break-words">{text}</li>;
              })}
            </ul>
          </section>
        )}
      </div>

      <div className="invoice-summary-block">
        <div className="invoice-closing">
          <div className="mt-3 flex justify-end">
            <div className="w-72 space-y-0.5">
              {discountPercent > 0 && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Zwischensumme (netto)</span><span>{formatMoney(itemsTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Rabatt {formatNumber(discountPercent)} %{discountReason ? ` – ${discountReason}` : ""}</span><span>−{formatMoney(discountAmount)}</span></div>
                </>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Nettobetrag (Summe netto)</span><span>{formatMoney(netTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">zzgl. Umsatzsteuer {formatNumber(vatRate)} %</span><span>{formatMoney(vatAmount)}</span></div>
              <div className="flex justify-between border-t pt-1 font-display text-base font-semibold"><span>{vatRate > 0 ? "Bruttobetrag (inkl. MwSt.)" : "Gesamtbetrag"}</span><span>{formatMoney(grossTotal)}</span></div>
            </div>
          </div>
          {taxNote && <p className="mt-4 rounded-md bg-muted p-2.5 text-xs">{taxNote}</p>}
          {form["notes"] && <p className="mt-3 text-sm">{String(form["notes"])}</p>}
          {isInvoice ? (
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div className="space-y-0.5 text-sm"><p>Zahlüberweisung in {paymentTermsDays} Tagen</p><p>Vielen Dank für die gute Zusammenarbeit.</p></div><GiroCode payload={epc} size={84} /></div>
          ) : (
            <div className="mt-4 space-y-2 text-sm"><p>Zahlüberweisung in {paymentTermsDays} Tagen</p>{!isOrder && <p className="text-justify leading-relaxed">{QUOTE_DISCLAIMER}</p>}{isOrder && <p className="text-justify text-xs leading-relaxed text-muted-foreground">{CANCELLATION_TERMS}</p>}</div>
          )}
        </div>
        <footer className="mt-8 grid gap-4 border-t pt-3 text-[11px] text-muted-foreground sm:grid-cols-3">
          <div><div className="font-medium text-foreground">{String(settings?.["company_name"] ?? "")}</div><div>{String(settings?.["address_line"] ?? "")}</div><div>{String(settings?.["postal_code"] ?? "")} {String(settings?.["city"] ?? "")}</div>{settings?.["phone"] && <div>Tel. {String(settings["phone"])}</div>}{settings?.["email"] && <div>{String(settings["email"])}</div>}</div>
          <div><div className="font-medium text-foreground">Steuerangaben</div><div>USt-IdNr.: {String(settings?.["vat_id"] ?? "")}</div><div>Steuernummer: {String(settings?.["tax_number"] ?? "")}</div>{settings?.["owner_name"] && <div>Inhaber: {String(settings["owner_name"])}</div>}</div>
          <div><div className="font-medium text-foreground">Bankverbindung</div><div>{String(settings?.["bank_name"] ?? "")}</div><div>IBAN {String(settings?.["iban"] ?? "")}</div><div>BIC {String(settings?.["bic"] ?? "")}</div></div>
        </footer>
      </div>
    </article>
  );
}
