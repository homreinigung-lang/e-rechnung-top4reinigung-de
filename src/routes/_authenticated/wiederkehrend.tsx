import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { formatDate, today } from "@/lib/format";
import { isDue, runRecurring } from "@/lib/recurring";
import { Play, Plus, Repeat, Trash2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";

export const Route = createFileRoute("/_authenticated/wiederkehrend")({
  component: RecurringPage,
  head: () => ({
    meta: [
      { title: "Wiederkehrende Rechnungen – HomR" },
      {
        name: "description",
        content:
          "Wiederkehrende Rechnungen automatisch in festen Intervallen aus einer Vorlage erzeugen.",
      },
      { property: "og:title", content: "Wiederkehrende Rechnungen – HomR" },
      {
        property: "og:description",
        content: "Abonnements und Wartungsverträge periodisch abrechnen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const INTERVALS = [
  { value: "1", label: "Monatlich" },
  { value: "3", label: "Vierteljährlich" },
  { value: "6", label: "Halbjährlich" },
  { value: "12", label: "Jährlich" },
];

function RecurringPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [interval, setInterval] = useState("1");
  const [nextRun, setNextRun] = useState(today());
  const [templateId, setTemplateId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["recurring"],
    queryFn: async () => {
      const [recRes, docRes, custRes] = await Promise.all([
        supabase.from("recurring_invoices").select("*").order("next_run"),
        supabase
          .from("documents")
          .select("id, number, type, customer_company, customer_name, customer_id, total")
          .eq("type", "invoice")
          .order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name, company"),
      ]);
      if (recRes.error) throw recRes.error;
      return {
        recurring: recRes.data ?? [],
        documents: docRes.data ?? [],
        customers: custRes.data ?? [],
      };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      if (!templateId) throw new Error("Bitte eine Vorlage-Rechnung auswählen.");
      const template = data?.documents.find((d) => d.id === templateId);
      const { error } = await supabase.from("recurring_invoices").insert({
        user_id: userId,
        title: title.trim() || `Serie ${template?.number ?? ""}`.trim(),
        interval_months: Number(interval),
        next_run: nextRun,
        template_document_id: templateId,
        customer_id: template?.customer_id ?? null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wiederkehrende Rechnung angelegt");
      setTitle("");
      setTemplateId("");
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("recurring_invoices")
        .update({ active } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serie gelöscht");
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: (id: string) => runRecurring(id),
    onSuccess: (newId) => {
      toast.success("Rechnungsentwurf aus Vorlage erzeugt");
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = data?.recurring ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Wiederkehrende Rechnungen</h1>
        <p className="mt-1 text-muted-foreground">
          Wartungsverträge und Daueraufträge automatisch in festen Intervallen aus einer
          Vorlage-Rechnung erzeugen.
        </p>
      </div>

      <div className="surface space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Neue Serie anlegen</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="rec-title">Bezeichnung</Label>
            <Input
              id="rec-title"
              placeholder="z. B. Unterhaltsreinigung Büro"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Vorlage-Rechnung</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Rechnung wählen" />
              </SelectTrigger>
              <SelectContent>
                {(data?.documents ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.number} · {d.customer_company || d.customer_name || "Ohne Kunde"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Intervall</Label>
            <Select value={interval} onValueChange={setInterval}>
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
            <Label htmlFor="rec-next">Nächste Ausführung</Label>
            <Input
              id="rec-next"
              type="date"
              value={nextRun}
              onChange={(e) => setNextRun(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="size-4" /> Serie anlegen
        </Button>
      </div>

      <div className="surface overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Wird geladen…</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine wiederkehrenden Rechnungen angelegt.
          </p>
        ) : (
          <ul className="divide-y">
            {list.map((r) => {
              const due = r.active && isDue(r.next_run);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <Repeat className="size-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{r.title || "Serie"}</div>
                    <div className="text-sm text-muted-foreground">
                      {INTERVALS.find((i) => i.value === String(r.interval_months))?.label ??
                        `Alle ${r.interval_months} Monate`}{" "}
                      · Nächste Ausführung:{" "}
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
                    <Play className="size-4" /> Jetzt erzeugen
                  </Button>
                  <ConfirmDeleteButton
                    ariaLabel="Serie löschen"
                    title="Serie wirklich löschen?"
                    description={`Die Serie „${r.title || "ohne Titel"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
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
