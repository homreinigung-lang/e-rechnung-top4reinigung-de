import { Fragment } from "react";
import { Camera, HeartPulse, Repeat } from "lucide-react";
import { absenceLabel, absenceReason } from "@/lib/absence";
import { statusLabel } from "@/lib/einsatz-status";
import { WEEKDAYS, isoDay } from "./shared";
import type { EinsatzKalenderStateContext } from "./useEinsatzKalenderState";

export function CalendarWeekGrid({ state }: { state: EinsatzKalenderStateContext }) {
  const {
    TeamChips,
    actualByEmployee,
    byDay,
    days,
    doneEntries,
    dropProps,
    dropTarget,
    entryCardClasses,
    entryDragProps,
    entryLockClasses,
    isCompleted,
    openDay,
    openPlans,
    plannedFor,
    setDetail,
    setPlanDetail,
    setRepeatEntry,
    teamNames,
    today,
    visibleEmployees,
  } = state;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[56rem] grid-cols-[12rem_repeat(7,minmax(0,1fr))] gap-px rounded-lg border bg-border text-sm">
        <div className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Mitarbeiter · Soll / Ist
        </div>
        {days.map((d, i) => (
          <div
            key={isoDay(d)}
            className={`bg-muted/60 px-2 py-1.5 text-xs font-medium ${
              isoDay(d) === today ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {WEEKDAYS[i]} {d.getDate()}.{d.getMonth() + 1}.
          </div>
        ))}

        {visibleEmployees.length === 0 && (
          <div className="col-span-8 bg-background px-3 py-6 text-center text-sm text-muted-foreground">
            Keine Mitarbeiter für diesen Filter.
          </div>
        )}

        {visibleEmployees.map((emp) => {
          const actual = actualByEmployee.get(emp.id) ?? 0;
          const planned = plannedFor(emp);
          const diff = actual - planned;
          return (
            <Fragment key={emp.id}>
              <div className="bg-background px-2 py-2">
                <div className="truncate font-medium">{emp.name}</div>
                <div className="text-xs text-muted-foreground">
                  Soll {planned.toFixed(2)} · Ist {actual.toFixed(2)} Std.
                </div>
                <div
                  className={`text-xs font-medium ${
                    diff < 0 ? "text-destructive" : "text-primary"
                  }`}
                >
                  {diff >= 0 ? "+" : ""}
                  {diff.toFixed(2)} Std.
                </div>
              </div>
              {days.map((d) => {
                const key = isoDay(d);
                const list = (byDay.get(key) ?? []).filter((e) => e.employee_id === emp.id);
                return (
                  <div
                    key={`${emp.id}-${key}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDay(key, emp.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") openDay(key, emp.id);
                    }}
                    {...dropProps(`w-${emp.id}-${key}`, key, emp.id)}
                    className={`min-h-[112px] cursor-pointer space-y-1 bg-background p-1.5 text-left align-top transition hover:bg-accent/60 ${
                      key === today ? "ring-1 ring-inset ring-primary" : ""
                    } ${
                      dropTarget === `w-${emp.id}-${key}`
                        ? "bg-primary/10 ring-2 ring-inset ring-primary"
                        : ""
                    }`}
                  >
                    {list.map((e) => {
                      const reason = absenceReason(e);
                      const donePlan = doneEntries.get(e.id);
                      const names = teamNames(e);
                      return (
                        <div key={e.id} className="relative">
                          <button
                            type="button"
                            {...entryDragProps(e)}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setDetail(e);
                            }}
                            title={
                              donePlan
                                ? `Erledigt · ${names} · Plan ${donePlan.range || `${donePlan.hours.toFixed(2)} Std.`}`
                                : `${names} · ${statusLabel(e)}`
                            }
                            className={`w-full rounded border px-1 py-0.5 pr-5 text-left text-[11px] leading-tight hover:brightness-95 ${entryLockClasses(e)} ${entryCardClasses(e, donePlan)}`}
                          >
                            {reason ? (
                              <span className="flex items-center gap-1">
                                {reason === "sick" && <HeartPulse className="size-3 shrink-0" />}
                                {absenceLabel(reason)}
                              </span>
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-medium">
                                    {(e.start_time ?? "").slice(0, 5)}–
                                    {(e.end_time ?? "").slice(0, 5)}
                                  </span>
                                  {((e as { photo_paths?: string[] }).photo_paths ?? []).length >
                                    0 && (
                                    <span
                                      title={`${((e as { photo_paths?: string[] }).photo_paths ?? []).length} Foto(s) vorhanden`}
                                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white"
                                    >
                                      <Camera className="size-2.5" />
                                      {((e as { photo_paths?: string[] }).photo_paths ?? []).length}
                                    </span>
                                  )}
                                </div>
                                <div className="truncate">
                                  {donePlan?.projectName || e.location || "ohne Objekt"}
                                </div>
                                <div className="text-[10px] opacity-80">
                                  {donePlan ? "Erledigt · " : ""}
                                  {Number(e.hours ?? 0).toFixed(2)} Std.
                                </div>
                              </>
                            )}
                          </button>
                          {!isCompleted(e) && (
                            <button
                              type="button"
                              title="Auf weitere Tage kopieren"
                              aria-label="Einsatz wiederholen"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setRepeatEntry(e);
                              }}
                              className="absolute right-0.5 top-0.5 rounded p-0.5 opacity-70 hover:bg-background/60 hover:opacity-100"
                            >
                              <Repeat className="size-3" />
                            </button>
                          )}
                          <TeamChips e={e} />
                        </div>
                      );
                    })}
                    {openPlans(key, emp.id).map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setPlanDetail(p);
                        }}
                        title={`Planung: ${p.employeeName} · ${p.projectName}`}
                        className="block w-full rounded-md border border-dashed border-primary/50 bg-primary/5 px-1.5 py-1 text-left text-[11px] leading-tight text-primary hover:bg-primary/10"
                      >
                        <div className="truncate font-semibold">{p.employeeName}</div>
                        <div className="truncate">{p.projectName}</div>
                        <div className="text-[10px] opacity-80">
                          {p.range ? `${p.range} · ` : ""}
                          {p.hours.toFixed(2)} Std. · Plan
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
