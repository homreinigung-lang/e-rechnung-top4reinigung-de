import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatDate, formatMoney, today } from "@/lib/format";
import { GermanDateInput } from "@/components/GermanDateTimeInput";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import {
  isExpenseDue,
  runDueRecurringExpenses,
  runRecurringExpense,
} from "@/lib/recurring-expenses";
import { Play, Plus, Repeat } from "lucide-react";

const INTERVALS = [
  { value: "1", label: "Monatlich" },
  { value: "3", label: "Vierteljährlich" },
  { value: "6", label: "Halbjährlich" },
  { value: "12", label: "Jährlich" },
];

type Form = {
  title: string;
  supplier: string;
  category: string;
  net_amount: string;
  vat_amount: string;
  interval_months: string;
  next_run: string;
  notes: string;
};

const empty = (): Form => ({
  title: "",
  supplier: "",
  category: "Sonstiges",
  net_amount: "",
  vat_amount: "",
  interval_months: "1",
  next_run: today(),
  notes: "",
});

/** Verwaltung fixer, wiederkehrender Betriebsausgaben (Miete, Versicherung, Abos). */
export function WiederkehrendeAusgaben({ categories }: { categories: string[] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(empty);
  const autoRan = useRef(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["recurring-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("*")
        .order("next_run");
      if (error) throw error;
      return data;
    },
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["recurring-expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [queryClient]);

  // Fällige Serien beim Öffnen der Seite automatisch buchen.
  useEffect(() => {
    if (autoRan.current || isLoading) return;
    autoRan.current = true;
    const due = rows.filter((r) => r.active && isExpenseDue(r.next_run));
    if (due.length === 0) return;
    runDueRecurringExpenses()
      .then((count) => {
        if (count > 0) {
          toast.success(`${count} fällige Ausgabe(n) automatisch gebucht`);
          refresh();
        }
      })
      .catch((e: Error) => toast.error(e.message));
  }, [isLoading, rows, refresh]);

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      if (!form.title.trim() && !form.supplier.trim())
        throw new Error("Bitte eine Bezeichnung angeben.");
      const net = Number(form.net_amount || 0);
      const vat = Number(form.vat_amount || 0);
      const { error } = await supabase.from("recurring_expenses").insert({
        user_id: userId,
        title: form.title.trim() || form.supplier.trim(),
        supplier: form.supplier.trim(),
        category: form.category,
        net_amount: net,
        vat_amount: vat,
        gross_amount: net + vat,
        notes: form.notes,
        interval_months: Number(form.interval_months),
        next_run: form.next_run || today(),
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wiederkehrende Ausgabe angelegt");
      setForm(empty());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("recurring_expenses")
        .update({ active } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serie gelöscht");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: (id: string) => runRecurringExpense(id),
    onSuccess: () => {
      toast.success("Ausgabe erzeugt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="surface space-y-4 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Wiederkehrende Ausgaben</h2>
        <p className="text-sm text-muted-foreground">
          Fixkosten wie Miete, Versicherung oder Abos automatisch in festen Intervallen buchen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="rex-title">Bezeichnung</Label>
          <Input
            id="rex-title"
            placeholder="z. B. Büromiete"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rex-supplier">Lieferant</Label>
          <Input
            id="rex-supplier"
            placeholder="z. B. Immobilien GmbH"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rex-category">Kategorie</Label>
          <select
            id="rex-category"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Intervall</Label>
          <Select
            value={form.interval_months}
            onValueChange={(v) => setForm({ ...form, interval_months: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rex-net">Netto (€)</Label>
          <Input
            id="rex-net"
            inputMode="decimal"
            value={form.net_amount}
            onChange={(e) => setForm({ ...form, net_amount: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rex-vat">USt. (€)</Label>
          <Input
            id="rex-vat"
            inputMode="decimal"
            value={form.vat_amount}
            onChange={(e) => setForm({ ...form, vat_amount: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rex-next">Nächste Buchung</Label>
          <GermanDateInput
            id="rex-next"
            value={form.next_run}
            onChange={(iso) => setForm({ ...form, next_run: iso })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rex-notes">Notiz</Label>
          <Input
            id="rex-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </div>

      <Button onClick={() => create.mutate()} disabled={create.isPending}>
        <Plus className="size-4" /> Serie anlegen
      </Button>

      <div className="overflow-hidden rounded-lg border">
        {isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Wird geladen…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Noch keine wiederkehrenden Ausgaben angelegt.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const due = r.active && isExpenseDue(r.next_run);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <Repeat className="size-4 text-muted-foreground" />
                  <div className="min-w-48 flex-1">
                    <div className="font-medium">{r.title || r.supplier || "Serie"}</div>
                    <div className="text-sm text-muted-foreground">
                      {INTERVALS.find((i) => i.value === String(r.interval_months))?.label ??
                        `Alle ${r.interval_months} Monate`}{" "}
                      · {formatMoney(Number(r.gross_amount))} · Nächste Buchung:{" "}
                      <span className={due ? "font-medium text-destructive" : ""}>
                        {formatDate(r.next_run)}
                        {due ? " (fällig)" : ""}
                      </span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch
                      checked={r.active}
                      onCheckedChange={(v) => toggle.mutate({ id: r.id, active: v })}
                    />
                    {r.active ? "Aktiv" : "Pausiert"}
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => run.mutate(r.id)}
                    disabled={run.isPending}
                  >
                    <Play className="size-4" /> Jetzt buchen
                  </Button>
                  <ConfirmDeleteButton
                    ariaLabel="Serie löschen"
                    title="Serie wirklich löschen?"
                    description={`Die Serie „${r.title || r.supplier || "ohne Titel"}" wird unwiderruflich gelöscht. Bereits gebuchte Ausgaben bleiben erhalten.`}
                    onConfirm={() => remove.mutate(r.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
