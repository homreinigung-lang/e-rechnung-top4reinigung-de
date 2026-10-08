import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LoadError } from "@/components/LoadError";
import { summarizeOpenInvoices } from "@/lib/open-invoices";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatDate, formatMoney, DOC_TYPE_LABEL, STATUS_LABEL } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { fetchEuerDocuments, fetchEuerExpenses } from "@/lib/euer-data";
import { FinanzDashboard } from "@/components/FinanzDashboard";
import { EinsaetzeHeute } from "@/components/EinsaetzeHeute";
import { TrialBanner } from "@/components/TrialBanner";
import { createDocument } from "@/lib/create-document";
import { useMyEmployee, type MyEmployee } from "@/lib/employee";
import { dueInfo, mahnLabel } from "@/lib/workflow";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  FileText,
  LayoutDashboard,
  Plus,
  Receipt,
  TrendingDown,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Startseite – Finanzübersicht & offene Posten" },
      {
        name: "description",
        content:
          "Finanzübersicht, Quartale, Einsätze, Schnellaktionen und offene Rechnungen auf einen Blick.",
      },
      { property: "og:title", content: "Startseite – Finanzübersicht" },
      {
        property: "og:description",
        content: "Die wichtigsten Finanz- und Betriebsdaten kompakt auf einer Seite.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: myEmployee, isPending } = useMyEmployee();
  if (isPending) return <p className="text-muted-foreground">Wird geladen …</p>;
  if (myEmployee) return <EmployeeDashboard employee={myEmployee} />;
  return <AdminDashboard />;
}

function EmployeeDashboard({ employee }: { employee: MyEmployee }) {
  const {
    data: entries = [],
    error,
    isPending: entriesPending,
    refetch,
  } = useQuery({
    queryKey: ["my_time_entries", employee.id],
    queryFn: () =>
      fetchAllRows(() =>
        supabase
          .from("time_entries")
          .select("id, work_date, start_time, end_time, hours, location, note")
          .eq("employee_id", employee.id)
          .order("work_date", { ascending: false }),
      ),
  });

  if (error)
    return (
      <LoadError
        error={error}
        title="Arbeitszeiten konnten nicht geladen werden"
        onRetry={() => void refetch()}
      />
    );
  if (entriesPending)
    return (
      <p role="status" className="text-muted-foreground">
        Arbeitszeiten werden geladen …
      </p>
    );

  const month = new Date().toISOString().slice(0, 7);
  const inMonth = entries.filter((e) => String(e.work_date).startsWith(month));
  const sum = (rows: typeof entries) => rows.reduce((s, e) => s + Number(e.hours || 0), 0);
  const days = new Set(inMonth.map((e) => e.work_date)).size;
  const hoursText = (h: number) => `${h.toFixed(2).replace(".", ",")} Std.`;

  const stats = [
    { label: "Stunden diesen Monat", value: hoursText(sum(inMonth)), icon: Clock },
    { label: "Arbeitstage diesen Monat", value: String(days), icon: CalendarClock },
    { label: "Stunden gesamt", value: hoursText(sum(entries)), icon: Clock },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Meine Übersicht</h1>
          <p className="mt-1 text-muted-foreground">
            {employee.name} · Ihre erfassten Arbeitszeiten und Stunden.
          </p>
        </div>
        <Button asChild>
          <Link to="/meine-zeiten">
            <Clock className="size-4" /> Zeit erfassen
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="size-4 text-primary" />
            </div>
            <div className="mt-3 font-display text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="surface overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Zuletzt erfasste Zeiten</h2>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Noch keine Arbeitszeiten erfasst.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.slice(0, 10).map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <div className="font-medium">{formatDate(String(e.work_date))}</div>
                  <div className="text-sm text-muted-foreground">
                    {[
                      e.start_time && e.end_time
                        ? `${String(e.start_time).slice(0, 5)}–${String(e.end_time).slice(0, 5)}`
                        : null,
                      e.location || null,
                      e.note || null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <div className="font-medium">{hoursText(Number(e.hours || 0))}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const QUICK_LINKS = [
  { to: "/dashboard", search: {}, label: "Startseite", icon: LayoutDashboard },
  { to: "/kunden", search: {}, label: "Kunden", icon: Users },
  {
    to: "/dokumente",
    search: { tab: "quote" as const },
    label: "Angebote",
    icon: FileText,
  },
  {
    to: "/dokumente",
    search: { tab: "invoice" as const },
    label: "Rechnungen",
    icon: Receipt,
  },
] as const;

function AdminDashboard() {
  const navigate = useNavigate();
  const year = new Date().getFullYear();

  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [docs, expenses] = await Promise.all([fetchEuerDocuments(), fetchEuerExpenses()]);
      return { docs, expenses };
    },
  });

  if (error)
    return (
      <LoadError
        error={error}
        title="Finanzübersicht konnte nicht geladen werden"
        onRetry={() => void refetch()}
      />
    );
  if (isPending)
    return (
      <p role="status" className="p-5 text-muted-foreground">
        Finanzübersicht wird geladen …
      </p>
    );

  const docs = data?.docs ?? [];
  const expenses = data?.expenses ?? [];
  const invoices = docs.filter(
    (d) =>
      d.type === "invoice" &&
      d.status !== "cancelled" &&
      !(d as unknown as Record<string, unknown>)["is_storno"],
  );

  const { items: openInvoices, total: openTotal } = summarizeOpenInvoices(invoices);
  const openItems = openInvoices
    .map((d) => ({
      d,
      due: dueInfo(d.due_date, d.status),
      level: Number((d as unknown as Record<string, unknown>)["reminder_level"] ?? 0),
    }))
    .sort((a, b) => String(a.d.due_date ?? "").localeCompare(String(b.d.due_date ?? "")));

  const quarters = [1, 2, 3, 4].map((q) => {
    const inQuarter = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.getFullYear() === year && Math.floor(date.getMonth() / 3) + 1 === q;
    };

    const paidInvoices = invoices.filter((d) => {
      if (d.status !== "paid") return false;
      const paidAt = String((d as unknown as Record<string, unknown>)["paid_at"] ?? d.issue_date);
      return inQuarter(paidAt);
    });
    const quarterExpenses = expenses.filter((e) => inQuarter(e.expense_date));

    const revenueNet = paidInvoices.reduce((sum, d) => sum + Number(d.net_total || d.total), 0);
    const vat = paidInvoices.reduce((sum, d) => sum + Number(d.vat_amount), 0);
    const expenseNet = quarterExpenses.reduce((sum, e) => sum + Number(e.net_amount), 0);
    const inputVat = quarterExpenses.reduce((sum, e) => sum + Number(e.vat_amount), 0);
    const profit = revenueNet - expenseNet;
    const vatBalance = vat - inputVat;

    return { q, revenueNet, vat, inputVat, expenseNet, profit, vatBalance };
  });

  return (
    <div className="space-y-8">
      <TrialBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Startseite</h1>
          <p className="mt-1 text-muted-foreground">
            Finanzen, Quartale, Einsätze und offene Vorgänge – übersichtlich auf einen Blick.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/steuerberater">
              <FileText className="size-4" /> Finanzbericht
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="size-4" /> Neues Dokument
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() => {
                  void createDocument("invoice")
                    .then((docId) =>
                      navigate({
                        to: "/dokumente/$id",
                        params: { id: docId },
                        search: { bearbeiten: true },
                      }),
                    )
                    .catch((e: Error) => toast.error(e.message));
                }}
              >
                <Receipt className="size-4" /> Rechnung erstellen
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void createDocument("quote")
                    .then((docId) =>
                      navigate({
                        to: "/dokumente/$id",
                        params: { id: docId },
                        search: { bearbeiten: true },
                      }),
                    )
                    .catch((e: Error) => toast.error(e.message));
                }}
              >
                <FileText className="size-4" /> Angebot erstellen
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void navigate({ to: "/ausgaben" })}>
                <TrendingDown className="size-4" /> Beleg hinzufügen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <FinanzDashboard docs={docs} expenses={expenses} />

      <section className="surface overflow-hidden" aria-label={`Quartale ${year}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Quartale {year} · Umsatzsteuer</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Kompakte Quartalsübersicht auf Basis bezahlter Rechnungen (Ist-Versteuerung).
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/steuerberater">
              <FileText className="size-4" /> Details öffnen
            </Link>
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="px-5 py-3">Quartal</th>
                <th className="px-5 py-3 text-right">Umsatz netto</th>
                <th className="px-5 py-3 text-right">USt</th>
                <th className="px-5 py-3 text-right">Vorsteuer</th>
                <th className="px-5 py-3 text-right">Ausgaben netto</th>
                <th className="px-5 py-3 text-right">Ergebnis</th>
                <th className="px-5 py-3 text-right">USt-Saldo</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((quarter) => (
                <tr key={quarter.q} className="border-b last:border-0">
                  <td className="px-5 py-3 font-semibold">Q{quarter.q}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(quarter.revenueNet)}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(quarter.vat)}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(quarter.inputVat)}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(quarter.expenseNet)}</td>
                  <td className="px-5 py-3 text-right font-medium">
                    {formatMoney(quarter.profit)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="font-semibold">{formatMoney(Math.abs(quarter.vatBalance))}</div>
                    <div
                      className={
                        quarter.vatBalance > 0
                          ? "text-xs font-medium text-destructive"
                          : quarter.vatBalance < 0
                            ? "text-xs font-medium text-primary"
                            : "text-xs text-muted-foreground"
                      }
                    >
                      {quarter.vatBalance > 0
                        ? "Zahllast"
                        : quarter.vatBalance < 0
                          ? "Erstattung"
                          : "ausgeglichen"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <EinsaetzeHeute />

      <section aria-label="Schnellaktionen" className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Schnellaktionen</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Die häufigsten Vorgänge direkt von der Startseite ausführen.
            </p>
          </div>
          <nav aria-label="Schnellzugriff" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {QUICK_LINKS.map((q) => (
              <Link
                key={q.label}
                to={q.to}
                search={q.search}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <q.icon className="size-4" /> {q.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            className="h-auto justify-start py-3"
            onClick={() => {
              void createDocument("invoice")
                .then((docId) =>
                  navigate({
                    to: "/dokumente/$id",
                    params: { id: docId },
                    search: { bearbeiten: true },
                  }),
                )
                .catch((e: Error) => toast.error(e.message));
            }}
          >
            <Receipt className="size-4" /> Neue Rechnung
          </Button>
          <Button asChild variant="secondary" className="h-auto justify-start py-3">
            <Link to="/ausgaben">
              <TrendingDown className="size-4" /> Beleg hinzufügen
            </Link>
          </Button>
          <Button asChild variant="secondary" className="h-auto justify-start py-3">
            <Link to="/kunden" search={{}}>
              <Users className="size-4" /> Kunde anlegen
            </Link>
          </Button>
          <Button asChild variant="secondary" className="h-auto justify-start py-3">
            <Link to="/team">
              <CalendarClock className="size-4" /> Einsatz planen
            </Link>
          </Button>
        </div>
      </section>

      <section className="surface overflow-hidden" aria-label="Offene Rechnungen">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Offene Rechnungen</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Nur Vorgänge, bei denen noch eine Zahlung aussteht.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {formatMoney(openTotal)} · {openItems.length} offen ·{" "}
            {openItems.filter((o) => o.due?.overdue).length} überfällig
          </span>
        </div>
        {openItems.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Keine offenen Rechnungen – alles bezahlt.
          </p>
        ) : (
          <ul className="divide-y">
            {openItems.slice(0, 6).map(({ d, due, level }) => (
              <li key={d.id}>
                <Link
                  to="/dokumente/$id"
                  params={{ id: d.id }}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
                >
                  <div>
                    <div className="font-medium">Rechnung {d.number}</div>
                    <div className="text-sm text-muted-foreground">
                      {d.customer_company || d.customer_name || "Ohne Kunde"} · fällig{" "}
                      {formatDate(d.due_date)}
                      {level > 0 ? ` · ${mahnLabel(level)}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatMoney(Number(d.total))}</div>
                    <div
                      className={`inline-flex items-center gap-1 text-xs ${
                        due?.overdue ? "font-medium text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {due?.overdue && <AlertTriangle className="size-3" />}
                      {due?.label ?? "Ohne Fälligkeitsdatum"}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {openItems.length > 6 && (
          <div className="border-t px-5 py-3 text-right">
            <Button asChild variant="ghost" size="sm">
              <Link to="/dokumente" search={{ tab: "invoice" }}>
                Alle Rechnungen anzeigen
              </Link>
            </Button>
          </div>
        )}
      </section>

      <section className="surface overflow-hidden" aria-label="Zuletzt erstellt">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Zuletzt erstellt</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Die letzten Dokumente zur schnellen Kontrolle.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dokumente" search={{ tab: "invoice" }}>
              Dokumente öffnen
            </Link>
          </Button>
        </div>
        {docs.filter((d) => !(d as unknown as Record<string, unknown>)["is_storno"]).length ===
        0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Noch keine Dokumente vorhanden.
          </p>
        ) : (
          <ul className="divide-y">
            {docs
              .filter((d) => !(d as unknown as Record<string, unknown>)["is_storno"])
              .slice(0, 5)
              .map((d) => (
                <li key={d.id}>
                  <Link
                    to="/dokumente/$id"
                    params={{ id: d.id }}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
                  >
                    <div>
                      <div className="font-medium">
                        {DOC_TYPE_LABEL[d.type]} {d.number}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {d.customer_company || d.customer_name || "Ohne Kunde"} ·{" "}
                        {formatDate(d.issue_date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatMoney(Number(d.total))}</div>
                      <div className="text-xs text-muted-foreground">{STATUS_LABEL[d.status]}</div>
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
