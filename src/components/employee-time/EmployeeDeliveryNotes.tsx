import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeliverySignatureDialog } from "@/components/documents/DeliverySignatureDialog";
import {
  blankDeliveryNote,
  deliveryNoteSchema,
  deliveryMonthlyTotals,
  MATERIALS,
  type DeliveryNote,
  type DeliverySignature,
} from "@/lib/delivery-note";

type SavedNote = { id: string; data: DeliveryNote; version: number; scan_path: string | null };

/** Shares the object's source record; employees never receive invoice data. */
export function EmployeeDeliveryNotes({
  projectId,
  ownerId,
  address,
  date,
}: {
  projectId: string;
  ownerId: string;
  address: string;
  date: string;
}) {
  const client = useQueryClient();
  const key = ["employee-delivery-notes", projectId, date.slice(0, 7)];
  const notes = useQuery({
    queryKey: key,
    queryFn: async (): Promise<SavedNote[]> => {
      const r = await supabase
        .from("project_delivery_notes")
        .select("id,data,version,scan_path")
        .eq("project_id", projectId)
        .eq("data->>month", date.slice(0, 7))
        .order("created_at", { ascending: false });
      if (r.error) throw r.error;
      return (r.data ?? []).map((n) => ({ ...n, data: deliveryNoteSchema.parse(n.data) }));
    },
  });
  const [draft, setDraft] = useState<{
    id: string;
    data: DeliveryNote;
    version: number | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<number | "customerSignature" | null>(null);
  const [dirty, setDirty] = useState(false);
  const start = () => {
    const id = crypto.randomUUID();
    setDraft({ id, version: null, data: blankDeliveryNote(id, date, "", address) });
    setDirty(true);
  };
  const save = async (data: DeliveryNote) => {
    if (!draft || busy) return;
    const parsed = deliveryNoteSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message);
      return;
    }
    setBusy(true);
    try {
      const result =
        draft.version === null
          ? await supabase
              .from("project_delivery_notes")
              .insert({ id: draft.id, project_id: projectId, user_id: ownerId, data: parsed.data })
              .select("version")
              .single()
          : await supabase
              .from("project_delivery_notes")
              .update({ data: parsed.data })
              .eq("id", draft.id)
              .eq("version", draft.version)
              .select("version")
              .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data)
        throw new Error("Lieferschein wurde zwischenzeitlich geändert. Bitte neu öffnen.");
      setDraft({ ...draft, data: parsed.data, version: result.data.version });
      setDirty(false);
      setTarget(null);
      toast.success("Lieferung im Objekt gespeichert.");
      await client.invalidateQueries({ queryKey: ["employee-delivery-notes", projectId] });
      await client.invalidateQueries({ queryKey: ["project-delivery-notes", projectId] });
    } catch (e) {
      toast.error(
        (e as { message?: string }).message ??
          "Speichern fehlgeschlagen. Ihre Eingaben bleiben geöffnet.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sign = (signature: DeliverySignature) => {
    if (!draft || target === null) return;
    void save({
      ...draft.data,
      ...(target === "customerSignature"
        ? { customerSignature: signature }
        : { rows: draft.data.rows.map((r, i) => (i === target ? { ...r, signature } : r)) }),
    });
  };
  const totals = draft ? deliveryMonthlyTotals(draft.data) : null;
  return (
    <section className="space-y-3 rounded-md border p-3">
      <h3 className="font-semibold">Lieferschein · Verbrauchsmaterial</h3>
      <p className="text-sm text-muted-foreground">
        Wochenmengen eintragen. Anschließend dem Bauleiter vor Ort die Mengen zeigen und auf diesem
        Gerät unterschreiben lassen.
      </p>
      {notes.error && (
        <p role="alert" className="text-sm text-destructive">
          Lieferscheine konnten nicht geladen werden.
        </p>
      )}
      {!draft ? (
        <div className="space-y-2">
          {notes.data?.map((n) => (
            <Button
              key={n.id}
              variant="outline"
              className="h-auto w-full whitespace-normal"
              disabled={Boolean(n.scan_path)}
              onClick={() => {
                setDraft(n);
                setDirty(false);
              }}
            >
              {n.data.number} · {n.data.month}
              {n.scan_path ? " · Papierfassung – Verwaltung kontaktieren" : " · Öffnen"}
            </Button>
          ))}
          <Button disabled={notes.isPending || Boolean(notes.error)} onClick={start}>
            Monats-Lieferschein erstellen
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {draft.data.number} · {draft.data.month}
          </p>
          {draft.data.quantityMode !== "individual" ? (
            <p>Älterer Lieferschein – bitte Verwaltung kontaktieren.</p>
          ) : (
            draft.data.rows.map((row, index) => {
              const locked =
                busy ||
                Boolean(
                  row.signature || draft.data.supplierSignature || draft.data.customerSignature,
                );
              return (
                <div key={index} className="space-y-2 rounded border p-3">
                  <h4 className="font-medium">Woche {index + 1}</h4>
                  <label className="block text-sm">
                    Lieferdatum
                    <Input
                      type="date"
                      aria-label={`Lieferdatum Woche ${index + 1}`}
                      value={row.date}
                      disabled={locked}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          data: {
                            ...draft.data,
                            rows: draft.data.rows.map((r, i) =>
                              i === index ? { ...r, date: e.target.value } : r,
                            ),
                          },
                        });
                        setDirty(true);
                      }}
                    />
                  </label>
                  {MATERIALS.map((m) => (
                    <label key={m.key} className="block text-sm">
                      {m.label} (
                      {m.key === "toiletPaper"
                        ? "Rollen"
                        : m.key === "handTowels"
                          ? "Packungen"
                          : "Liter"}
                      )
                      <Input
                        inputMode="decimal"
                        value={row[m.key]}
                        disabled={locked}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            data: {
                              ...draft.data,
                              rows: draft.data.rows.map((r, i) =>
                                i === index ? { ...r, [m.key]: e.target.value } : r,
                              ),
                            },
                          });
                          setDirty(true);
                        }}
                      />
                    </label>
                  ))}
                  {row.signature ? (
                    <div>
                      <img
                        src={row.signature.image}
                        alt="Unterschrift Bauleiter"
                        className="h-16 max-w-full object-contain"
                      />
                      <p className="text-xs">Bestätigt: {row.signature.name}</p>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={locked || !row.date}
                      onClick={() => setTarget(index)}
                    >
                      Bauleiter unterschreiben lassen
                    </Button>
                  )}
                </div>
              );
            })
          )}
          {totals && (
            <p className="text-sm font-medium">
              Monatssumme: {totals.toiletPaper} Kartons Toilettenpapier · {totals.handTowels}{" "}
              Kartons Handtuchpapier · {totals.soap} Kanister Seife
            </p>
          )}
          {draft.data.customerSignature ? (
            <div className="rounded border p-3">
              <p className="font-medium">Bauleiter · Monatsende</p>
              <img
                src={draft.data.customerSignature.image}
                alt="Monatsunterschrift Bauleiter"
                className="h-16 max-w-full object-contain"
              />
              <p className="text-xs">Bestätigt: {draft.data.customerSignature.name}</p>
            </div>
          ) : (
            <Button
              variant="outline"
              disabled={
                busy ||
                draft.version === null ||
                draft.data.quantityMode !== "individual" ||
                !totals ||
                !Object.values(totals).some((v) => v > 0)
              }
              onClick={() => setTarget("customerSignature")}
            >
              Bauleiter: Monatsabschluss unterschreiben
            </Button>
          )}
          {dirty && (
            <p role="status" className="text-sm text-amber-700">
              Änderungen noch nicht gespeichert.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || draft.data.quantityMode !== "individual"}
              onClick={() => void save(draft.data)}
            >
              Lieferschein speichern
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!dirty || window.confirm("Ungespeicherte Änderungen verwerfen?"))
                  setDraft(null);
              }}
            >
              Zurück zur Liste
            </Button>
          </div>
        </div>
      )}
      {target !== null && (
        <DeliverySignatureDialog
          title={
            target === "customerSignature"
              ? "Bauleiter · Monatsabschluss bestätigen"
              : `Bauleiter · Woche ${target + 1} bestätigen`
          }
          busy={busy}
          onSign={sign}
          onClose={() => {
            if (!busy) setTarget(null);
          }}
        />
      )}
    </section>
  );
}
