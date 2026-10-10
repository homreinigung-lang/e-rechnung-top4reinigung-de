import { STATUS_LABEL } from "@/lib/format";
import { defaultQuoteIntro } from "@/lib/document-texts";
import { DocumentEditorPanel } from "@/components/documents/DocumentEditorPanel";
import { isDraftPlaceholder } from "@/lib/doc-number";
import { DEFAULT_NET_RATE, UNIT_OPTIONS } from "./shared";
import type { DocumentDetailStateContext } from "./useDocumentDetailState";

export function DocumentEditor({ state }: { state: DocumentDetailStateContext }) {
  const {
    applyIssueMonth,
    data,
    dateCheck,
    discountAmount,
    discountItemPresent,
    discountPercent,
    discountReason,
    doc,
    docNumber,
    editMode,
    form,
    grossTotal,
    isInvoice,
    isOrder,
    isPrivat,
    isQuote,
    isSmallBusiness,
    items,
    itemsTotal,
    locked,
    netTotal,
    pickCustomer,
    quoteRecipientMode,
    reverseChargeAllowed,
    setField,
    setForm,
    setItems,
    setQuoteRecipientMode,
    settings,
    taxMode,
    taxNote,
    updateItem,
    vatAmount,
    vatRate,
  } = state;
  return (
    <DocumentEditorPanel
      locked={locked}
      editMode={editMode}
      docType={doc.type}
      docNumber={docNumber}
      title={{
        isQuote,
        title: String(form["title"] ?? ""),
        onChange: (value) => setField("title", value),
      }}
      tax={{
        taxMode,
        taxNote,
        isSmallBusiness,
        reverseChargeAllowed,
        onTaxModeChange: (value) => setField("tax_mode", value),
      }}
      metadata={{
        isInvoice,
        isOrder,
        isPrivat,
        docNumber,
        isDraftNumber: isDraftPlaceholder(docNumber),
        status: String(form["status"] ?? "draft"),
        orderNumber: String(form["order_number"] ?? ""),
        issueDate: String(form["issue_date"] ?? ""),
        dueDate: String(form["due_date"] ?? ""),
        paidAt: String(form["paid_at"] ?? ""),
        servicePeriod: String(form["service_period"] ?? ""),
        dateCheck,
        statusLabels: STATUS_LABEL,
        onFieldChange: setField,
        onApplyIssueMonth: applyIssueMonth,
      }}
      customer={{
        isQuote,
        isPrivat,
        quoteRecipientMode,
        customerId: String(form["customer_id"] ?? ""),
        projectId: String(form["project_id"] ?? ""),
        customers: data.customers,
        projects: data.projects,
        values: form,
        onQuoteRecipientModeChange: setQuoteRecipientMode,
        onResetProspect: () =>
          setForm((current) => ({
            ...current,
            customer_id: null,
            project_id: null,
            customer_number: "",
          })),
        onPickCustomer: pickCustomer,
        onFieldChange: setField,
      }}
      positions={{
        items,
        unitOptions: UNIT_OPTIONS,
        defaultNetRate: DEFAULT_NET_RATE,
        vatRate,
        onItemsChange: setItems,
        onUpdateItem: updateItem,
      }}
      totals={{
        discountItemPresent,
        discountPercent,
        discountPercentValue: String(form["discount_percent"] ?? "0"),
        discountReason,
        itemsTotal,
        discountAmount,
        netTotal,
        vatRate,
        vatAmount,
        grossTotal,
        onDiscountPercentChange: (value) => setField("discount_percent", value),
        onDiscountReasonChange: (value) => setField("discount_reason", value),
      }}
      text={{
        isQuote,
        isInvoice,
        isPrivat,
        companyName: String(settings?.["company_name"] ?? ""),
        introText: String(form["intro_text"] ?? ""),
        notes: String(form["notes"] ?? ""),
        serviceDescription: String(form["service_description"] ?? ""),
        defaultQuoteIntro,
        onIntroChange: (value) => setField("intro_text", value),
        onNotesChange: (value) => setField("notes", value),
        onServiceDescriptionChange: (value) => setField("service_description", value),
      }}
    />
  );
}
