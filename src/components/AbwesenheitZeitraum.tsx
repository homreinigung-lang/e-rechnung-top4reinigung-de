import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { GermanDateInput } from "@/components/GermanDateTimeInput";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarRange } from "lucide-react";
import { ABSENCE_REASONS, absenceLabel, type AbsenceReason } from "@/lib/absence";
import { formatDate } from "@/lib/format";

export type AbsenceEmployee = { id: string; name: string; user_id?: string };

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Alle Tage zwischen zwei ISO-Daten (inklusive), optional ohne Wochenenden. */
export function daysBetween(fromIso: string, toIso: string, skipWeekend: boolean) {
  const out: string[] = [];
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return out;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (skipWeekend && (wd === 0 || wd === 6)) continue;
    out.push(isoDay(d));
  }
  return out;
}

/**
 * Zeitraum-Abwesenheit: bucht Urlaub / Krankheit / Sonstiges für alle Tage
 * zwischen Start- und Enddatum – für Admin (Mitarbeiterauswahl) und für
 * Mitarbeiter (fester Mitarbeiter) verwendbar.
 */
export function AbwesenheitZeitraum({
  employees,
  fixedEmployeeId,
  triggerLabel = "Abwesenheit (Zeitraum)",
  variant = "outline",
}: {
  employees: AbsenceEmployee[];
  fixedEmployeeId?: string;
  triggerLabel?: string;
  variant?: "default" | "outline";
}) {
  const queryClient = useQueryClient();
  const today = isoDay(new Date());
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(fixedEmployeeId ?? "");
  const [reason, setReason] = useState<AbsenceReason>("vacation");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [skipWeekend, setSkipWeekend] = useState(true);
  const [note, setNote] = useState("");

  const activeEmployeeId = fixedEmployeeId ?? employeeId;
  const days = daysBetween(from, to, skipWeekend);

  const book = useMutation({
    mutationFn: async () => {
      const employee = employees.find((e) => e.id === activeEmployeeId);
      if (!employee) throw new Error("Bitte einen Mitarbeiter wählen.");
      if (days.length === 0) throw new Error("Bitte einen gültigen Zeitraum wählen.");
      const { data: auth } = await supabase.auth.getUser();
      const uid = employee.user_id ?? auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");

      const rows = days.map((d) => ({
        user_id: uid,
        employee_id: employee.id,
        employee_name: employee.name,
        work_date: d,
        start_time: null,
        end_time: null,
        break_minutes: 0,
        hours: 0,
        hourly_rate: 0,
        location: absenceLabel(reason),
        note: note.trim(),
        entry_type: "absence",
        absence_reason: reason,
      }));
      const { error } = await supabase.from("time_entries").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`${absenceLabel(reason)}: ${count} Tag(e) eingetragen`);
      setOpen(false);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <CalendarRange className="size-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abwesenheit für einen Zeitraum eintragen</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {!fixedEmployeeId && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Mitarbeiter</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Mitarbeiter wählen" />
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
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label>Grund</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as AbsenceReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="abs-from">Von</Label>
            <GermanDateInput id="abs-from" value={from} onChange={setFrom} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="abs-to">Bis</Label>
            <GermanDateInput id="abs-to" value={to} onChange={setTo} />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="abs-skip"
              checked={skipWeekend}
              onCheckedChange={(c) => setSkipWeekend(c === true)}
            />
            <Label htmlFor="abs-skip" className="font-normal">
              Wochenenden (Sa/So) überspringen
            </Label>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="abs-note">Notiz</Label>
            <Input id="abs-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {days.length > 0 ? (
            <>
              <span className="font-medium text-foreground">{days.length} Tag(e)</span> von{" "}
              {formatDate(from)} bis {formatDate(to)} werden als{" "}
              <span className="font-medium text-foreground">{absenceLabel(reason)}</span> gebucht.
            </>
          ) : (
            "Bitte einen gültigen Zeitraum wählen."
          )}
        </p>

        <DialogFooter>
          <Button
            onClick={() => book.mutate()}
            disabled={!activeEmployeeId || days.length === 0 || book.isPending}
          >
            Zeitraum buchen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
