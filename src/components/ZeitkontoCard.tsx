import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, Scale } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  formatStunden,
  zeitkontoFor,
  sollHours,
  type Adjustment,
  type TimeEntryLike,
} from "@/lib/zeitkonto";

export type ZeitkontoEmployee = {
  id: string;
  name: string;
  weekly_hours?: number | string | null;
  user_id?: string | null;
};

function useAdjustments(employeeId?: string) {
  return useQuery({
    queryKey: ["time_account_adjustments", employeeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("time_account_adjustments")
        .select("id,employee_id,entry_date,hours,reason")
        .order("entry_date", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Adjustment[];
    },
  });
}

/**
 * Zeitkonto (Guthaben / Minusstunden).
 * `readOnly` = Mitarbeiter-Portal: nur Anzeige, keine Bearbeitung.
 */
export function ZeitkontoCard({
  employees,
  entries,
  month,
  readOnly = false,
}: {
  employees: ZeitkontoEmployee[];
  entries: TimeEntryLike[];
  month: string;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const single = readOnly && employees.length === 1 ? employees[0]!.id : undefined;
  const { data: adjustments = [] } = useAdjustments(single);
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("0");
  const [reason, setReason] = useState("");

  const rows = useMemo(
    () =>
      employees.map((e) => ({
        employee: e,
        month: zeitkontoFor(e.id, Number(e.weekly_hours ?? 0), entries, adjustments, month),
        gesamt: zeitkontoFor(e.id, Number(e.weekly_hours ?? 0), entries, adjustments),
      })),
    [employees, entries, adjustments, month],
  );

  const save = useMutation({
    mutationFn: async () => {
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) throw new Error("Bitte einen Mitarbeiter wählen.");
      const value = Number(String(hours).replace(",", "."));
      if (!Number.isFinite(value) || value === 0)
        throw new Error("Bitte eine Stundenzahl (+/-) eingeben.");
      const { data: auth } = await supabase.auth.getUser();
      const uid = emp.user_id ?? auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("time_account_adjustments").insert({
        user_id: uid,
        employee_id: emp.id,
        entry_date: date,
        hours: value,
        reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zeitkonto-Korrektur gespeichert");
      setOpen(false);
      setHours("0");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["time_account_adjustments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_account_adjustments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Korrektur entfernt");
      queryClient.invalidateQueries({ queryKey: ["time_account_adjustments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Scale className="size-5" /> Zeitkonto {month}
        </h2>
        {readOnly ? (
          <span className="text-xs text-muted-foreground">
            Nur-Lesen – Korrekturen nimmt ausschließlich die Verwaltung vor.
          </span>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="size-4" /> Korrektur
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Zeitkonto korrigieren</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label htmlFor="zk-date">Datum</Label>
                  <GermanDateInput id="zk-date" value={date} onChange={setDate} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zk-hours">Stunden (+ Guthaben / − Minus)</Label>
                  <Input
                    id="zk-hours"
                    inputMode="decimal"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zk-reason">Begründung</Label>
                  <Input
                    id="zk-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  Speichern
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2">Mitarbeiter</th>
              <th className="py-2 text-right">Soll</th>
              <th className="py-2 text-right">Ist</th>
              <th className="py-2 text-right">Korrekturen</th>
              <th className="py-2 text-right">Saldo Monat</th>
              <th className="py-2 text-right">Saldo gesamt</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.employee.id}>
                <td className="py-2 font-medium">{r.employee.name}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {sollHours(Number(r.employee.weekly_hours ?? 0))
                    .toFixed(2)
                    .replace(".", ",")}{" "}
                  Std.
                </td>
                <td className="py-2 text-right">{r.month.ist.toFixed(2).replace(".", ",")} Std.</td>
                <td className="py-2 text-right">{formatStunden(r.month.korrektur)}</td>
                <td
                  className={`py-2 text-right font-semibold ${r.month.saldo < 0 ? "text-destructive" : "text-emerald-600"}`}
                >
                  {formatStunden(r.month.saldo)}
                </td>
                <td
                  className={`py-2 text-right font-semibold ${r.gesamt.saldo < 0 ? "text-destructive" : "text-emerald-600"}`}
                >
                  {formatStunden(r.gesamt.saldo)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Keine Mitarbeiter vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adjustments.length > 0 && (
        <ul className="mt-4 divide-y border-t pt-2 text-sm">
          {adjustments.slice(0, 12).map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="w-24 shrink-0 text-muted-foreground">
                {formatDate(a.entry_date)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {employees.find((e) => e.id === a.employee_id)?.name ?? "Mitarbeiter"}
                {a.reason ? ` · ${a.reason}` : ""}
              </span>
              <span
                className={`shrink-0 font-medium ${Number(a.hours) < 0 ? "text-destructive" : "text-emerald-600"}`}
              >
                {formatStunden(Number(a.hours))}
              </span>
              {!readOnly && (
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
