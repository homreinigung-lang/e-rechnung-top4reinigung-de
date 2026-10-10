import { EinsatzMeldungen } from "@/components/EinsatzMeldungen";

import { MapPin } from "lucide-react";

import { formatDate } from "@/lib/format";

import { projectAddress } from "@/lib/maps";

import { FahrtenbuchMitarbeiterErfassung } from "@/components/FahrtenbuchMitarbeiterErfassung";

import type { MeineZeitenState } from "./useMeineZeitenState";
export function MeineZeitenWeitereFunktionen({ state }: { state: MeineZeitenState }) {
  const {
    assignments,
    byProject,
    me,
    projectName,
    projects,
    setSelectedProjectId,
    setSelectedTask,
  } = state;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Weitere Funktionen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Zusätzliche Informationen und Funktionen nur bei Bedarf öffnen.
        </p>
      </div>
      <details className="surface p-5">
        <summary className="cursor-pointer font-semibold">Meine Vertragsdaten</summary>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Vertragsart</dt>
            <dd className="font-medium">{me.contract_type || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vertragsbeginn</dt>
            <dd className="font-medium">
              {me.contract_start ? formatDate(me.contract_start) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Soll-Stunden / Woche</dt>
            <dd className="font-medium">
              {me.weekly_hours ? `${Number(me.weekly_hours).toFixed(2)} Std.` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Funktion</dt>
            <dd className="font-medium">{me.role || "—"}</dd>
          </div>
        </dl>
      </details>

      <details className="surface p-5">
        <summary className="cursor-pointer font-semibold">
          Meine Objekte & Stunden nach Objekt
        </summary>
        <div className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="surface p-5">
              <h2 className="text-lg font-semibold">Meine Objekte / Einsatzorte</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Tippen Sie auf ein Objekt, um Details und die Navigation dorthin zu öffnen.
              </p>
              {assignments.length === 0 && !me.work_location ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Aktuell sind Ihnen keine festen Objekte zugewiesen.
                </p>
              ) : (
                <ul className="mt-3 divide-y text-sm">
                  {me.work_location && (
                    <li className="py-2">
                      <span className="font-medium">{me.work_location}</span>
                      <span className="text-muted-foreground"> · Einsatzort (Freitext)</span>
                    </li>
                  )}
                  {assignments.map((a) => {
                    const p = projects.find((x) => x.id === a.project_id);
                    const address = p ? projectAddress(p) : "";
                    const name = projectName(a.project_id as string) ?? "Projekt";
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTask(null);
                            setSelectedProjectId(a.project_id as string);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded px-1 py-2 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0">
                            <span className="block truncate">
                              <span className="font-medium">{name}</span>
                              {a.assignment_role ? ` · ${a.assignment_role}` : ""}
                            </span>
                            {address && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {address}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-muted-foreground">
                              {Number(a.hours_per_week ?? 0) > 0
                                ? `${Number(a.hours_per_week).toFixed(2)} Std./Woche`
                                : ""}
                            </span>
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="surface p-5">
              <h2 className="text-lg font-semibold">Stunden nach Objekt</h2>
              {byProject.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Für diesen Monat sind noch keine Arbeitsstunden erfasst.
                </p>
              ) : (
                <ul className="mt-3 divide-y text-sm">
                  {byProject.map(([name, hours]) => (
                    <li key={name} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">{name}</span>
                      <span className="shrink-0 font-medium">{hours.toFixed(2)} Std.</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </details>

      <details className="surface p-5">
        <summary className="cursor-pointer font-semibold">Fahrtenbuch</summary>
        <div className="mt-4">
          <FahrtenbuchMitarbeiterErfassung employeeId={me.id} ownerUserId={me.user_id} />
        </div>
      </details>

      <details className="surface p-5">
        <summary className="cursor-pointer font-semibold">Meldungen</summary>
        <div className="mt-4">
          <div className="surface p-5">
            <EinsatzMeldungen employee={me} />
          </div>
        </div>
      </details>
    </section>
  );
}
