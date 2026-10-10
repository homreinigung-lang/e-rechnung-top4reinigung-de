import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { MapPin, Navigation, GripVertical } from "lucide-react";
import { mapsUrl, projectAddress } from "@/lib/maps";

import { DAY_LABELS, formatDayTime } from "@/lib/planung";

import { WeekQuickFill } from "./WeekQuickFill";
import type { ArbeitsplanungState } from "./useArbeitsplanungState";
export function ArbeitsplanungObjektSummen({ state }: { state: ArbeitsplanungState }) {
  const {
    applyWeekTimes,
    cellDayHours,
    cellHours,
    cellTimes,
    clearWeekTimes,
    dragEmployeeId,
    employeeTotal,
    employees,
    grandTotal,
    handleEmployeeDrop,
    projectTotal,
    setDayTime,
    setDragEmployeeId,
    visibleProjects,
  } = state;
  return (
    <section className="surface overflow-x-auto p-0">
      {employees.length === 0 || visibleProjects.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          {employees.length === 0
            ? "Bitte zuerst mindestens einen aktiven Mitarbeiter anlegen (Menüpunkt Personal)."
            : "Kein Objekt gefunden – bitte Kunden oder Projekte anlegen bzw. Suche zurücksetzen."}
        </p>
      ) : (
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 p-3 text-left font-semibold">
                Mitarbeiter
              </th>
              {visibleProjects.map((p) => (
                <th
                  key={p.id}
                  className={`min-w-[150px] p-3 text-left font-semibold align-top transition ${dragEmployeeId ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleEmployeeDrop(p.id, event)}
                  title="Mitarbeiter hierher ziehen, um einen Einsatz zu planen"
                >
                  <div className="truncate">{p.name || "Objekt"}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{p.city || "—"}</span>
                  </div>
                  {projectAddress(p) && (
                    <a
                      href={mapsUrl(projectAddress(p))}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
                    >
                      <Navigation className="h-3 w-3" /> Route
                    </a>
                  )}
                </th>
              ))}
              <th className="p-3 text-right font-semibold">Summe</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const total = employeeTotal(e.id);
              const soll = Number(e.weekly_hours ?? 0);
              const over = soll > 0 && total > soll;
              return (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-background p-3">
                    <div
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/employee-id", e.id);
                        event.dataTransfer.effectAllowed = "copy";
                        setDragEmployeeId(e.id);
                      }}
                      onDragEnd={() => setDragEmployeeId(null)}
                      className="flex cursor-grab items-center gap-1 font-medium active:cursor-grabbing"
                      title="Auf ein Objekt ziehen"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      {e.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.role || "—"}
                      {soll > 0 ? ` · Soll ${soll.toFixed(1)} Std.` : ""}
                    </div>
                  </td>
                  {visibleProjects.map((p) => {
                    const times = cellTimes(e.id, p.id);
                    const days = cellDayHours(e.id, p.id);
                    const sum = cellHours(e.id, p.id);
                    const ranges = times.map((t) => formatDayTime(t)).filter(Boolean);
                    return (
                      <td key={p.id} className="p-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-auto min-h-9 w-full flex-col gap-0.5 py-1 font-medium"
                            >
                              <span>{sum > 0 ? `${sum.toFixed(2)} Std.` : "–"}</span>
                              {ranges.length > 0 && (
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  {ranges[0]}
                                  {ranges.length > 1 ? ` +${ranges.length - 1}` : ""}
                                </span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 space-y-2">
                            <div className="text-sm font-semibold">
                              {e.name} · {p.name || "Objekt"}
                            </div>
                            <WeekQuickFill
                              onApply={(template, dayCount) =>
                                applyWeekTimes(e.id, p.id, template, dayCount)
                              }
                              onClear={() => clearWeekTimes(e.id, p.id)}
                            />

                            <div className="grid grid-cols-[1.5rem_1fr_1fr_3.2rem_2.6rem] items-center gap-1 text-[10px] text-muted-foreground">
                              <span />
                              <span>Von</span>
                              <span>Bis</span>
                              <span>Pause</span>
                              <span className="text-right">Std.</span>
                            </div>
                            {DAY_LABELS.map((label, i) => (
                              <div
                                key={label}
                                className="grid grid-cols-[1.5rem_1fr_1fr_3.2rem_2.6rem] items-center gap-1"
                              >
                                <span className="text-xs text-muted-foreground">{label}</span>
                                <Input
                                  type="time"
                                  value={times[i]?.start ?? ""}
                                  onChange={(ev) =>
                                    setDayTime(e.id, p.id, i, { start: ev.target.value })
                                  }
                                  className="h-8 px-1 text-xs"
                                />
                                <Input
                                  type="time"
                                  value={times[i]?.end ?? ""}
                                  onChange={(ev) =>
                                    setDayTime(e.id, p.id, i, { end: ev.target.value })
                                  }
                                  className="h-8 px-1 text-xs"
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  step="5"
                                  placeholder="0"
                                  value={times[i]?.breakMin ? String(times[i]!.breakMin) : ""}
                                  onChange={(ev) =>
                                    setDayTime(e.id, p.id, i, {
                                      breakMin: Number(ev.target.value) || 0,
                                    })
                                  }
                                  className="h-8 px-1 text-center text-xs"
                                />
                                <span className="text-right text-xs font-medium">
                                  {(days[i] ?? 0).toFixed(2)}
                                </span>
                              </div>
                            ))}
                            <div className="pt-1 text-right text-xs font-semibold">
                              Woche: {sum.toFixed(2)} Std.
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                    );
                  })}

                  <td className={`p-3 text-right font-semibold ${over ? "text-destructive" : ""}`}>
                    {total.toFixed(1)} Std.
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/30">
              <td className="sticky left-0 z-10 bg-muted/30 p-3 font-semibold">Objekt-Summe</td>
              {visibleProjects.map((p) => (
                <td key={p.id} className="p-3 text-center font-semibold">
                  {projectTotal(p.id).toFixed(1)}
                </td>
              ))}
              <td className="p-3 text-right font-semibold">{grandTotal.toFixed(1)} Std.</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
