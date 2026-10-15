import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureOfficialNumber } from "@/lib/doc-number";
import { formatDate, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { DocumentDetailStateContext } from "./detail/useDocumentDetailState";

export function SupplementPanel({ state }: { state: DocumentDetailStateContext }) {
  const { docRecord: doc, id, queryClient, save, editMode, locked } = state;
  const navigate = useNavigate();
  const parentId = String(doc["parent_order_id"] ?? "");
  const isSupplement = Boolean(parentId) && doc["type"] === "quote";
  const isOriginalOrder = doc["type"] === "order" && !parentId;
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [note, setNote] = useState("");
  const orderId = isOriginalOrder ? id : parentId;
  const {
    data: supplements = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["supplements", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id,number,title,status,net_total,approved_at,completed_at,converted_document_id")
        .eq("parent_order_id", orderId)
        .eq("type", "quote")
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const { data: parent } = useQuery({
    queryKey: ["supplement_parent", parentId],
    enabled: Boolean(parentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id,number")
        .eq("id", parentId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["document", id] }),
      queryClient.invalidateQueries({ queryKey: ["documents"] }),
      queryClient.invalidateQueries({ queryKey: ["supplements", orderId] }),
    ]);
  };
  const action = useMutation({
    mutationFn: async (kind: "create" | "approve" | "complete" | "invoice") => {
      if (kind === "create") {
        if (!locked && editMode) await save.mutateAsync();
        await ensureOfficialNumber(id);
        const { data, error } = await supabase.rpc("create_supplement", { _order_id: id });
        if (error) throw error;
        return data;
      }
      if (kind === "approve") {
        await save.mutateAsync();
        await ensureOfficialNumber(id);
        const { error } = await supabase.rpc("approve_supplement", { _id: id, _note: note.trim() });
        if (error) throw error;
      } else if (kind === "complete") {
        const { error } = await supabase.rpc("complete_supplement", { _id: id });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc("invoice_supplement", { _id: id });
        if (error) throw error;
        return data;
      }
      return null;
    },
    onSuccess: async (newId, kind) => {
      if (kind === "approve") {
        state.setForm((form) => ({ ...form, status: "accepted" }));
        state.setEditMode(false);
      }
      setApprovalOpen(false);
      setNote("");
      await refresh();
      toast.success(
        kind === "approve"
          ? "Kundenfreigabe dokumentiert"
          : kind === "complete"
            ? "Ausführung dokumentiert"
            : kind === "invoice"
              ? "Nachtragsrechnung erstellt"
              : "Nachtragsangebot erstellt",
      );
      if (newId)
        navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!isOriginalOrder && !parentId) return null;
  const approved = Boolean(doc["approved_at"]);
  const completed = Boolean(doc["completed_at"]);
  const invoiceId = String(doc["converted_document_id"] ?? "");
  const approvedNet = supplements
    .filter((s) => s.approved_at)
    .reduce((sum, s) => sum + Number(s.net_total), 0);
  const status = invoiceId
    ? "Abgerechnet"
    : completed
      ? "Ausgeführt"
      : approved
        ? "Freigegeben"
        : doc["status"] === "declined"
          ? "Abgelehnt"
          : "Freigabe ausstehend";
  return (
    <section className="surface no-print space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {isOriginalOrder ? "Nachträge zum Auftrag" : "Auftragsbezug"}
        </h2>
        {isOriginalOrder && doc["status"] !== "cancelled" && (
          <Button disabled={action.isPending} onClick={() => action.mutate("create")}>
            Nachtrag erstellen
          </Button>
        )}
      </div>
      {parentId && (
        <p className="text-sm">
          Ursprünglicher Auftrag:{" "}
          <Link className="underline" to="/dokumente/$id" params={{ id: parentId }}>
            {parent?.number || String(doc["order_number"] || "Auftrag öffnen")}
          </Link>
        </p>
      )}
      {isSupplement && (
        <>
          <p className="font-medium">{status}</p>
          {approved && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              Freigabe am {formatDate(String(doc["approved_at"]).slice(0, 10))}:{" "}
              {String(doc["approval_note"])}. Leistungen und Preis sind gespeichert.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!approved && ["draft", "sent"].includes(String(doc["status"])) && (
              <Button disabled={action.isPending} onClick={() => setApprovalOpen(true)}>
                Kundenfreigabe dokumentieren
              </Button>
            )}
            {approved && !completed && (
              <Button disabled={action.isPending} onClick={() => action.mutate("complete")}>
                Als ausgeführt markieren
              </Button>
            )}
            {completed && !invoiceId && (
              <Button disabled={action.isPending} onClick={() => action.mutate("invoice")}>
                Nachtrag in Rechnung übernehmen
              </Button>
            )}
            {invoiceId && (
              <Button asChild variant="outline">
                <Link to="/dokumente/$id" params={{ id: invoiceId }}>
                  Nachtragsrechnung öffnen
                </Link>
              </Button>
            )}
          </div>
        </>
      )}
      {isOriginalOrder && (
        <>
          {error ? (
            <p role="alert" className="text-destructive">
              Nachträge konnten nicht geladen werden: {error.message}
            </p>
          ) : isPending ? (
            <p>Nachträge werden geladen…</p>
          ) : (
            <>
              <p className="text-sm">
                Belegwerte netto: {formatMoney(Number(doc["net_total"] ?? 0))} Auftrag +{" "}
                {formatMoney(approvedNet)} freigegebene Nachträge ={" "}
                {formatMoney(Number(doc["net_total"] ?? 0) + approvedNet)}
              </p>
              {supplements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Nachträge vorhanden.</p>
              ) : (
                <ul className="divide-y">
                  {supplements.map((s) => (
                    <li key={s.id} className="flex flex-wrap justify-between gap-2 py-3">
                      <Link className="underline" to="/dokumente/$id" params={{ id: s.id }}>
                        {s.number} · {s.title}
                      </Link>
                      <span>
                        {formatMoney(s.net_total)} ·{" "}
                        {s.converted_document_id
                          ? "Abgerechnet"
                          : s.completed_at
                            ? "Ausgeführt"
                            : s.approved_at
                              ? "Freigegeben"
                              : s.status === "declined"
                                ? "Abgelehnt"
                                : "Freigabe ausstehend"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kundenfreigabe dokumentieren</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Bestätigen Sie die bereits erhaltene Zustimmung des Kunden. Danach bleiben Leistungen
            und Preis dieses Nachtrags unverändert.
          </p>
          <Label htmlFor="supplement-evidence">Nachweis / Ansprechpartner / Datum</Label>
          <Textarea
            id="supplement-evidence"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Freigabe per E-Mail am 15.10.2026 durch Frau Müller"
          />
          <DialogFooter>
            <Button
              disabled={action.isPending || note.trim().length < 3}
              onClick={() => action.mutate("approve")}
            >
              Freigabe speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
