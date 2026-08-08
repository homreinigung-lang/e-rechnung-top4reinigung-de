/**
 * Deutsche E-Rechnung (§ 14 UStG / EN 16931):
 *  - XRechnung 3.0 als UBL-Invoice (XML)
 *  - ZUGFeRD 2.3 / Factur-X (EN 16931-Profil) als CII-XML, eingebettet in das PDF
 *
 * Beide Formate werden vollständig im Browser aus den vorhandenen Belegdaten
 * erzeugt – ohne externe Dienste.
 */
import { PDFDocument, PDFName, PDFHexString, AFRelationship } from "pdf-lib";

export type ERechnungItem = {
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

export type ERechnungInput = {
  doc: Record<string, unknown>;
  items: ERechnungItem[];
  settings: Record<string, unknown> | null;
  /** Berechnete Summen aus dem Editor (immer maßgeblich). */
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
  vatRate: number;
  /** Nummer, wie sie auf dem Beleg gedruckt wird. */
  number: string;
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dec = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(2);
const qty = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(3);
const ymd = (v: unknown) => String(v ?? "").slice(0, 10);
const cii = (v: unknown) => ymd(v).replace(/-/g, "");

/** UN/ECE-Rec.20-Einheitencode aus der deutschen Einheit ableiten. */
export function unitCode(unit: string): string {
  const u = (unit || "").toLowerCase().replace(/\s|\./g, "");
  if (["std", "stunde", "stunden", "h", "hour"].includes(u)) return "HUR";
  if (["stk", "stück", "stueck", "pcs", "x"].includes(u)) return "H87";
  if (["tag", "tage", "day"].includes(u)) return "DAY";
  if (["monat", "monate"].includes(u)) return "MON";
  if (["m2", "m²", "qm"].includes(u)) return "MTK";
  if (["m", "meter"].includes(u)) return "MTR";
  if (["km"].includes(u)) return "KMT";
  if (["kg"].includes(u)) return "KGM";
  if (["l", "liter"].includes(u)) return "LTR";
  if (["pauschal", "pausch", "psch", "le"].includes(u)) return "LS";
  return "C62";
}

/** ISO-3166-Alpha-2 aus dem deutschen Ländernamen. */
export function countryCode(name: unknown): string {
  const n = String(name ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    deutschland: "DE",
    germany: "DE",
    österreich: "AT",
    oesterreich: "AT",
    schweiz: "CH",
    frankreich: "FR",
    niederlande: "NL",
    belgien: "BE",
    luxemburg: "LU",
    italien: "IT",
    spanien: "ES",
    polen: "PL",
    tschechien: "CZ",
    dänemark: "DK",
    schweden: "SE",
    finnland: "FI",
    portugal: "PT",
    irland: "IE",
    ungarn: "HU",
    rumänien: "RO",
    slowakei: "SK",
    slowenien: "SI",
    kroatien: "HR",
    bulgarien: "BG",
    griechenland: "GR",
    estland: "EE",
    lettland: "LV",
    litauen: "LT",
    zypern: "CY",
    malta: "MT",
  };
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase();
  return map[n] ?? "DE";
}

type Model = ReturnType<typeof buildModel>;

function buildModel(input: ERechnungInput) {
  const { doc, items, settings, netTotal, vatAmount, grossTotal, vatRate, number } = input;
  const s = settings ?? {};
  const reverseCharge = String(doc["tax_mode"] ?? "eu_reverse_charge") !== "domestic";
  const isStorno = Boolean(doc["is_storno"]);

  return {
    number,
    // 380 = Rechnung, 381 = Gutschrift/Storno
    typeCode: isStorno ? "381" : "380",
    issueDate: ymd(doc["issue_date"]) || new Date().toISOString().slice(0, 10),
    dueDate: ymd(doc["due_date"]),
    servicePeriod: String(doc["service_period"] ?? ""),
    buyerReference: String(doc["order_number"] ?? "").trim() || "N/A",
    orderNumber: String(doc["order_number"] ?? "").trim(),
    notes: [String(doc["intro_text"] ?? ""), String(doc["notes"] ?? "")].filter(Boolean),
    reverseCharge,
    vatRate: reverseCharge ? 0 : vatRate,
    netTotal,
    vatAmount: reverseCharge ? 0 : vatAmount,
    grossTotal,
    seller: {
      name: String(s["company_name"] ?? "Hom Reinigung Service"),
      street: String(s["address_line"] ?? ""),
      zip: String(s["postal_code"] ?? ""),
      city: String(s["city"] ?? ""),
      country: countryCode(s["country"] ?? "Deutschland"),
      vatId: String(s["vat_id"] ?? "").replace(/\s+/g, ""),
      taxNumber: String(s["tax_number"] ?? ""),
      email: String(s["email"] ?? ""),
      phone: String(s["phone"] ?? ""),
      contact: String(s["owner_name"] ?? s["company_name"] ?? ""),
      iban: String(s["iban"] ?? "").replace(/\s+/g, ""),
      bic: String(s["bic"] ?? "").replace(/\s+/g, ""),
      bankName: String(s["bank_name"] ?? ""),
    },
    buyer: {
      name: String(doc["customer_company"] || doc["customer_name"] || "Kunde"),
      contact: String(doc["customer_name"] ?? ""),
      street: String(doc["customer_address_line"] ?? ""),
      zip: String(doc["customer_postal_code"] ?? ""),
      city: String(doc["customer_city"] ?? ""),
      country: countryCode(doc["customer_country"] ?? "Deutschland"),
      vatId: String(doc["customer_vat_id"] ?? "").replace(/\s+/g, ""),
      email: String(doc["customer_email"] ?? ""),
    },
    items: items.map((i, idx) => ({
      id: String(i.position || idx + 1),
      name: i.description || "Leistung",
      quantity: Number(i.quantity) || 0,
      unitCode: unitCode(i.unit),
      unitPrice: Number(i.unit_price) || 0,
      lineTotal: (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    })),
  };
}

const RC_REASON = "Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge, § 13b UStG)";

/** XRechnung 3.0 (UBL 2.1 Invoice, EN 16931 konform). */
export function buildXRechnungXml(input: ERechnungInput): string {
  const m = buildModel(input);
  const cat = m.reverseCharge ? "AE" : "S";
  const paymentTerms = m.dueDate ? `Zahlbar ohne Abzug bis ${m.dueDate}` : "";

  const lines = m.items
    .map(
      (i) => `  <cac:InvoiceLine>
    <cbc:ID>${esc(i.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${i.unitCode}">${qty(i.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${dec(i.lineTotal)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(i.name.slice(0, 100))}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${cat}</cbc:ID>
        <cbc:Percent>${dec(m.vatRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">${dec(i.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(m.number)}</cbc:ID>
  <cbc:IssueDate>${m.issueDate}</cbc:IssueDate>
${m.dueDate ? `  <cbc:DueDate>${m.dueDate}</cbc:DueDate>\n` : ""}  <cbc:InvoiceTypeCode>${m.typeCode}</cbc:InvoiceTypeCode>
${m.notes.map((n) => `  <cbc:Note>${esc(n.slice(0, 1000))}</cbc:Note>`).join("\n")}
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(m.buyerReference)}</cbc:BuyerReference>
${
  m.servicePeriod
    ? `  <cac:InvoicePeriod><cbc:Description>${esc(m.servicePeriod)}</cbc:Description></cac:InvoicePeriod>\n`
    : ""
}${
    m.orderNumber
      ? `  <cac:OrderReference><cbc:ID>${esc(m.orderNumber)}</cbc:ID></cac:OrderReference>\n`
      : ""
  }  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(m.seller.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(m.seller.street)}</cbc:StreetName>
        <cbc:CityName>${esc(m.seller.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(m.seller.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${m.seller.country}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
${
  m.seller.vatId
    ? `      <cac:PartyTaxScheme><cbc:CompanyID>${esc(m.seller.vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n`
    : ""
}${
    m.seller.taxNumber
      ? `      <cac:PartyTaxScheme><cbc:CompanyID>${esc(m.seller.taxNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n`
      : ""
  }      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(m.seller.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Name>${esc(m.seller.contact)}</cbc:Name>
        <cbc:Telephone>${esc(m.seller.phone)}</cbc:Telephone>
        <cbc:ElectronicMail>${esc(m.seller.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(m.buyer.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(m.buyer.street)}</cbc:StreetName>
        <cbc:CityName>${esc(m.buyer.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(m.buyer.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${m.buyer.country}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
${
  m.buyer.vatId
    ? `      <cac:PartyTaxScheme><cbc:CompanyID>${esc(m.buyer.vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n`
    : ""
}      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(m.buyer.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
${
  m.buyer.email || m.buyer.contact
    ? `      <cac:Contact><cbc:Name>${esc(m.buyer.contact)}</cbc:Name><cbc:ElectronicMail>${esc(m.buyer.email)}</cbc:ElectronicMail></cac:Contact>\n`
    : ""
}    </cac:Party>
  </cac:AccountingCustomerParty>
${
  m.seller.iban
    ? `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>${esc(m.number)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(m.seller.iban)}</cbc:ID>
      <cbc:Name>${esc(m.seller.name)}</cbc:Name>
${m.seller.bic ? `      <cac:FinancialInstitutionBranch><cbc:ID>${esc(m.seller.bic)}</cbc:ID></cac:FinancialInstitutionBranch>\n` : ""}    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>\n`
    : ""
}${paymentTerms ? `  <cac:PaymentTerms><cbc:Note>${esc(paymentTerms)}</cbc:Note></cac:PaymentTerms>\n` : ""}  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${dec(m.vatAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${dec(m.netTotal)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${dec(m.vatAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${cat}</cbc:ID>
        <cbc:Percent>${dec(m.vatRate)}</cbc:Percent>
${m.reverseCharge ? `        <cbc:TaxExemptionReason>${esc(RC_REASON)}</cbc:TaxExemptionReason>\n` : ""}        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${dec(m.netTotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${dec(m.netTotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${dec(m.grossTotal)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${dec(m.grossTotal)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>
`;
}

/** ZUGFeRD 2.3 / Factur-X (CII, Profil EN 16931 „COMFORT“). */
export function buildZugferdXml(input: ERechnungInput): string {
  const m = buildModel(input);
  const cat = m.reverseCharge ? "AE" : "S";

  const lines = m.items
    .map(
      (i) => `  <ram:IncludedSupplyChainTradeLineItem>
    <ram:AssociatedDocumentLineDocument><ram:LineID>${esc(i.id)}</ram:LineID></ram:AssociatedDocumentLineDocument>
    <ram:SpecifiedTradeProduct><ram:Name>${esc(i.name.slice(0, 100))}</ram:Name></ram:SpecifiedTradeProduct>
    <ram:SpecifiedLineTradeAgreement>
      <ram:NetPriceProductTradePrice><ram:ChargeAmount>${dec(i.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
    </ram:SpecifiedLineTradeAgreement>
    <ram:SpecifiedLineTradeDelivery>
      <ram:BilledQuantity unitCode="${i.unitCode}">${qty(i.quantity)}</ram:BilledQuantity>
    </ram:SpecifiedLineTradeDelivery>
    <ram:SpecifiedLineTradeSettlement>
      <ram:ApplicableTradeTax>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CategoryCode>${cat}</ram:CategoryCode>
        <ram:RateApplicablePercent>${dec(m.vatRate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementLineMonetarySummation>
        <ram:LineTotalAmount>${dec(i.lineTotal)}</ram:LineTotalAmount>
      </ram:SpecifiedTradeSettlementLineMonetarySummation>
    </ram:SpecifiedLineTradeSettlement>
  </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(m.number)}</ram:ID>
    <ram:TypeCode>${m.typeCode}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${cii(m.issueDate)}</udt:DateTimeString></ram:IssueDateTime>
${m.notes.map((n) => `    <ram:IncludedNote><ram:Content>${esc(n.slice(0, 1000))}</ram:Content></ram:IncludedNote>`).join("\n")}
${m.reverseCharge ? `    <ram:IncludedNote><ram:Content>${esc(RC_REASON)}</ram:Content></ram:IncludedNote>\n` : ""}  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(m.buyerReference)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(m.seller.name)}</ram:Name>
        <ram:DefinedTradeContact>
          <ram:PersonName>${esc(m.seller.contact)}</ram:PersonName>
          <ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(m.seller.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>
          <ram:EmailURIUniversalCommunication><ram:URIID>${esc(m.seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(m.seller.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(m.seller.street)}</ram:LineOne>
          <ram:CityName>${esc(m.seller.city)}</ram:CityName>
          <ram:CountryID>${m.seller.country}</ram:CountryID>
        </ram:PostalTradeAddress>
${m.seller.vatId ? `        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(m.seller.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>\n` : ""}${m.seller.taxNumber ? `        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(m.seller.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>\n` : ""}      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(m.buyer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(m.buyer.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(m.buyer.street)}</ram:LineOne>
          <ram:CityName>${esc(m.buyer.city)}</ram:CityName>
          <ram:CountryID>${m.buyer.country}</ram:CountryID>
        </ram:PostalTradeAddress>
${m.buyer.vatId ? `        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(m.buyer.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>\n` : ""}      </ram:BuyerTradeParty>
${m.orderNumber ? `      <ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(m.orderNumber)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>\n` : ""}    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime><udt:DateTimeString format="102">${cii(m.issueDate)}</udt:DateTimeString></ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${
  m.seller.iban
    ? `      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(m.seller.iban)}</ram:IBANID><ram:AccountName>${esc(m.seller.name)}</ram:AccountName></ram:PayeePartyCreditorFinancialAccount>
${m.seller.bic ? `        <ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(m.seller.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>\n` : ""}      </ram:SpecifiedTradeSettlementPaymentMeans>\n`
    : ""
}      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${dec(m.vatAmount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
${m.reverseCharge ? `        <ram:ExemptionReason>${esc(RC_REASON)}</ram:ExemptionReason>\n` : ""}        <ram:BasisAmount>${dec(m.netTotal)}</ram:BasisAmount>
        <ram:CategoryCode>${cat}</ram:CategoryCode>
        <ram:RateApplicablePercent>${dec(m.vatRate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
${
  m.servicePeriod
    ? `      <ram:BillingSpecifiedPeriod><ram:Description>${esc(m.servicePeriod)}</ram:Description></ram:BillingSpecifiedPeriod>\n`
    : ""
}${
    m.dueDate
      ? `      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${cii(m.dueDate)}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>\n`
      : ""
  }      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${dec(m.netTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${dec(m.netTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${dec(m.vatAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${dec(m.grossTotal)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${dec(m.grossTotal)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

function xmpMetadata(number: string, title: string): string {
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aipm.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)} ${esc(number)}</rdf:li></rdf:Alt></dc:title>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
    xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
    <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
    <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
    <pdfaSchema:prefix>fx</pdfaSchema:prefix>
    <pdfaSchema:property><rdf:Seq>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Version of the Factur-X standard</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Factur-X profile</pdfaProperty:description></rdf:li>
    </rdf:Seq></pdfaSchema:property>
   </rdf:li></rdf:Bag></pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Bettet die ZUGFeRD-/Factur-X-XML als Anhang (AFRelationship /Alternative)
 * in das vorhandene Rechnungs-PDF ein – daraus wird eine hybride E-Rechnung.
 */
export async function embedZugferdXml(
  pdfBytes: Uint8Array,
  xml: string,
  meta: { number: string; title: string },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes.slice().buffer as ArrayBuffer);
  const xmlBytes = new TextEncoder().encode(xml);

  pdfDoc.setTitle(`${meta.title} ${meta.number}`);
  pdfDoc.setSubject("ZUGFeRD 2.3 / Factur-X (EN 16931) – hybride E-Rechnung");
  pdfDoc.setKeywords(["ZUGFeRD", "Factur-X", "XRechnung", "EN16931", "E-Rechnung"]);
  pdfDoc.setProducer("HomR");
  pdfDoc.setCreator("HomR");

  await pdfDoc.attach(xmlBytes, "factur-x.xml", {
    mimeType: "text/xml",
    description: "Factur-X/ZUGFeRD Rechnungsdaten (EN 16931)",
    creationDate: new Date(),
    modificationDate: new Date(),
    afRelationship: AFRelationship.Alternative,
  });

  const xmp = xmpMetadata(meta.number, meta.title);
  const stream = pdfDoc.context.stream(xmp, {
    Type: "Metadata",
    Subtype: "XML",
  });
  pdfDoc.catalog.set(PDFName.of("Metadata"), pdfDoc.context.register(stream));
  // PDF/A-3-Kennzeichnung für Archivierung.
  pdfDoc.catalog.set(PDFName.of("Lang"), PDFHexString.fromText("de-DE"));

  return pdfDoc.save();
}

export function downloadXml(xml: string, filename: string) {
  const blob = new Blob(["\uFEFF" + xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Pflichtangaben-Prüfung vor dem Export (EN 16931 / § 14 UStG). */
export function validateERechnung(input: ERechnungInput): string[] {
  const m = buildModel(input);
  const problems: string[] = [];
  if (!m.number) problems.push("Rechnungsnummer fehlt.");
  if (!m.issueDate) problems.push("Rechnungsdatum fehlt.");
  if (!m.seller.street || !m.seller.zip || !m.seller.city)
    problems.push("Anschrift des Rechnungsstellers unvollständig (Einstellungen).");
  if (!m.seller.vatId && !m.seller.taxNumber)
    problems.push("USt-IdNr. oder Steuernummer fehlt (Einstellungen).");
  if (!m.buyer.name || m.buyer.name === "Kunde") problems.push("Kundenname fehlt.");
  if (!m.buyer.street || !m.buyer.zip || !m.buyer.city)
    problems.push("Anschrift des Kunden unvollständig.");
  if (m.reverseCharge && !m.buyer.vatId)
    problems.push("Bei Reverse-Charge ist die USt-IdNr. des Kunden erforderlich.");
  if (m.items.length === 0) problems.push("Es ist keine Position erfasst.");
  return problems;
}
