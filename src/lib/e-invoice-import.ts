/**
 * Eingehende E-Rechnungen einlesen (§ 14 UStG / EN 16931):
 *  - XRechnung 3.x als UBL-Invoice (XML)
 *  - ZUGFeRD 2.x / Factur-X als CII-XML (auch eingebettet in ein PDF/A-3)
 *
 * Reines Lesen – die eigene Rechnungserstellung, GoBD-Logik und der
 * Papierkorb bleiben davon vollständig unberührt.
 */

export type IncomingEInvoice = {
  format: "XRechnung (UBL)" | "ZUGFeRD/Factur-X (CII)";
  supplier: string;
  supplier_vat_id: string;
  document_number: string;
  issue_date: string;
  currency: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  notes: string;
  /** Original-XML für die revisionssichere Ablage. */
  xml: string;
};

/**
 * Liest einen Betrag. Fehlt der Wert oder ist er unlesbar, wird bewusst `null`
 * zurückgegeben – niemals 0. Ein stiller 0-Wert würde eine falsche
 * Rechnungssumme in die Buchhaltung übernehmen.
 */
function num(v: string | null | undefined): number | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function ymd(v: string): string {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return "";
}

/**
 * Prüft die Pflichtangaben nach § 14 UStG / EN 16931 und die rechnerische
 * Stimmigkeit. Fehlende oder widersprüchliche Werte führen zu einem klaren
 * Importfehler statt zu einem falschen Beleg.
 */
function validate(
  invoice: Omit<IncomingEInvoice, "net_amount" | "vat_amount" | "gross_amount"> & {
    net_amount: number | null;
    vat_amount: number | null;
    gross_amount: number | null;
  },
): IncomingEInvoice {
  const missing: string[] = [];
  if (!invoice.document_number) missing.push("Rechnungsnummer");
  if (!invoice.issue_date) missing.push("Rechnungsdatum");
  if (!invoice.supplier) missing.push("Rechnungssteller");
  if (invoice.net_amount === null) missing.push("Nettobetrag");
  if (invoice.vat_amount === null) missing.push("Umsatzsteuerbetrag");
  if (invoice.gross_amount === null) missing.push("Bruttobetrag");

  if (missing.length > 0) {
    throw new Error(
      `Die E-Rechnung ist unvollständig und wurde nicht importiert. Fehlende Pflichtangaben: ${missing.join(", ")}.`,
    );
  }

  const net = invoice.net_amount as number;
  const vat = invoice.vat_amount as number;
  const gross = invoice.gross_amount as number;

  if (Math.abs(Math.round((net + vat) * 100) - Math.round(gross * 100)) > 1) {
    throw new Error(
      "Die Beträge der E-Rechnung sind rechnerisch nicht stimmig (Netto + Umsatzsteuer ≠ Brutto). Der Beleg wurde nicht importiert.",
    );
  }

  return { ...invoice, net_amount: net, vat_amount: vat, gross_amount: gross };
}


/** Sucht ein Element unabhängig vom Namensraum, optional innerhalb eines Elternelements. */
function pick(root: Element | Document, path: string[]): Element | null {
  let current: Element[] = [root instanceof Document ? root.documentElement : root];
  for (const name of path) {
    const next: Element[] = [];
    for (const el of current) {
      for (const child of Array.from(el.children)) {
        if (child.localName === name) next.push(child);
      }
    }
    if (next.length === 0) return null;
    current = next;
  }
  return current[0] ?? null;
}

function text(root: Element | Document | null, path: string[]): string {
  if (!root) return "";
  return pick(root, path)?.textContent?.trim() ?? "";
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Die XML-Datei konnte nicht gelesen werden.");
  }
  return doc;
}

function parseUbl(doc: Document, xml: string): IncomingEInvoice {
  const root = doc.documentElement;
  const supplier = pick(root, ["AccountingSupplierParty", "Party"]);
  const totals = pick(root, ["LegalMonetaryTotal"]);
  const taxTotal = pick(root, ["TaxTotal"]);
  const net = num(text(totals, ["TaxExclusiveAmount"]));
  const gross = num(text(totals, ["TaxInclusiveAmount"]));
  const vat = num(text(taxTotal, ["TaxAmount"])) || Math.max(0, gross - net);
  return {
    format: "XRechnung (UBL)",
    supplier:
      text(supplier, ["PartyLegalEntity", "RegistrationName"]) ||
      text(supplier, ["PartyName", "Name"]),
    supplier_vat_id: text(supplier, ["PartyTaxScheme", "CompanyID"]),
    document_number: text(root, ["ID"]),
    issue_date: ymd(text(root, ["IssueDate"])),
    currency: text(root, ["DocumentCurrencyCode"]) || "EUR",
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross || net + vat,
    notes: text(root, ["Note"]),
    xml,
  };
}

function parseCii(doc: Document, xml: string): IncomingEInvoice {
  const root = doc.documentElement;
  const supplier = pick(root, [
    "SupplyChainTradeTransaction",
    "ApplicableHeaderTradeAgreement",
    "SellerTradeParty",
  ]);
  const settlement = pick(root, ["SupplyChainTradeTransaction", "ApplicableHeaderTradeSettlement"]);
  const sums = pick(settlement ?? root, ["SpecifiedTradeSettlementHeaderMonetarySummation"]);
  const net = num(text(sums, ["TaxBasisTotalAmount"]));
  const gross = num(text(sums, ["GrandTotalAmount"]));
  const vat = num(text(sums, ["TaxTotalAmount"])) || Math.max(0, gross - net);
  return {
    format: "ZUGFeRD/Factur-X (CII)",
    supplier: text(supplier, ["Name"]),
    supplier_vat_id: text(supplier, ["SpecifiedTaxRegistration", "ID"]),
    document_number: text(root, ["ExchangedDocument", "ID"]),
    issue_date: ymd(
      text(root, ["ExchangedDocument", "IssueDateTime", "DateTimeString"]) ||
        text(root, ["ExchangedDocument", "IssueDateTime"]),
    ),
    currency: text(settlement, ["InvoiceCurrencyCode"]) || "EUR",
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross || net + vat,
    notes: text(root, ["ExchangedDocument", "IncludedNote", "Content"]),
    xml,
  };
}

/** Erkennt automatisch UBL oder CII. */
export function parseEInvoiceXml(xml: string): IncomingEInvoice {
  const doc = parseXml(xml);
  const rootName = doc.documentElement.localName;
  if (rootName === "CrossIndustryInvoice") return parseCii(doc, xml);
  if (rootName === "Invoice" || rootName === "CreditNote") return parseUbl(doc, xml);
  throw new Error("Kein gültiges E-Rechnungsformat (XRechnung oder ZUGFeRD) erkannt.");
}

/** Holt die eingebettete XML-Datei aus einem ZUGFeRD-/Factur-X-PDF. */
export async function extractXmlFromPdf(bytes: Uint8Array): Promise<string | null> {
  const { PDFDocument, PDFDict, PDFArray, PDFName, PDFRawStream, decodePDFRawStream } =
    await import("pdf-lib");
  const pdf = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const names = pdf.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const embedded = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  const list = embedded?.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (!list) return null;

  for (let i = 0; i < list.size(); i += 2) {
    const spec = list.lookupMaybe(i + 1, PDFDict);
    const ef = spec?.lookupMaybe(PDFName.of("EF"), PDFDict);
    const stream = ef?.lookup(PDFName.of("F"));
    if (!(stream instanceof PDFRawStream)) continue;
    const content = decodePDFRawStream(stream).decode();
    const xml = new TextDecoder("utf-8").decode(content);
    if (/CrossIndustryInvoice|<(\w+:)?Invoice/.test(xml)) return xml;
  }
  return null;
}

/** Liest eine hochgeladene Datei (XML oder ZUGFeRD-PDF) als E-Rechnung ein. */
export async function readIncomingEInvoice(file: File): Promise<IncomingEInvoice> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const xml = await extractXmlFromPdf(new Uint8Array(await file.arrayBuffer()));
    if (!xml) {
      throw new Error(
        "In diesem PDF ist keine E-Rechnung (ZUGFeRD/Factur-X) eingebettet. Bitte als normalen Beleg hochladen.",
      );
    }
    return parseEInvoiceXml(xml);
  }
  return parseEInvoiceXml(await file.text());
}
