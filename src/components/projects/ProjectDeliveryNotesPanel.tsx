import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DeliveryNoteEditor } from "@/components/documents/MonthlyDeliveryNotePanel";
import { assertDeliveryNoteComplete } from "@/lib/delivery-note";
import {
  fetchProjectDeliveryNotes,
  saveProjectDeliveryNote,
  removeProjectDeliveryNote,
  attachProjectDeliveryNote,
} from "@/lib/delivery-note-store";
import type { ProjektDetailState } from "./detail/useProjektDetailState";

export function ProjectDeliveryNotesPanel({ state }: { state: ProjektDetailState }) {
  const queryClient = useQueryClient();
  const { project, effectiveProjectAddress, linkedCustomerName } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invoiceChoice, setInvoiceChoice] = useState<Record<string, string>>({});
  const [attaching, setAttaching] = useState("");
  const notes = useQuery({
    queryKey: ["project-delivery-notes", project.id],
    queryFn: () => fetchProjectDeliveryNotes(project.id),
  });
  const settings = useQuery({
    queryKey: ["delivery-company-settings"],
    queryFn: async () => {
      const r = await supabase.from("company_settings").select("*").maybeSingle();
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const invoices = useQuery({
    queryKey: ["project-delivery-invoices", project.id],
    queryFn: async () => {
      const r = await supabase
        .from("documents")
        .select("id,number,issue_date,service_period,customer_id")
        .eq("project_id", project.id)
        .eq("type", "invoice")
        .eq("is_storno", false)
        .is("locked_at", null)
        .is("archived_at", null)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      if (r.error) throw r.error;
      return r.data.filter((d) => d.customer_id === project.customer_id);
    },
  });
  const record = notes.data?.find((n) => n.id === selectedId) ?? null;
  const close = (value: boolean) => {
    if (busy) return;
    if (!value && dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    if (!value) setSelectedId(null);
  };
  const address = [
    effectiveProjectAddress.address_line,
    [effectiveProjectAddress.postal_code, effectiveProjectAddress.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const attach = async (id: string) => {
    const note = notes.data?.find((n) => n.id === id),
      invoiceId = invoiceChoice[id];
    if (!note || !invoiceId) return;
    setAttaching(id);
    try {
      await attachProjectDeliveryNote(note, invoiceId);
      await notes.refetch();
      await queryClient.invalidateQueries({ queryKey: ["delivery-note", invoiceId] });
      toast.success(
        "Lieferschein mit Rechnung verbunden. Die Rechnung enthält ihn jetzt als folgende PDF-Seite.",
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : String((e as { message?: string }).message ?? "Zuordnung fehlgeschlagen."),
      );
    } finally {
      setAttaching("");
    }
  };
  return (
    <section className="surface space-y-4 p-5" id="lieferscheine">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Lieferscheine · Verbrauchsmaterial</h2>
          <p className="text-sm text-muted-foreground">
            Jede Woche Rollen Toilettenpapier, Packungen Handtuchpapier und Liter Seife eintragen.
            Die Monatssummen werden automatisch gebildet. Anschließend unterschreiben und mit der
            passenden Rechnung als eine PDF verbinden.
          </p>
        </div>
        <Button
          disabled={
            notes.isPending || Boolean(notes.error) || settings.isPending || Boolean(settings.error)
          }
          onClick={() => setSelectedId(crypto.randomUUID())}
        >
          <Plus className="size-4" /> Lieferschein erstellen
        </Button>
      </div>
      {(notes.error || settings.error || invoices.error) && (
        <p role="alert" className="text-sm text-destructive">
          {notes.error?.message ?? settings.error?.message ?? invoices.error?.message}
        </p>
      )}
      {notes.isPending ? (
        <p className="text-sm">Lieferscheine werden geladen …</p>
      ) : !notes.data?.length ? (
        <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
          Noch keine Lieferscheine für dieses Objekt. Erstellen Sie den ersten Monatsnachweis.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.data.map((n) => {
            let ready = true;
            try {
              assertDeliveryNoteComplete(n.data, Boolean(n.scan_path));
            } catch {
              ready = false;
            }
            return (
              <div key={n.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {n.data.month} · {n.data.number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {n.document_id
                        ? "Mit Rechnung verbunden"
                        : ready
                          ? "Unterschrieben – bereit zur Abrechnung"
                          : "Entwurf – Mengen oder Unterschriften noch offen"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedId(n.id)}>
                    <FileSignature className="size-4" />
                    {n.document_id ? "Ansehen" : "Öffnen / unterschreiben"}
                  </Button>
                </div>
                {n.document_id ? (
                  <Button asChild variant="link" className="px-0">
                    <Link to="/dokumente/$id" params={{ id: n.document_id }}>
                      Rechnung {n.invoice_number} öffnen · Gesamt-PDF
                    </Link>
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Rechnung für ${n.data.number}`}
                      className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
                      value={invoiceChoice[n.id] ?? ""}
                      onChange={(e) => setInvoiceChoice((v) => ({ ...v, [n.id]: e.target.value }))}
                      disabled={!ready || attaching === n.id}
                    >
                      <option value="">Offene Rechnung dieses Objekts auswählen …</option>
                      {invoices.data?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.number} · {d.service_period || d.issue_date}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={!ready || !invoiceChoice[n.id] || Boolean(attaching)}
                      onClick={() => void attach(n.id)}
                    >
                      Mit Rechnung verbinden
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!invoices.isPending && !invoices.data?.length && (
        <p className="text-xs text-muted-foreground">
          Zur Zuordnung muss eine offene Rechnung mit diesem Objekt und Kunden vorhanden sein. Das
          Objekt wählen Sie in der Rechnung aus.
        </p>
      )}
      <Dialog open={Boolean(selectedId)} onOpenChange={close}>
        <DialogContent
          className="max-h-[95dvh] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto sm:max-w-6xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Monats-Lieferschein · {project.name}</DialogTitle>
            <DialogDescription>
              Der Nachweis bleibt bei diesem Objekt gespeichert und kann später mit einer Rechnung
              verbunden werden.
            </DialogDescription>
          </DialogHeader>
          {selectedId && (
            <DeliveryNoteEditor
              key={`${selectedId}-${record?.version ?? "new"}`}
              record={record}
              state={{
                id: selectedId,
                locked: Boolean(record?.document_id),
                settings: settings.data ?? null,
                persistBeforeOutput: async () => true,
                form: {
                  issue_date: new Date().toISOString().slice(0, 10),
                  order_number: "",
                  customer_company: linkedCustomerName,
                  customer_name: "",
                  customer_address_line: address,
                  customer_postal_code: "",
                  customer_city: "",
                },
              }}
              onDirtyChange={setDirty}
              onBusyChange={setBusy}
              onClose={() => setSelectedId(null)}
              onSaved={() => notes.refetch()}
              onSave={(note, scanPath, version) =>
                saveProjectDeliveryNote(selectedId, project.id, note, scanPath, version)
              }
              onRemove={
                record ? () => removeProjectDeliveryNote(record.id, record.version) : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
