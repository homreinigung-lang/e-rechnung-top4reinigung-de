import { holidayName } from "@/lib/feiertage";
import { Fragment } from "react";
import { isoWeek } from "@/lib/kw";
import { Camera, HeartPulse, Repeat } from "lucide-react";
import { absenceReason, absenceShort } from "@/lib/absence";
import { statusLabel } from "@/lib/einsatz-status";
import { WEEKDAYS, isoDay } from "./shared";
import type { EinsatzKalenderStateContext } from "./useEinsatzKalenderState";

export function CalendarMonthGrid({ state }: { state: EinsatzKalenderStateContext }) {
  const {
    TeamChips,
    byDay,
    days,
    doneEntries,
    dropProps,
    dropTarget,
    entryCardClasses,
    entryDragProps,
    entryLockClasses,
    first,
    isCompleted,
    openDay,
    openPlans,
    setDetail,
    setPlanDetail,
    setRepeatEntry,
    teamNames,
    today,
  } = state;
  return (
    <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-lg border bg-border text-sm">
      <div className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">KW</div>
      {WEEKDAYS.map((w) => (
        <div key={w} className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {w}
        </div>
      ))}
      {days.map((d, index) => {
        const key = isoDay(d);
        const inMonth = d.getMonth() === first.getMonth();
        const holiday = holidayName(key);
        const list = byDay.get(key) ?? [];
        return (
          <Fragment key={key}>
            {index % 7 === 0 && (
              <div
                className="flex items-center justify-center bg-muted/40 px-1 py-1.5 text-xs font-medium text-muted-foreground"
                title={`Kalenderwoche ${isoWeek(d)}`}
              >
                {isoWeek(d)}
              </div>
            )}

            <div
              role="button"
              tabIndex={0}
              onClick={() => openDay(key)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") openDay(key);
              }}
              {...dropProps(`m-${key}`, key)}
              className={`min-h-[132px] cursor-pointer space-y-1 bg-background p-2 text-left transition hover:bg-accent/60 ${
                inMonth ? "" : "opacity-45"
              } ${key === today ? "ring-1 ring-inset ring-primary" : ""} ${
                holiday ? "bg-amber-50 dark:bg-amber-950/30" : ""
              } ${dropTarget === `m-${key}` ? "ring-2 ring-inset ring-primary bg-primary/10" : ""}`}
              title={holiday ? `Feiertag (Saarland): ${holiday}` : undefined}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs ${key === today ? "font-bold text-primary" : ""}`}>
                  {d.getDate()}
                </span>
                {list.length > 0 && (
                  <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                    {list.length}
                  </span>
                )}
              </div>
              {holiday && (
                <div className="mt-0.5 truncate text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  {holiday}
                </div>
              )}
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((e) => {
                  const reason = absenceReason(e);
                  const donePlan = doneEntries.get(e.id);
                  const names = teamNames(e);
                  return (
                    <div key={e.id} className="group relative">
                      <button
                        type="button"
                        {...entryDragProps(e)}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setDetail(e);
                        }}
                        className={`flex w-full items-center gap-1 truncate rounded border px-1 py-0.5 pr-5 text-left text-[11px] leading-tight hover:brightness-95 ${entryLockClasses(e)} ${entryCardClasses(e, donePlan)}`}

                        title={
                          donePlan
                            ? `Erledigt: ${names} · ${donePlan.projectName} · Plan ${donePlan.range || `${donePlan.hours.toFixed(2)} Std.`} · Ist ${Number(e.hours ?? 0).toFixed(2)} Std.`
                            : `${names} · ${statusLabel(e)}`
                        }
                      >
                        {reason === "sick" && <HeartPulse className="size-3 shrink-0" />}
                        {((e as { photo_paths?: string[] }).photo_paths ?? []).length > 0 && (
                          <span
                            title={`${((e as { photo_paths?: string[] }).photo_paths ?? []).length} Foto(s) vorhanden`}
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white"
                          >
                            <Camera className="size-2.5" />
                            {((e as { photo_paths?: string[] }).photo_paths ?? []).length}
                          </span>
                        )}
                        <span className="truncate">
                          {reason ? absenceShort(reason) : (e.start_time ?? "").slice(0, 5)} {names}
                          {!reason && (donePlan?.projectName || e.location)
                            ? ` · ${donePlan?.projectName || e.location}`
                            : ""}
                          {donePlan ? " · Erledigt" : ""}
                        </span>
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
                          className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded p-0.5 opacity-70 hover:bg-background/60 hover:opacity-100"
                        >
                          <Repeat className="size-3" />
                        </button>
                      )}
                      <TeamChips e={e} />
                    </div>
                  );
                })}
                {list.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{list.length - 3} weitere
                  </div>
                )}
                {openPlans(key)
                  .slice(0, 3)
                  .map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setPlanDetail(p);
                      }}
                      title={`Planung: ${p.employeeName} · ${p.projectName} · ${p.range || `${p.hours.toFixed(2)} Std.`}`}
                      className="block w-full rounded-md border border-dashed border-primary/50 bg-primary/5 px-1.5 py-1 text-left text-[11px] leading-tight text-primary hover:bg-primary/10"
                    >
                      <div className="truncate font-semibold">{p.employeeName}</div>
                      <div className="truncate opacity-90">{p.projectName}</div>
                      <div className="text-[10px] opacity-80">
                        {p.range ? `${p.range} · ` : ""}
                        {p.hours.toFixed(2)} Std. · Plan
                      </div>
                    </button>
                  ))}

                {openPlans(key).length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{openPlans(key).length - 3} weitere Planungen
                  </div>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
