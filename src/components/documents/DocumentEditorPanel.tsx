import type { ComponentProps } from "react";
import { DOC_TYPE_LABEL } from "@/lib/format";
import { DocumentTitleEditor } from "@/components/documents/DocumentTitleEditor";
import { DocumentTaxEditor } from "@/components/documents/DocumentTaxEditor";
import { DocumentMetadataEditor } from "@/components/documents/DocumentMetadataEditor";
import { DocumentCustomerEditor } from "@/components/documents/DocumentCustomerEditor";
import { DocumentPositionsEditor } from "@/components/documents/DocumentPositionsEditor";
import { DocumentTotalsEditor } from "@/components/documents/DocumentTotalsEditor";
import { DocumentTextEditor } from "@/components/documents/DocumentTextEditor";

type DocumentEditorPanelProps = {
  locked: boolean;
  editMode: boolean;
  docType: string;
  docNumber: string;
  title: ComponentProps<typeof DocumentTitleEditor>;
  tax: ComponentProps<typeof DocumentTaxEditor>;
  metadata: ComponentProps<typeof DocumentMetadataEditor>;
  customer: ComponentProps<typeof DocumentCustomerEditor>;
  positions: ComponentProps<typeof DocumentPositionsEditor>;
  totals: ComponentProps<typeof DocumentTotalsEditor>;
  text: ComponentProps<typeof DocumentTextEditor>;
};

export function DocumentEditorPanel({
  locked,
  editMode,
  docType,
  docNumber,
  title,
  tax,
  metadata,
  customer,
  positions,
  totals,
  text,
}: DocumentEditorPanelProps) {
  return (
    <fieldset
      disabled={locked}
      hidden={!editMode}
      className="no-print surface space-y-6 p-6 disabled:opacity-90"
    >
      <h2 className="font-display text-xl font-semibold">
        {DOC_TYPE_LABEL[docType as keyof typeof DOC_TYPE_LABEL]} {docNumber}{" "}
        {locked ? "(schreibgeschützt)" : "bearbeiten"}
      </h2>
      <DocumentTitleEditor {...title} />
      <DocumentTaxEditor {...tax} />
      <DocumentMetadataEditor {...metadata} />
      <DocumentCustomerEditor {...customer} />
      <div className="space-y-3">
        <DocumentPositionsEditor {...positions} />
        <DocumentTotalsEditor {...totals} />
      </div>
      <DocumentTextEditor {...text} />
    </fieldset>
  );
}
