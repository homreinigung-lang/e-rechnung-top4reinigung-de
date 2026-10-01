import {
  ArrowRightLeft,
  BadgeEuro,
  Ban,
  BellRing,
  CalendarRange,
  Check,
  Copy,
  FileCode2,
  FileDown,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type DocumentWorkflowActionsProps = {
  editMode: boolean;
  isInvoice: boolean;
  isStorno: boolean;
  isQuote: boolean;
  isOrder: boolean;
  locked: boolean;
  status: string;
  paidAt: string;
  convertedId: string | null;
  projectId: unknown;
  documentNumber: string;
  autoSavedAt: string;
  reminderLevel: number;
  canMahnen: boolean;
  plannedHoursMonth: number;
  plannedVisitsMonth: number;
  duplicatePending: boolean;
  markPaidPending: boolean;
  unmarkPaidPending: boolean;
  reminderPending: boolean;
  planningPending: boolean;
  convertPending: boolean;
  quoteToInvoicePending: boolean;
  removePending: boolean;
  savePending: boolean;
  stornoPending: boolean;
  cancelledBy: unknown;
  onDuplicate: () => void;
  onExportXRechnung: () => void;
  onExportZugferd: () => void;
  onOpenPayment: () => void;
  onUnmarkPaid: () => void;
  onReminder: () => void;
  onMahnung: () => void;
  onAcceptQuote: () => void;
  onDeclineQuote: () => void;
  onPreparePlanning: () => void;
  onConvert: () => void;
  onQuoteToInvoice: () => void;
  onRemoveOrder: () => void;
  onSave: () => void;
  onOpenStorno: () => void;
  formatDate: (value: string) => string;
  mahnLabel: (level: number) => string;
};

export function DocumentWorkflowActions(props: DocumentWorkflowActionsProps) {
  return (
    <div className="no-print flex flex-wrap items-center justify-end gap-2">
      {props.editMode && (
        <>
          <Button variant="outline" onClick={props.onDuplicate} disabled={props.duplicatePending}>
            <Copy className="size-4" /> Duplizieren
          </Button>
          {props.isInvoice && (
            <>
              <Button variant="outline" onClick={props.onExportXRechnung}>
                <FileCode2 className="size-4" /> XRechnung (XML)
              </Button>
              <Button variant="outline" onClick={props.onExportZugferd}>
                <FileDown className="size-4" /> ZUGFeRD-PDF
              </Button>
            </>
          )}
        </>
      )}

      {props.isInvoice && !props.isStorno && props.status !== "paid" && props.status !== "cancelled" && (
        <Button variant="outline" onClick={props.onOpenPayment} disabled={props.markPaidPending}>
          <BadgeEuro className="size-4" /> Als bezahlt markieren
        </Button>
      )}
      {props.isInvoice && props.status === "paid" && (
        <>
          <span className="rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            Bezahlt{props.paidAt ? ` am ${props.formatDate(props.paidAt)}` : ""}
          </span>
          <Button variant="outline" onClick={props.onUnmarkPaid} disabled={props.unmarkPaidPending}>
            <BadgeEuro className="size-4" /> Zahlung zurücknehmen
          </Button>
        </>
      )}

      {props.isInvoice && !props.isStorno && props.status !== "paid" && props.status !== "cancelled" && props.status !== "draft" && (
        <>
          <Button variant="outline" onClick={props.onReminder} disabled={props.reminderPending}>
            <BellRing className="size-4" /> Zahlungserinnerung
          </Button>
          <Button
            variant="outline"
            onClick={props.onMahnung}
            disabled={props.reminderPending || !props.canMahnen}
            title={props.canMahnen ? undefined : "Erst möglich, wenn die Zahlungsfrist (14 Tage) vollständig abgelaufen ist."}
          >
            <BellRing className="size-4" />
            {props.reminderLevel > 1 ? `${props.mahnLabel(props.reminderLevel)} · nächste Stufe` : "Mahnung"}
          </Button>
        </>
      )}

      {props.isQuote && (
        <>
          {props.status !== "accepted" && props.status !== "declined" && (
            <>
              <Button variant="outline" onClick={props.onAcceptQuote}>
                <Check className="size-4" /> Angebot annehmen
              </Button>
              <Button variant="outline" onClick={props.onDeclineQuote}>
                <X className="size-4" /> Angebot ablehnen
              </Button>
            </>
          )}
          {props.status === "accepted" && (
            <Button
              variant="outline"
              onClick={props.onPreparePlanning}
              disabled={props.planningPending || props.plannedHoursMonth <= 0 || props.plannedVisitsMonth <= 0}
              title={
                props.plannedHoursMonth > 0 && props.plannedVisitsMonth > 0
                  ? props.projectId
                    ? "Vorhandenes Objekt in die Einsatzplanung übernehmen"
                    : "Objekt aus dem angenommenen Angebot anlegen und Einsatzplanung vorbereiten"
                  : "Keine Planungswerte vorhanden – bitte Angebot aus einer aktuellen Kalkulation erstellen."
              }
            >
              <CalendarRange className="size-4" />
              {props.projectId ? "Einsatzplanung vorbereiten" : "Objekt anlegen & Einsatzplanung vorbereiten"}
            </Button>
          )}
          {!props.convertedId && props.status === "accepted" && (
            <>
              <Button variant="outline" onClick={props.onConvert} disabled={props.convertPending}>
                <ArrowRightLeft className="size-4" /> Auftragsbestätigung erstellen
              </Button>
              <Button onClick={props.onQuoteToInvoice} disabled={props.quoteToInvoicePending} title="Einmalige Dienstleistung direkt abrechnen">
                <ArrowRightLeft className="size-4" /> In Rechnung umwandeln
              </Button>
            </>
          )}
        </>
      )}

      {props.isOrder && !props.convertedId && (
        <Button onClick={props.onConvert} disabled={props.convertPending}>
          <ArrowRightLeft className="size-4" /> In Rechnung umwandeln
        </Button>
      )}

      {props.isOrder && !props.locked && (
        <Button variant="destructive" onClick={props.onRemoveOrder} disabled={props.removePending}>
          <Trash2 className="size-4" /> Löschen
        </Button>
      )}

      {!props.locked && props.editMode && (
        <>
          <span className="text-xs text-muted-foreground">
            {props.autoSavedAt ? `Automatisch gespeichert um ${props.autoSavedAt} Uhr` : "Änderungen werden automatisch gespeichert"}
          </span>
          <Button variant="outline" onClick={props.onSave} disabled={props.savePending}>
            <Save className="size-4" /> Speichern
          </Button>
        </>
      )}

      {props.locked && props.isInvoice && !props.isStorno && !props.cancelledBy && (
        <Button variant="destructive" onClick={props.onOpenStorno} disabled={props.stornoPending}>
          <Ban className="size-4" /> Stornorechnung
        </Button>
      )}
    </div>
  );
}
