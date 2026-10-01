import { defaultQuoteIntro } from "@/lib/document-texts";

type DocumentDetailData = {
  doc: unknown;
  settings: unknown;
};

export function buildInitialDocumentForm(data: DocumentDetailData) {
  const d = data.doc as Record<string, unknown>;
  const form: Record<string, string | boolean | null> = {
    number: String(d["number"] ?? ""),
    order_number: String(d["order_number"] ?? ""),
    status: String(d["status"] ?? "draft"),
    issue_date: String(d["issue_date"] ?? ""),
    due_date: (d["due_date"] as string) ?? "",
    service_period: String(d["service_period"] ?? ""),
    tax_mode: String(d["tax_mode"] ?? "eu_reverse_charge"),
    customer_id: (d["customer_id"] as string) ?? null,
    project_id: (d["project_id"] as string) ?? null,
    customer_type: String(d["customer_type"] ?? "firma"),
    customer_number: String(d["customer_number"] ?? ""),
    customer_name: String(d["customer_name"] ?? ""),
    customer_company: String(d["customer_company"] ?? ""),
    customer_email: String(d["customer_email"] ?? ""),
    customer_phone: String(d["customer_phone"] ?? ""),
    customer_address_line: String(d["customer_address_line"] ?? ""),
    customer_postal_code: String(d["customer_postal_code"] ?? ""),
    customer_city: String(d["customer_city"] ?? ""),
    customer_country: String(d["customer_country"] ?? ""),
    customer_vat_id: String(d["customer_vat_id"] ?? ""),
    intro_text:
      String(d["intro_text"] ?? "") ||
      (String(d["type"] ?? "") === "quote"
        ? defaultQuoteIntro(
            String(d["customer_type"] ?? "firma") === "privat",
            String((data.settings as Record<string, unknown> | null)?.["company_name"] ?? ""),
          )
        : ""),
    title: String(d["title"] ?? ""),
    service_description: String(d["service_description"] ?? ""),
    discount_percent: String(d["discount_percent"] ?? "0"),
    discount_reason: String(d["discount_reason"] ?? ""),
    notes: String(d["notes"] ?? ""),
    attachment_title: String(d["attachment_title"] ?? ""),
    attachment_text: String(d["attachment_text"] ?? ""),
  };
  return form;
}
