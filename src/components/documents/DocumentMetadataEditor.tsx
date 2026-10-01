import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeField } from "@/components/DateRangeField";

type DateCheck = { message?: string | null; level?: string | null };

type DocumentMetadataEditorProps = {
  isInvoice: boolean;
  isOrder: boolean;
  isPrivat: boolean;
  docNumber: string;
  isDraftNumber: boolean;
  status: string;
  orderNumber: string;
  issueDate: string;
  dueDate: string;
  paidAt: string;
  servicePeriod: string;
  dateCheck: DateCheck;
  statusLabels: Record<string, string>;
  onFieldChange: (key: string, value: string | boolean | null) => void;
  onApplyIssueMonth: () => void;
};

export function DocumentMetadataEditor({
  isInvoice, isOrder, isPrivat, docNumber, isDraftNumber, status, orderNumber,
  issueDate, dueDate, paidAt, servicePeriod, dateCheck, statusLabels,
  onFieldChange, onApplyIssueMonth,
}: DocumentMetadataEditorProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="number">{isInvoice ? "Rechnungsnummer" : isOrder ? "Auftragsnummer" : "Angebotsnummer"} (automatisch)</Label>
        <Input id="number" value={docNumber} readOnly disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">
          {isDraftNumber
            ? "Vorschau-/Testnummer. Die endgültige, fortlaufende Nummer wird erst beim Festschreiben bzw. Versenden vergeben – so entstehen keine Lücken (§ 14 UStG / GoBD)."
            : "Wird automatisch fortlaufend und lückenlos vergeben (§ 14 UStG / GoBD) – eine manuelle Änderung ist nicht möglich."}
        </p>
      </div>
      {!isPrivat && (
        <div className="space-y-2">
          <Label htmlFor="order_number">Bestellnummer des Kunden</Label>
          <Input id="order_number" placeholder="z. B. SGS-PO-123456" value={orderNumber} onChange={(event) => onFieldChange("order_number", event.target.value)} />
        </div>
      )}
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={(value) => onFieldChange("status", value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(isInvoice ? ["draft", "sent", "paid", "cancelled"] : ["draft", "sent", "accepted", "declined"]).map((value) => (
              <SelectItem key={value} value={value}>{statusLabels[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Rechnungsdatum</Label>
        <Input type="date" value={issueDate} onChange={(event) => onFieldChange("issue_date", event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{isInvoice ? "Fällig am" : "Gültig bis (optional)"}</Label>
        <div className="flex items-center gap-2">
          <Input type="date" value={dueDate} onChange={(event) => onFieldChange("due_date", event.target.value)} />
          {!isInvoice && dueDate ? <Button type="button" variant="ghost" size="sm" onClick={() => onFieldChange("due_date", "")}>Löschen</Button> : null}
        </div>
        {!isInvoice && <p className="text-xs text-muted-foreground">Ohne Datum wird „Gültig bis“ nicht auf dem Angebot angezeigt.</p>}
      </div>
      {isInvoice && (
        <div className="space-y-2">
          <Label>Zahlungsdatum (bezahlt am)</Label>
          <Input type="date" value={paidAt} onChange={(event) => onFieldChange("paid_at", event.target.value || null)} />
          <p className="text-xs text-muted-foreground">Sobald ein Zahlungsdatum eingetragen ist, wechselt der Status automatisch auf „Bezahlt" und die Rechnung verlässt die offenen Posten.</p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="service_period">Leistungszeitraum / Lieferdatum</Label>
        <DateRangeField value={servicePeriod} onChange={(value) => onFieldChange("service_period", value)} placeholder="Zeitraum im Kalender wählen" />
        {isInvoice ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onApplyIssueMonth}>Monat des Rechnungsdatums übernehmen</Button>
            {dateCheck.message ? <p className={dateCheck.level === "error" ? "text-xs text-destructive" : "text-xs text-amber-600 dark:text-amber-500"}>{dateCheck.message}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
