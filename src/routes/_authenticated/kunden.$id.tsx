import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { DOC_TYPE_LABEL, STATUS_LABEL, formatDate, formatMoney, today } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/kunden/$id")({
  head: () => ({
    meta: [
      { title: "Kundenakte – Client 360" },
      {
        name: "description",
        content:
          "Kundenakte mit Überblick, Umsatz, Belegen, Einsätzen und Betriebsanweisungen an einem Ort.",
      },
      { property: "og:title", content: "Kundenakte – Client 360" },
      {
        property: "og:description",
        content: "Alle Informationen zu einem Kunden: Kontakt, Umsatz, Belege, Einsätze, Notizen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Kundenakte,
  errorComponent: () => (
    <p className="surface px-5 py-12 text-center text-sm text-muted-foreground">
      Die Kundenakte konnte nicht geladen werden.
    </p>
  ),
  notFoundComponent: () => (
    <p className="surface px-5 py-12 text-center text-sm text-muted-foreground">
      Kunde nicht gefunden.
    </p>
  ),
});

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  active: { label: "Aktiv", className: "bg-emerald-100 text-emerald-800" },
  paused: { label: "Pausiert", className: "bg-amber-100 text-amber-900" },
  terminated: { label: "Gekündigt", className: "bg-rose-100 text-rose-800" },
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-wrap gap-2 border-b py-2 text-sm last:border-b-0">
      <span className="w-48 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value?.trim() ? value : "—"}</span>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Kundenakte() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["customer_documents", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, type, number, status, issue_date, due_date, total, net_total, paid_at, deleted_at, is_storno",
        )
        .eq("customer_id", id)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["customer_projects", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("customer_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const projectIds = projects.map((p) => p.id);

  const { data: entries = [] } = useQuery({
    queryKey: ["customer_entries", id, projectIds.join(",")],
    queryFn: async () => {
      let query = supabase
        .from("time_entries")
        .select(
          "id, work_date, start_time, end_time, hours, employee_name, location, note, entry_type, approval_status, project_id",
        )
        .order("work_date", { ascending: false });
      query = projectIds.length
        ? query.or(`customer_id.eq.${id},project_id.in.(${projectIds.join(",")})`)
        : query.eq("customer_id", id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Notizen (Betriebsanweisungen) – nutzt das vorhandene Feld customers.notes.
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setNotes(customer?.notes ?? "");
  }, [customer?.notes]);

  const saveNotes = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.from("customers").update({ notes: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notizen gespeichert");
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("trash_entity", { _entity: "customer", _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kunde in den Papierkorb verschoben");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      navigate({ to: "/kunden" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Kundenakte wird geladen …</p>;
  }
  if (!customer) {
    return (
      <div className="space-y-4">
        <Link to="/kunden" className="inline-flex items-center gap-2 text-sm hover:underline">
          <ArrowLeft className="size-4" /> Zurück zur Kundenliste
        </Link>
        <p className="surface px-5 py-12 text-center text-sm text-muted-foreground">
          Kunde nicht gefunden oder gelöscht.
        </p>
      </div>
    );
  }

  const invoices = documents.filter((d) => d.type === "invoice" && d.status !== "draft");
  const revenue = invoices
    .filter((d) => d.status !== "cancelled")
    .reduce((sum, d) => sum + Number(d.net_total ?? 0), 0);
  const paid = invoices
    .filter((d) => d.status === "paid")
    .reduce((sum, d) => sum + Number(d.total ?? 0), 0);
  const open = invoices
    .filter((d) => d.status === "sent")
    .reduce((sum, d) => sum + Number(d.total ?? 0), 0);
  const overdue = invoices.filter(
    (d) => d.status === "sent" && d.due_date && d.due_date < today(),
  ).length;

  const status = STATUS_STYLE[customer.status ?? "active"] ?? STATUS_STYLE["active"]!;
  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours ?? 0), 0);
  const upcoming = entries.filter((e) => e.work_date >= today());
  const past = entries.filter((e) => e.work_date < today());
  const projectName = (pid: string | null) => projects.find((p) => p.id === pid)?.name ?? "";

  return (
    <div className="space-y-6">
      <Link to="/kunden" className="inline-flex items-center gap-2 text-sm hover:underline">
        <ArrowLeft className="size-4" /> Zurück zur Kundenliste
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{customer.company || customer.name || "Kunde"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            {customer.customer_number && (
              <span className="rounded bg-muted px-2 py-0.5 text-xs">
                {customer.customer_number}
              </span>
            )}
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
            <span className="text-sm">
              {[customer.name, customer.city].filter(Boolean).join(" · ")}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/kunden" className={buttonVariants({ variant: "outline" })}>
            Stammdaten bearbeiten
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <Trash2 className="size-4 text-destructive" /> Löschen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Kunde in den Papierkorb verschieben?</AlertDialogTitle>
                <AlertDialogDescription>
                  {documents.length > 0 || entries.length > 0
                    ? `Zu diesem Kunden gehören ${documents.length} Beleg(e) und ${entries.length} Zeiteintrag/Einsätze. Diese bleiben aus Nachvollziehbarkeits- und GoBD-Gründen vollständig erhalten und verlieren nur die aktive Verknüpfung in der Kundenliste. Der Kunde kann im Papierkorb wiederhergestellt werden.`
                    : "Der Kunde wird in den Papierkorb verschoben und kann dort wiederhergestellt werden."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: "destructive" })}
                  onClick={() => remove.mutate()}
                >
                  In den Papierkorb
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Überblick</TabsTrigger>
          <TabsTrigger value="documents">Belege ({documents.length})</TabsTrigger>
          <TabsTrigger value="calendar">Einsätze ({entries.length})</TabsTrigger>
          <TabsTrigger value="notes">Notizen</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Umsatz (netto)" value={formatMoney(revenue)} hint="alle Rechnungen" />
            <Kpi label="Bezahlt (brutto)" value={formatMoney(paid)} />
            <Kpi
              label="Offen (brutto)"
              value={formatMoney(open)}
              hint={overdue > 0 ? `${overdue} überfällig` : undefined}
            />
            <Kpi
              label="Geleistete Stunden"
              value={`${formatMoney(0).slice(0, 0)}${totalHours.toLocaleString("de-DE", { maximumFractionDigits: 2 })} h`}
            />
          </div>

          <div className="surface px-5 py-4">
            <h2 className="mb-2 font-semibold">Kontakt & Stammdaten</h2>
            <Row label="Ansprechpartner" value={customer.name} />
            <Row label="Firma" value={customer.company} />
            <Row label="E-Mail" value={customer.email} />
            <Row label="Telefon" value={customer.phone} />
            <Row
              label="Adresse"
              value={[
                customer.address_line,
                [customer.postal_code, customer.city].filter(Boolean).join(" "),
                customer.country,
              ]
                .filter((v) => v && String(v).trim())
                .join(", ")}
            />
            <Row label="USt-IdNr." value={customer.vat_id} />
            <Row
              label="EU-Ausland"
              value={customer.is_eu_customer ? "Ja (Reverse-Charge)" : "Nein"}
            />
            <Row label="Kunde seit" value={formatDate(customer.created_at)} />
          </div>

          {projects.length > 0 && (
            <div className="surface px-5 py-4">
              <h2 className="mb-2 font-semibold">Projekte</h2>
              <ul className="divide-y text-sm">
                {projects.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link
                      to="/projekte/$id"
                      params={{ id: p.id }}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents">
          <div className="surface overflow-hidden">
            {documents.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                Noch keine Angebote oder Rechnungen für diesen Kunden.
              </p>
            ) : (
              <ul className="divide-y">
                {documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/dokumente/$id"
                        params={{ id: d.id }}
                        className="font-medium hover:underline"
                      >
                        {DOC_TYPE_LABEL[d.type] ?? d.type} {d.number}
                      </Link>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(d.issue_date)}
                        {d.due_date ? ` · fällig ${formatDate(d.due_date)}` : ""}
                      </div>
                    </div>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                    <span className="w-28 text-right font-medium">
                      {formatMoney(Number(d.total ?? 0))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          {[
            { title: "Kommende Einsätze", rows: upcoming },
            { title: "Vergangene Einsätze", rows: past },
          ].map((block) => (
            <div key={block.title} className="surface overflow-hidden">
              <h2 className="border-b px-5 py-3 font-semibold">{block.title}</h2>
              {block.rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Keine Einträge.
                </p>
              ) : (
                <ul className="divide-y">
                  {block.rows.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                      <div className="w-28 shrink-0 text-sm font-medium">
                        {formatDate(e.work_date)}
                      </div>
                      <div className="min-w-0 flex-1 text-sm">
                        <div>
                          {e.employee_name || "—"}
                          {e.start_time && e.end_time
                            ? ` · ${String(e.start_time).slice(0, 5)}–${String(e.end_time).slice(0, 5)}`
                            : ""}
                        </div>
                        <div className="truncate text-muted-foreground">
                          {[projectName(e.project_id), e.location, e.note]
                            .filter((v) => v && String(v).trim())
                            .join(" · ") || "—"}
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {Number(e.hours ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 2 })}{" "}
                        h
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="notes">
          <div className="surface space-y-3 px-5 py-4">
            <h2 className="font-semibold">Betriebsanweisungen & Notizen</h2>
            <p className="text-sm text-muted-foreground">
              Zugangscodes, Schlüsselübergabe, Besonderheiten der Reinigung, Ansprechpartner vor
              Ort.
            </p>
            <Textarea
              value={notes}
              rows={10}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z. B. Schlüsselkasten Code 1234, Reinigung nur nach 18 Uhr …"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => saveNotes.mutate(notes)}
                disabled={saveNotes.isPending || notes === (customer.notes ?? "")}
              >
                Notizen speichern
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
