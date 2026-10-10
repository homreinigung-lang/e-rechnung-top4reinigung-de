import { Button, buttonVariants } from "@/components/ui/button";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import { FileUploadButton } from "@/components/FileUploadButton";

import { receiptFileToPdf } from "@/lib/receipt-pdf";
import { downloadStoredFile } from "@/lib/storage";

import { Download, Eye, Trash2 } from "lucide-react";
import { type ExpenseRowData } from "./shared";

export function ExpenseRow({
  row: r,
  onDelete,
  onPreview,
  onAttach,
}: {
  row: ExpenseRowData;
  onDelete: () => void;
  onPreview: (path: string) => void;
  onAttach: (path: string) => Promise<unknown>;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-4">
      <div className="flex-1">
        <div className="font-medium">{r.supplier || "Ohne Lieferant"}</div>
        <div className="text-sm text-muted-foreground">
          {formatDate(r.expense_date)} · {r.category}
          {r.document_number ? ` · ${r.document_number}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div className="font-medium">{formatMoney(Number(r.gross_amount))}</div>
        <div className="text-xs text-muted-foreground">
          netto {formatMoney(Number(r.net_amount))}
        </div>
      </div>
      <FileUploadButton
        folder="belege"
        accept=".pdf,application/pdf,image/*"
        label={r.receipt_url ? "Beleg ersetzen" : "Beleg hinzufügen"}
        prepareFile={async (file) =>
          file.type.startsWith("image/")
            ? receiptFileToPdf(file, {
                date: r.expense_date,
                category: r.category,
                ...(r.supplier ? { supplier: r.supplier } : {}),
              })
            : file
        }
        onUploaded={async (path) => {
          await onAttach(path);
        }}
        showSuccessToast={false}
      />
      {r.receipt_url && (
        <>
          <Button
            variant="ghost"
            size="icon"
            title="Beleg ansehen"
            onClick={() => onPreview(r.receipt_url)}
          >
            <Eye className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Beleg herunterladen"
            onClick={() =>
              void downloadStoredFile(r.receipt_url).catch(() =>
                toast.error("Beleg konnte nicht geladen werden."),
              )
            }
          >
            <Download className="size-4" />
          </Button>
        </>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ausgabe wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Die Ausgabe „${r.supplier || "ohne Lieferant"}" vom ${formatDate(
                r.expense_date,
              )} wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={onDelete}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
