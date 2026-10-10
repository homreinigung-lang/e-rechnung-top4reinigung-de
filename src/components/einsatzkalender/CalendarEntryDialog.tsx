import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Camera } from "lucide-react";
import { formatDate } from "@/lib/format";
import { isAbsence } from "@/lib/absence";
import { STATUS_CLASSES, STATUS_DOTS, einsatzStatus, statusLabel } from "@/lib/einsatz-status";
import { ArbeitsnachweisFotos } from "@/components/ArbeitsnachweisFotos";
import { mapsUrl } from "@/lib/maps";
import type { EinsatzKalenderStateContext } from "./useEinsatzKalenderState";

export function CalendarEntryDialog({ state }: { state: EinsatzKalenderStateContext }) {
  const { customerName, customerSite, detail, openDay, projectName, setDetail, setEntryStatus } =
    state;
  return (
    <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Einsatz-Details</DialogTitle>
        </DialogHeader>
        {detail && (
          <div className="space-y-3 text-sm">
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[einsatzStatus(detail)]}`}
            >
              <span className={`size-2 rounded-full ${STATUS_DOTS[einsatzStatus(detail)]}`} />
              {statusLabel(detail)}
            </span>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">Datum</dt>
              <dd className="font-medium">{formatDate(detail.work_date)}</dd>
              <dt className="text-muted-foreground">Mitarbeiter</dt>
              <dd className="font-medium">{detail.employee_name}</dd>
              <dt className="text-muted-foreground">Zeit</dt>
              <dd>
                {isAbsence(detail)
                  ? "ganztägig"
                  : `${(detail.start_time ?? "").slice(0, 5)}–${(detail.end_time ?? "").slice(0, 5)} (Pause ${Number(detail.break_minutes ?? 0)} Min.)`}
              </dd>
              <dt className="text-muted-foreground">Arbeitsstunden</dt>
              <dd className="font-medium">{Number(detail.hours ?? 0).toFixed(2)} Std.</dd>
              <dt className="text-muted-foreground">Objekt / Einsatzort</dt>
              <dd>{detail.location || projectName(detail.project_id) || "—"}</dd>
              <dt className="text-muted-foreground">Kunde</dt>
              <dd>{customerName(detail.customer_id) || "—"}</dd>
              {customerSite(detail.customer_id).address ? (
                <>
                  <dt className="text-muted-foreground">
                    {customerSite(detail.customer_id).own
                      ? "Einsatzort (Kunde)"
                      : "Adresse (Rechnungsadresse)"}
                  </dt>
                  <dd>
                    <a
                      href={mapsUrl(customerSite(detail.customer_id).address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {customerSite(detail.customer_id).address}
                    </a>
                    {customerSite(detail.customer_id).note && (
                      <span className="block text-xs text-muted-foreground">
                        {customerSite(detail.customer_id).note}
                      </span>
                    )}
                  </dd>
                </>
              ) : null}

              {detail.note ? (
                <>
                  <dt className="text-muted-foreground">Notiz</dt>
                  <dd>{detail.note}</dd>
                </>
              ) : null}
            </dl>

            {/* Objektfotos: nur interne Verwaltungsansicht, nie im Steuerberater-Portal. */}
            {!isAbsence(detail) &&
              (() => {
                const fotos = ((detail as { photo_paths?: string[] }).photo_paths ??
                  []) as string[];
                return (
                  <div className="rounded-md border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                        <Camera className="size-4" />
                        Objektfotos
                        <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                          {fotos.length}
                        </span>
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70">
                        nur intern
                      </span>
                    </div>
                    <ArbeitsnachweisFotos
                      entryId={detail.id}
                      paths={fotos}
                      canDelete
                      invalidateKey="time_entries"
                    />
                    {fotos.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Keine Fotos vom Mitarbeiter hochgeladen.
                      </p>
                    )}
                  </div>
                );
              })()}
          </div>
        )}
        {detail && !isAbsence(detail) && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {detail.completed_at ? (
              <Button
                size="sm"
                variant="outline"
                disabled={setEntryStatus.isPending}
                onClick={() =>
                  setEntryStatus.mutate({ id: detail.id, patch: { completed_at: null } })
                }
              >
                Abschluss zurücknehmen
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={setEntryStatus.isPending}
                onClick={() =>
                  setEntryStatus.mutate({
                    id: detail.id,
                    patch: {
                      completed_at: new Date().toISOString(),
                      approval_status: "approved",
                    },
                  })
                }
              >
                <Check className="size-4" /> Erledigt bestätigen
              </Button>
            )}
            {einsatzStatus(detail) === "cancelled" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={setEntryStatus.isPending}
                onClick={() =>
                  setEntryStatus.mutate({ id: detail.id, patch: { approval_status: "approved" } })
                }
              >
                Stornierung aufheben
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                disabled={setEntryStatus.isPending}
                onClick={() =>
                  setEntryStatus.mutate({
                    id: detail.id,
                    patch: { approval_status: "rejected", completed_at: null },
                  })
                }
              >
                Einsatz stornieren
              </Button>
            )}
          </div>
        )}
        <DialogFooter>
          {detail && (
            <Button
              variant="outline"
              onClick={() => {
                const key = detail.work_date;
                setDetail(null);
                openDay(key, detail.employee_id ?? undefined);
              }}
            >
              Tag öffnen
            </Button>
          )}
          <Button variant="ghost" onClick={() => setDetail(null)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
