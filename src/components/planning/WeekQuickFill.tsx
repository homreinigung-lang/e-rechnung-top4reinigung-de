import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toast } from "sonner";

import { type DayTime } from "@/lib/planung";

export function WeekQuickFill({
  onApply,
  onClear,
}: {
  onApply: (template: DayTime, dayCount: number) => void;
  onClear: () => void;
}) {
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("16:00");
  const [breakMin, setBreakMin] = React.useState(30);

  const apply = (dayCount: number) => {
    if (!start || !end) {
      toast.error("Bitte Von- und Bis-Zeit angeben.");
      return;
    }
    onApply({ start, end, breakMin: Math.max(0, breakMin) }, dayCount);
  };

  return (
    <div className="rounded-md border bg-muted/40 p-2">
      <div className="text-xs font-semibold">Ganze Woche übernehmen</div>
      <div className="mt-1 grid grid-cols-[1fr_1fr_3.2rem] gap-1">
        <Input
          type="time"
          value={start}
          onChange={(ev) => setStart(ev.target.value)}
          className="h-8 px-1 text-xs"
          aria-label="Von (ganze Woche)"
        />
        <Input
          type="time"
          value={end}
          onChange={(ev) => setEnd(ev.target.value)}
          className="h-8 px-1 text-xs"
          aria-label="Bis (ganze Woche)"
        />
        <Input
          type="number"
          min={0}
          step="5"
          value={breakMin ? String(breakMin) : ""}
          placeholder="0"
          onChange={(ev) => setBreakMin(Number(ev.target.value) || 0)}
          className="h-8 px-1 text-center text-xs"
          aria-label="Pause (ganze Woche)"
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="secondary" onClick={() => apply(5)}>
          Mo–Fr
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => apply(7)}>
          Mo–So
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Leeren
        </Button>
      </div>
    </div>
  );
}
