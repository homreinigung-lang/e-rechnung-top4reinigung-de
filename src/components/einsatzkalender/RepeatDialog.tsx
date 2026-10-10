import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WEEKDAYS, TimeEntry, isoDay } from "./shared";

export function RepeatDialog({
  entry,
  pending,
  onClose,
  onConfirm,
}: {
  entry: TimeEntry | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (dates: string[]) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);

  const open = entry !== null;
  const start = from || entry?.work_date || "";
  const end = to || start;

  const dates = useMemo(() => {
    if (!start || !end || end < start) return [] as string[];
    const out: string[] = [];
    const d = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    while (d <= last && out.length < 366) {
      const iso = isoDay(d);
      const wd = (d.getDay() + 6) % 7;
      if ((weekdays.length === 0 || weekdays.includes(wd)) && iso !== entry?.work_date)
        out.push(iso);
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [start, end, weekdays, entry?.work_date]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setFrom("");
          setTo("");
          setWeekdays([]);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Einsatz wiederholen</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {entry.employee_name} · {(entry.start_time ?? "").slice(0, 5)}–
              {(entry.end_time ?? "").slice(0, 5)}
              {entry.location ? ` · ${entry.location}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Von</Label>
                <Input type="date" value={start} onChange={(ev) => setFrom(ev.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Bis</Label>
                <Input type="date" value={end} onChange={(ev) => setTo(ev.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Wochentage (leer = alle Tage)</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, i) => (
                  <label
                    key={label}
                    className={`cursor-pointer rounded border px-2 py-1 text-xs ${
                      weekdays.includes(i) ? "border-primary bg-primary/10 text-primary" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={weekdays.includes(i)}
                      onChange={() =>
                        setWeekdays((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {dates.length} neue Einsätze werden angelegt. Der ursprüngliche Einsatz bleibt
              unverändert.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button disabled={pending || dates.length === 0} onClick={() => onConfirm(dates)}>
            Kopieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
