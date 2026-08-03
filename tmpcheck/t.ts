import { buildXRechnungXml, buildZugferdXml, validateERechnung } from "../src/lib/erechnung";
const input = {
  doc: { number:"RE-2026-0001", issue_date:"2026-08-03", due_date:"2026-08-17", tax_mode:"eu_reverse_charge", order_number:"SGS-PO-1", customer_company:"SGS SA", customer_address_line:"Rue 1", customer_postal_code:"1200", customer_city:"Genf", customer_country:"Frankreich", customer_vat_id:"FR123", intro_text:"Reinigung" },
  items: [{position:1,description:"Industriereinigung",quantity:10,unit:"Std.",unit_price:35}],
  settings: { company_name:"Hom Reinigung Service", address_line:"Poststr 8", postal_code:"66333", city:"Völklingen", country:"Deutschland", vat_id:"DE458492078", tax_number:"040/200/01653", iban:"DE05590501010067221028", bic:"SAKSDE55XXX", email:"info@x.de" },
  netTotal:350, vatAmount:0, grossTotal:350, vatRate:0, number:"RE-2026-0001",
};
console.log(validateERechnung(input));
const a = buildXRechnungXml(input), b = buildZugferdXml(input);
console.log(a.slice(0,600));
console.log("---");
console.log(b.slice(0,400));
