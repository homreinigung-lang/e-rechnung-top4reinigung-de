import { DocumentPrintPreview } from "@/components/documents/DocumentPrintPreview";
import { OPTIONAL_NOTE } from "./shared";
import type { DocumentDetailStateContext } from "./useDocumentDetailState";

export function DocumentPreview({ state }: { state: DocumentDetailStateContext }) {
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
    logoSrc,
    netTotal,
    paymentTermsDays,
    regularTotal,
    senderLine,
    settings,
    taxNote,
    vatAmount,
    vatRate,
  } = state;
  return (
    <DocumentPrintPreview
      cancelledBy={cancelledBy}
      isStorno={isStorno}
      logoSrc={logoSrc}
      settings={settings}
      senderLine={senderLine}
      isPrivat={isPrivat}
      form={form}
      isInvoice={isInvoice}
      isOrder={isOrder}
      isQuote={isQuote}
      docType={doc.type}
      docNumber={docNumber}
      items={items}
      introText={introText}
      hasOptionalItems={hasOptionalItems}
      regularTotal={regularTotal}
      optionalNote={OPTIONAL_NOTE}
      discountPercent={discountPercent}
      discountReason={discountReason}
      itemsTotal={itemsTotal}
      discountAmount={discountAmount}
      netTotal={netTotal}
      vatRate={vatRate}
      vatAmount={vatAmount}
      grossTotal={grossTotal}
      taxNote={taxNote}
      paymentTermsDays={paymentTermsDays}
      epc={epc}
    />
  );
}
