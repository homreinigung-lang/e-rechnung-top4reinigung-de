import { Link } from "@tanstack/react-router";

import { ProjectScanReview } from "@/components/ProjectScanReview";
import { LvPositionen } from "@/components/LvPositionen";
import { Objektmappe } from "@/components/Objektmappe";
import { LeistungsnachweisDialog } from "@/components/LeistungsnachweisDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { AlertTriangle, ArrowLeft, Calculator, Plus, Sparkles, Users } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate, formatNumber } from "@/lib/format";

import { ProjektDetailRaumBearbeiten } from "./ProjektDetailRaumBearbeiten";
import { ProjektDetailNachkalkulationObjektControlling } from "./ProjektDetailNachkalkulationObjektControlling";
import { ProjektStammdatenForm } from "./ProjektStammdatenForm";
import type { ProjektDetailState } from "./useProjektDetailState";
export function ProjektDetailView({ state }: { state: ProjektDetailState }) {
  const {
    addItem,
    addRoom,
    aiHighlights,
    aiRequirements,
    applyScan,
    assign,
    assignEmployee,
    assignOpen,
    assignRole,
    assignments,
    confirmedRooms,
    derivedFacts,
    effectiveProjectAddress,
    employees,
    expected,
    hasAnalysis,
    history,
    id,
    isTender,
    items,
    linkedCustomerName,
    openCritical,
    patchItem,
    patchProject,
    patchRoom,
    project,
    qmCases,
    removeItem,
    removeRoom,
    rooms,
    scanResult,
    setAssignEmployee,
    setAssignOpen,
    setAssignRole,
    setRoomDialog,
    setScanResult,
    timeEntries,
    topCover,
    totalSqm,
    unassign,
  } = state;
  return (
    <div className="space-y-6">
      <Link
        to="/projekte"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Alle Objekte
      </Link>

      <ProjektStammdatenForm state={state} />

      <Objektmappe projectId={id} />

      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Arbeitsscheine / Leistungsnachweise</h2>
          <p className="text-sm text-muted-foreground">
            Vom Mitarbeiter erfasste Leistungsnachweise mit Kundenunterschrift werden automatisch
            diesem Objekt zugeordnet.
          </p>
        </div>
        {timeEntries.filter((entry) => entry.performance_status).length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Noch keine Arbeitsscheine für dieses Objekt vorhanden.
          </div>
        ) : (
          <div className="space-y-2">
            {timeEntries
              .filter((entry) => entry.performance_status)
              .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)))
              .map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {formatDate(entry.work_date)} · {entry.employee_name || "Mitarbeiter"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Number(entry.hours ?? 0)
                        .toFixed(2)
                        .replace(".", ",")}{" "}
                      Std. ·{" "}
                      {entry.performance_status === "completed" ? "Abgeschlossen" : "Entwurf"}
                      {entry.customer_signer_name ? ` · Kunde: ${entry.customer_signer_name}` : ""}
                    </p>
                  </div>
                  <LeistungsnachweisDialog
                    entry={entry}
                    project={{
                      id: project.id,
                      name: project.name,
                      address_line: effectiveProjectAddress.address_line ?? "",
                      postal_code: effectiveProjectAddress.postal_code ?? "",
                      city: effectiveProjectAddress.city ?? "",
                      customer_name: linkedCustomerName,
                    }}
                    readOnly
                  />
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="surface space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">QM / Reklamationen</h2>
            <p className="text-sm text-muted-foreground">
              Qualitätsfälle und Reklamationen für dieses Objekt.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/qm-reklamationen">QM öffnen</Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Offen</div>
            <div className="mt-1 text-xl font-semibold">
              {qmCases.filter((item) => item.status !== "erledigt").length}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Hohe Priorität offen</div>
            <div className="mt-1 text-xl font-semibold text-destructive">
              {
                qmCases.filter((item) => item.status !== "erledigt" && item.priority === "hoch")
                  .length
              }
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Gesamt</div>
            <div className="mt-1 text-xl font-semibold">{qmCases.length}</div>
          </div>
        </div>
        {qmCases.length > 0 && (
          <div className="space-y-1 text-sm">
            {qmCases.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">
                  {item.status === "erledigt"
                    ? "Erledigt"
                    : item.status === "in_bearbeitung"
                      ? "In Bearbeitung"
                      : "Neu"}
                  {item.due_date ? ` · Frist ${formatDate(item.due_date)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <ProjektDetailNachkalkulationObjektControlling state={state} />

      {hasAnalysis && (
        <section className="surface space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Analyse-Ergebnis</h2>
            </div>
            <Button asChild variant="outline">
              <Link
                to="/kalkulation"
                search={{
                  area: Math.round(totalSqm * 100) / 100,
                  objekt: project.name || "",
                  belag: topCover[0]?.[0] ?? "",
                  projekt: project.id,
                }}
              >
                <Calculator className="size-4" /> In Kalkulation übernehmen
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Erkannte Eckdaten</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {[...aiHighlights, ...derivedFacts].map((line, i) => (
                  <li key={`${i}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Kundenanforderungen</h3>
              {aiRequirements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine ausdrücklichen Anforderungen erkannt.
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {aiRequirements.map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {(isTender || project.executive_summary) && (
        <section className="surface space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Executive Summary</h2>
          </div>
          <Textarea
            rows={4}
            defaultValue={project.executive_summary}
            placeholder="Kritische Punkte und Fristen …"
            onBlur={(e) => patchProject.mutate({ executive_summary: e.target.value })}
          />
          {openCritical.length > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                {openCritical.length} kritische bzw. fristgebundene Punkte sind noch offen:{" "}
                {openCritical
                  .map((i) => i.title)
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
          )}
        </section>
      )}

      {!isTender && (
        <section className="surface space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Raumbuch</h2>
              <p className="text-sm text-muted-foreground">
                {rooms.length} von {expected} Räumen erkannt · {confirmedRooms} geprüft
              </p>
            </div>
            <Button variant="outline" onClick={() => addRoom.mutate()}>
              <Plus className="size-4" /> Raum ergänzen
            </Button>
          </div>

          {rooms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Noch keine Räume erfasst. Grundriss hochladen oder Räume manuell ergänzen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Nr.</th>
                    <th className="py-2 pr-3">Raum</th>
                    <th className="py-2 pr-3">Etage</th>
                    <th className="py-2 pr-3">Nutzung</th>
                    <th className="py-2 pr-3 text-right">m²</th>
                    <th className="py-2 pr-3">Bodenbelag</th>
                    <th className="py-2 pr-3">Geprüft</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r, index) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{index + 1}</td>
                      <td className="py-2 pr-3">
                        <button
                          className="font-medium hover:underline"
                          onClick={() => setRoomDialog(r)}
                        >
                          {r.name || "Ohne Bezeichnung"}
                        </button>
                      </td>
                      <td className="py-2 pr-3">{r.floor}</td>
                      <td className="py-2 pr-3">{r.usage_type}</td>
                      <td className="py-2 pr-3 text-right">{formatNumber(Number(r.area_sqm))}</td>
                      <td className="py-2 pr-3">{r.floor_covering}</td>
                      <td className="py-2 pr-3">
                        <Checkbox
                          checked={r.confirmed}
                          onCheckedChange={(v) =>
                            patchRoom.mutate({ roomId: r.id, values: { confirmed: Boolean(v) } })
                          }
                        />
                      </td>
                      <td className="py-2 text-right">
                        <ConfirmDeleteButton
                          title="Raum wirklich löschen?"
                          description={`Der Raum „${r.name || "ohne Namen"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                          onConfirm={() => removeRoom.mutate(r.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {isTender && (
        <section className="surface space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">Leistungsverzeichnis</h2>
            <p className="text-sm text-muted-foreground">
              Positionen prüfen, fehlende Preise ergänzen – Gesamtpreise werden automatisch
              berechnet.
            </p>
          </div>
          <LvPositionen
            items={items}
            onPatch={(itemId, values) => patchItem.mutate({ itemId, values })}
            onAdd={() => addItem.mutate()}
            onRemove={(itemId) => removeItem.mutate(itemId)}
          />
        </section>
      )}

      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Objekt-Mappe</h2>
          <p className="text-sm text-muted-foreground">
            Vertragsdaten, Turnus und Vereinbarungen zu diesem Objekt. Preise und Auswertungen
            werden ausschließlich im Bereich „Kalkulation" gepflegt.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="contract-start">Vertragsbeginn</Label>
            <Input
              id="contract-start"
              type="date"
              defaultValue={project.contract_start ?? ""}
              onBlur={(e) => patchProject.mutate({ contract_start: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract-end">Vertragsende</Label>
            <Input
              id="contract-end"
              type="date"
              defaultValue={project.contract_end ?? ""}
              onBlur={(e) => patchProject.mutate({ contract_end: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label>Reinigungsturnus</Label>
            <Select
              value={project.cleaning_frequency || ""}
              onValueChange={(v) => patchProject.mutate({ cleaning_frequency: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Turnus wählen" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Täglich",
                  "Mehrmals wöchentlich",
                  "Wöchentlich",
                  "14-tägig",
                  "Monatlich",
                  "Nach Bedarf",
                ].map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md bg-muted p-3">
            <div className="text-xs text-muted-foreground">Vertragslaufzeit</div>
            <div className="text-lg font-semibold">
              {project.contract_start ? formatDate(project.contract_start) : "offen"} –{" "}
              {project.contract_end ? formatDate(project.contract_end) : "unbefristet"}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="agreement">Vereinbarung / Absprachen</Label>
          <Textarea
            id="agreement"
            rows={4}
            defaultValue={project.agreement_terms ?? ""}
            placeholder="z. B. Zutritt über Hausmeister, Schlüsselübergabe, Sonderleistungen, Ansprechpartner …"
            onBlur={(e) => patchProject.mutate({ agreement_terms: e.target.value })}
          />
        </div>
      </section>

      <section id="einsatzhistorie" className="surface scroll-mt-20 space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Einsatzhistorie</h2>
          <p className="text-sm text-muted-foreground">
            Chronologie der von Mitarbeitenden als erledigt bestätigten Einsätze in diesem Objekt.
          </p>
        </div>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine abgeschlossenen Einsätze erfasst.
          </p>
        ) : (
          <ul className="divide-y">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                <span className="w-28 shrink-0 font-medium">{formatDate(h.work_date)}</span>
                <span className="w-40 shrink-0">{h.employee_name || "Mitarbeitende/r"}</span>
                <span className="w-32 shrink-0 text-muted-foreground">
                  {h.start_time || h.end_time
                    ? `${(h.start_time ?? "").slice(0, 5)}–${(h.end_time ?? "").slice(0, 5)}`
                    : "—"}
                </span>
                <span className="w-24 shrink-0 text-muted-foreground">
                  {formatNumber(Number(h.hours || 0))} Std.
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">{h.note}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="objekt-team" className="surface scroll-mt-20 space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Eingesetzte Mitarbeiter</h2>
          </div>
          <Button variant="outline" onClick={() => setAssignOpen(true)}>
            <Plus className="size-4" /> Mitarbeiter zuweisen
          </Button>
        </div>
        {assignments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Noch niemand zugewiesen.</p>
        ) : (
          <ul className="divide-y">
            {assignments.map((a) => {
              const emp = employees.find((e) => e.id === a.employee_id);
              return (
                <li key={a.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{emp?.name ?? "Unbekannt"}</div>
                    <div className="text-sm text-muted-foreground">
                      {a.assignment_role || emp?.role || "—"}
                    </div>
                  </div>
                  <ConfirmDeleteButton
                    title="Zuweisung wirklich entfernen?"
                    description={`Die Zuweisung von „${emp?.name ?? "Unbekannt"}" zu diesem Projekt wird entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
                    confirmLabel="Entfernen"
                    onConfirm={() => unassign.mutate(a.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ProjektDetailRaumBearbeiten state={state} />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mitarbeiter zuweisen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mitarbeiter</Label>
              <Select value={assignEmployee} onValueChange={setAssignEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Funktion im Projekt</Label>
              <Select value={assignRole} onValueChange={setAssignRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Reinigungskraft", "Vorarbeiter", "Objektleiter", "Springer"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => assign.mutate()} disabled={!assignEmployee || assign.isPending}>
              Zuweisen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectScanReview
        open={Boolean(scanResult)}
        mode={isTender ? "tender" : "floorplan"}
        result={scanResult}
        saving={applyScan.isPending}
        onCancel={() => setScanResult(null)}
        onConfirm={(review) => applyScan.mutate(review)}
      />
    </div>
  );
}
