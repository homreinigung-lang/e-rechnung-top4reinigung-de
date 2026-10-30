import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, FileSignature, Paperclip, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeliverySignatureDialog } from "./DeliverySignatureDialog";
import {
  blankDeliveryNote,
  deliveryNoteSchema,
  deliveryTotals,
  deliveryNumber,
  MATERIALS,
  type DeliveryNote,
  type DeliveryNoteRecord,
  type DeliverySignature,
} from "@/lib/delivery-note";
import {
  fetchDeliveryNote,
  saveDeliveryNote,
  removeDeliveryNote,
  uploadDeliveryScan,
  deliveryScanBytes,
} from "@/lib/delivery-note-store";
import { buildDeliveryNotePdf } from "@/lib/delivery-note-pdf";
import { downloadBytes } from "@/lib/pdf";
import type { DocumentDetailStateContext } from "./detail/useDocumentDetailState";

type SignatureTarget = number | "supplierSignature" | "customerSignature";

function SignatureView({
  signature,
  onSign,
  onReset,
  disabled,
  title,
}: {
  signature: DeliverySignature | null;
  onSign: () => void;
  onReset: () => void;
  disabled: boolean;
  title: string;
}) {
  return (
    <div className="space-y-1">
      {signature ? (
        <>
          <img
            src={signature.image}
            alt={title}
            className="h-10 max-w-44 rounded bg-white object-contain p-1"
          />
          <p className="text-xs">
            {signature.name} ·{" "}
            {new Date(signature.signedAt).toLocaleDateString("de-DE", {
              timeZone: "Europe/Berlin",
            })}
          </p>
          {!disabled && (
            <Button size="sm" variant="ghost" onClick={onReset}>
              Unterschrift zurücksetzen
            </Button>
          )}
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={onSign} disabled={disabled}>
          <FileSignature className="size-4" /> Unterschreiben
        </Button>
      )}
    </div>
  );
}

export function MonthlyDeliveryNotePanel({ state }: { state: DocumentDetailStateContext }) {
  const [open, setOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const query = useQuery({
    queryKey: ["delivery-note", state.id],
    queryFn: () => fetchDeliveryNote(state.id),
    enabled: state.isInvoice && !state.isStorno,
  });
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  if (!state.isInvoice || state.isStorno) return null;
  const viewCombined = async () => {
    setPreviewBusy(true);
    try {
      if (!(await state.persistBeforeOutput())) return;
      const bytes = await state.makePdfBytes();
      setPreview(
        URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF konnte nicht erstellt werden.");
    } finally {
      setPreviewBusy(false);
    }
  };
  return (
    <section className="no-print space-y-3 rounded-lg border p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Monats-Lieferschein · Verbrauchsmaterial</h2>
          <p className="text-sm text-muted-foreground">
            Rechnung unverändert zuerst, Lieferschein danach – eine PDF-Datei.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={query.isPending || Boolean(query.error)}
            onClick={() => {
              void query.refetch();
              setOpen(true);
            }}
          >
            <Paperclip className="size-4" />
            {query.data ? "Lieferschein öffnen" : "Lieferschein erstellen"}
          </Button>
          {query.data && (
            <Button variant="outline" disabled={previewBusy} onClick={() => void viewCombined()}>
              Gesamt-PDF ansehen
            </Button>
          )}
        </div>
      </div>
      {query.error && (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}{" "}
          <Button variant="link" onClick={() => void query.refetch()}>
            Erneut laden
          </Button>
        </p>
      )}
      {query.data && (
        <p className="text-sm">
          {query.data.data.number} · {query.data.data.month} ·{" "}
          {query.data.scan_path
            ? "Papierfassung hinterlegt"
            : query.data.data.customerSignature && query.data.data.supplierSignature
              ? "Digital unterschrieben"
              : "Entwurf – Unterschriften noch offen"}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (editorBusy) return;
          if (!value && editorDirty && !window.confirm("Ungespeicherte Änderungen verwerfen?"))
            return;
          setOpen(value);
        }}
      >
        <DialogContent
          className="max-h-[95dvh] overflow-y-auto sm:max-w-6xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Monats-Lieferschein</DialogTitle>
            <DialogDescription>
              Wie Ihre Papierfassung: fünf Wochen, Kartons und 5-Liter-Kanister, Wochen- und
              Monatsunterschriften. Ohne Preise.
            </DialogDescription>
          </DialogHeader>
          {query.isPending ? (
            <p>Wird geladen…</p>
          ) : query.error ? (
            <p role="alert">{query.error.message}</p>
          ) : (
            <DeliveryNoteEditor
              key={`${state.id}-${query.data?.version ?? "new"}`}
              record={query.data ?? null}
              state={state}
              onSaved={() => query.refetch()}
              onClose={() => setOpen(false)}
              onDirtyChange={setEditorDirty}
              onBusyChange={setEditorBusy}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(value) => {
          if (!value) setPreview("");
        }}
      >
        <DialogContent className="h-[90dvh] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Rechnung + Lieferschein · eine PDF</DialogTitle>
            <DialogDescription>
              Die Rechnung bleibt im bisherigen Format; der Lieferschein folgt danach.
            </DialogDescription>
          </DialogHeader>
          <iframe title="Gesamt-PDF" src={preview} className="h-[70dvh] w-full border" />
          <a className="text-sm underline" href={preview} target="_blank" rel="noreferrer">
            PDF in neuem Fenster öffnen / drucken
          </a>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DeliveryNoteEditor({
  record,
  state,
  onSaved,
  onClose,
  onDirtyChange,
  onBusyChange,
}: {
  record: DeliveryNoteRecord | null;
  state: DocumentDetailStateContext;
  onSaved: () => unknown;
  onClose: () => void;
  onDirtyChange: (value: boolean) => void;
  onBusyChange: (value: boolean) => void;
}) {
  const form = state.form;
  const defaultAddress = [
    form["customer_address_line"],
    [form["customer_postal_code"], form["customer_city"]].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join("\n");
  const initial =
    record?.data ??
    blankDeliveryNote(
      state.id,
      String(form["issue_date"] ?? ""),
      String(form["order_number"] ?? ""),
      defaultAddress,
    );
  const [note, setNote] = useState(initial);
  const [scanPath, setScanPath] = useState(record?.scan_path ?? null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [signatureTarget, setSignatureTarget] = useState<SignatureTarget | null>(null);
  const [notePreview, setNotePreview] = useState("");
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(
    () => () => {
      if (notePreview) URL.revokeObjectURL(notePreview);
    },
    [notePreview],
  );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const monthSigned = Boolean(note.supplierSignature || note.customerSignature);
  const headerLocked =
    state.locked || Boolean(scanPath) || monthSigned || note.rows.some((r) => r.signature);
  const fieldsLocked = state.locked || Boolean(scanPath) || monthSigned;
  const totals = deliveryTotals(note);
  const change = (next: DeliveryNote) => {
    setNote(next);
    setDirty(true);
    setNotePreview("");
  };
  const commit = async (next = note, path = scanPath) => {
    if (state.locked) return false;
    setBusy(true);
    try {
      const parsed = deliveryNoteSchema.safeParse(next);
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen.");
      if (!(await state.persistBeforeOutput())) return false;
      await saveDeliveryNote(state.id, parsed.data, path, record?.version ?? null);
      setDirty(false);
      setSignatureTarget(null);
      toast.success("Lieferschein gespeichert – wird an die Rechnung angefügt.");
      await onSaved();
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : String((e as { message?: string }).message ?? "Speichern fehlgeschlagen."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const sign = (signature: DeliverySignature) => {
    if (signatureTarget === null) return;
    const next =
      typeof signatureTarget === "number"
        ? {
            ...note,
            rows: note.rows.map((r, i) => (i === signatureTarget ? { ...r, signature } : r)),
          }
        : { ...note, [signatureTarget]: signature };
    void commit(next);
  };
  const resetSignature = (target: SignatureTarget) => {
    if (
      !window.confirm(
        "Unterschrift zurücksetzen? Nach einer Mengenänderung ist eine neue Unterschrift nötig.",
      )
    )
      return;
    const next =
      typeof target === "number"
        ? { ...note, rows: note.rows.map((r, i) => (i === target ? { ...r, signature: null } : r)) }
        : { ...note, [target]: null };
    void commit(next);
  };
  const issuer = () => ({
    companyName: String(state.settings?.["company_name"] ?? ""),
    ownerName: String(state.settings?.["owner_name"] ?? ""),
    contactEmail: String(state.settings?.["email"] ?? ""),
    contactPhone: String(state.settings?.["phone"] ?? ""),
    customer: [String(form["customer_company"] ?? ""), String(form["customer_name"] ?? "")],
    footer: [
      {
        heading: "Firma",
        lines: [
          String(state.settings?.["address_line"] ?? ""),
          [state.settings?.["postal_code"], state.settings?.["city"]].filter(Boolean).join(" "),
        ],
      },
      {
        heading: "Steuerangaben",
        lines: [
          `USt-IdNr.: ${state.settings?.["vat_id"] ?? ""}`,
          `St.-Nr.: ${state.settings?.["tax_number"] ?? ""}`,
        ],
      },
    ],
  });
  const pdf = async (mode: "preview" | "download" | "print") => {
    setBusy(true);
    try {
      const data = deliveryNoteSchema.parse(note);
      const bytes = await buildDeliveryNotePdf(
        issuer(),
        data,
        scanPath ? await deliveryScanBytes(scanPath) : undefined,
      );
      if (mode === "download") downloadBytes(bytes, `${data.number.replace(/[^\w.-]/g, "_")}.pdf`);
      else
        setNotePreview(
          URL.createObjectURL(
            new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
          ),
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    setBusy(true);
    try {
      deliveryNoteSchema.parse(note);
      const path = await uploadDeliveryScan(state.id, file);
      if (await commit(note, path)) setScanPath(path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      {state.locked && (
        <p className="rounded border p-3 text-sm">
          Rechnung festgeschrieben: Lieferschein ist schreibgeschützt.
        </p>
      )}
      <fieldset disabled={busy} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="delivery-month">Monat / Jahr</Label>
            <Input
              id="delivery-month"
              type="month"
              value={note.month}
              disabled={headerLocked}
              onChange={(e) => change({ ...note, month: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="delivery-number">Lieferschein-Nr.</Label>
            <Input
              id="delivery-number"
              maxLength={60}
              value={note.number}
              disabled={headerLocked}
              onChange={(e) => change({ ...note, number: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="delivery-order">Bestell-Nr.</Label>
            <Input
              id="delivery-order"
              maxLength={100}
              value={note.orderNumber}
              disabled={headerLocked}
              onChange={(e) => change({ ...note, orderNumber: e.target.value })}
            />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="delivery-address">Lieferadresse / Objekt (bitte prüfen)</Label>
            <Input
              id="delivery-address"
              maxLength={450}
              value={note.deliveryAddress}
              disabled={headerLocked}
              onChange={(e) => change({ ...note, deliveryAddress: e.target.value })}
            />
          </div>
        </div>
        {headerLocked && !state.locked && (
          <p className="text-xs text-muted-foreground">
            Signierte Angaben sind gesperrt. Zum Ändern die betreffenden Unterschriften bzw.
            Papierfassung zuerst zurücksetzen.
          </p>
        )}
        <div className="overflow-x-auto rounded border">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-blue-800 text-white">
              <tr>
                <th className="p-3 text-left">Woche / Datum</th>
                {MATERIALS.map((m) => (
                  <th key={m.key} className="p-3 text-left">
                    {m.label}
                    <div className="text-xs font-normal">{m.detail}</div>
                  </th>
                ))}
                <th className="p-3 text-left">Wöchentliche Abzeichnung</th>
              </tr>
            </thead>
            <tbody>
              {note.rows.map((row, i) => (
                <tr key={i} className="border-t align-top even:bg-muted/30">
                  <td className="space-y-1 p-2">
                    <Label htmlFor={`delivery-date-${i}`}>Woche {i + 1}</Label>
                    <Input
                      id={`delivery-date-${i}`}
                      type="date"
                      value={row.date}
                      disabled={fieldsLocked || Boolean(row.signature)}
                      onChange={(e) =>
                        change({
                          ...note,
                          rows: note.rows.map((r, j) =>
                            j === i ? { ...r, date: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </td>
                  {MATERIALS.map((m) => (
                    <td key={m.key} className="p-2">
                      <Input
                        aria-label={`${m.label} Woche ${i + 1} (${m.unit})`}
                        inputMode="decimal"
                        maxLength={12}
                        className="min-w-24"
                        placeholder="0"
                        value={row[m.key]}
                        disabled={fieldsLocked || Boolean(row.signature)}
                        onChange={(e) =>
                          change({
                            ...note,
                            rows: note.rows.map((r, j) =>
                              j === i ? { ...r, [m.key]: e.target.value } : r,
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td className="p-2">
                    <SignatureView
                      title={`Woche ${i + 1}`}
                      signature={row.signature}
                      disabled={fieldsLocked}
                      onSign={() => setSignatureTarget(i)}
                      onReset={() => resetSignature(i)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted font-semibold">
              <tr>
                <td className="p-3">GESAMT (Monat)</td>
                {MATERIALS.map((m) => (
                  <td key={m.key} className="p-3">
                    {Number.isFinite(totals[m.key])
                      ? deliveryNumber(totals[m.key])
                      : "Eingabe prüfen"}{" "}
                    {m.unit}
                  </td>
                ))}
                <td className="p-3">Monatssumme</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["supplierSignature", "customerSignature"] as const).map((target) => (
            <div key={target} className="space-y-2 rounded border p-3">
              <p className="font-medium">
                {target === "supplierSignature" ? "Auftragnehmer" : "Auftraggeber / Bauleitung"} ·
                Monatsende
              </p>
              <SignatureView
                title={
                  target === "supplierSignature"
                    ? "Unterschrift Auftragnehmer"
                    : "Unterschrift Auftraggeber"
                }
                signature={note[target]}
                disabled={state.locked || Boolean(scanPath)}
                onSign={() => setSignatureTarget(target)}
                onReset={() => resetSignature(target)}
              />
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded border p-3">
          <p className="font-medium">Alternativ: Papierfassung unterschreiben</p>
          <p className="text-sm text-muted-foreground">
            PDF ausdrucken, unterschreiben und als PDF oder deutliches JPG/PNG hochladen. Diese
            Fassung ersetzt die digitale Lieferscheinseite im Gesamt-PDF.
          </p>
          {scanPath ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">Unterschriebene Papierfassung hinterlegt.</span>
              <Button
                variant="outline"
                disabled={state.locked}
                onClick={() => {
                  if (window.confirm("Papierfassung vom Lieferschein entfernen?"))
                    void commit(note, null);
                }}
              >
                Papierfassung entfernen
              </Button>
            </div>
          ) : (
            !state.locked && (
              <Input
                type="file"
                aria-label="Unterschriebenen Lieferschein hochladen"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
            )
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!state.locked && <Button onClick={() => void commit()}>Lieferschein speichern</Button>}
          {!state.locked && record && (
            <Button
              variant="outline"
              onClick={() => {
                if (
                  !window.confirm(
                    "Lieferschein von dieser Rechnung entfernen? Die Rechnung selbst bleibt unverändert.",
                  )
                )
                  return;
                setBusy(true);
                void removeDeliveryNote(state.id, record.version)
                  .then(async () => {
                    setDirty(false);
                    await onSaved();
                    onClose();
                  })
                  .catch((e: Error) => toast.error(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Lieferschein entfernen
            </Button>
          )}
          <Button variant="outline" onClick={() => void pdf("preview")}>
            Lieferschein ansehen
          </Button>
          <Button variant="outline" onClick={() => void pdf("download")}>
            <FileDown className="size-4" /> PDF herunterladen
          </Button>
          <Button variant="outline" onClick={() => void pdf("print")}>
            <Printer className="size-4" /> Druckansicht
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (!dirty || window.confirm("Ungespeicherte Änderungen verwerfen?")) onClose();
            }}
          >
            Schließen
          </Button>
        </div>
      </fieldset>
      {dirty && (
        <p role="status" className="text-sm text-amber-700">
          Änderungen noch nicht gespeichert. Erst speichern, dann die Rechnung ausgeben.
        </p>
      )}
      {notePreview && (
        <div className="space-y-2">
          <iframe
            title="Lieferschein Druckansicht"
            className="h-[65dvh] w-full border"
            src={notePreview}
          />
          <a href={notePreview} target="_blank" rel="noreferrer" className="text-sm underline">
            PDF öffnen / über das Drucksymbol ausdrucken
          </a>
        </div>
      )}
      {signatureTarget !== null && (
        <DeliverySignatureDialog
          busy={busy}
          title={
            typeof signatureTarget === "number"
              ? `Woche ${signatureTarget + 1} bestätigen`
              : signatureTarget === "supplierSignature"
                ? "Monatsende · Auftragnehmer"
                : "Monatsende · Auftraggeber"
          }
          onSign={sign}
          onClose={() => setSignatureTarget(null)}
        />
      )}
    </div>
  );
}
