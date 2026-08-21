import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { computeEuer } from "@/lib/euer";
import { fetchEuerDocuments, fetchEuerExpenses } from "@/lib/euer-data";
import { EuerChart } from "@/components/EuerChart";
import { FinanzDashboard } from "@/components/FinanzDashboard";
import { EinsaetzeHeute } from "@/components/EinsaetzeHeute";
import { createDocument } from "@/lib/create-document";
import { useMyEmployee, type MyEmployee } from "@/lib/employee";
import { dueInfo, mahnLabel } from "@/lib/workflow";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  Plus,
  Receipt,
  TrendingDown,
  Users,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Übersicht – Umsatz, Umsatzsteuer & Quartale" },
      {
        name: "description",
        content: "Offene Rechnungen, Umsatz und Umsatzsteuer je Quartal sowie Ausgaben im Blick.",
      },
      { property: "og:title", content: "Übersicht – Rechnungen & Angebote" },
      {
        property: "og:description",
        content: "Umsatz, Umsatzsteuer und Quartalszahlen auf einen Blick.",
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

/** Mitarbeiter-Ansicht: ausschließlich eigene Zeiterfassung und Arbeitsstunden. */
function EmployeeDashboard({ employee }: { employee: MyEmployee }) {
  const { data: entries = [] } = useQuery({
    queryKey: ["my_time_entries", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, work_date, start_time, end_time, hours, location, note")
        .eq("employee_id", employee.id)
        .order("work_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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

/** Schnellzugriff-Kacheln auf der Startseite. */
const QUICK_LINKS = [
  {
    to: "/dashboard",
    search: {},
    label: "Startseite",
    hint: "Zahlen & offene Posten",
    icon: LayoutDashboard,
  },
  { to: "/kunden", search: {}, label: "Kunden", hint: "Kundenstamm verwalten", icon: Users },
  {
    to: "/dokumente",
    search: { tab: "quote" as const },
    label: "Angebote",
    hint: "Angebote erstellen & prüfen",
    icon: FileText,
  },
  {
    to: "/dokumente",
    search: { tab: "invoice" as const },
    label: "Rechnungen",
    hint: "Rechnungen & Zahlungen",
    icon: Receipt,
  },
] as const;

function AdminDashboard() {
  const navigate = useNavigate();

  const year = new Date().getFullYear();

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [docs, customers, expenses] = await Promise.all([
        fetchEuerDocuments(),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        fetchEuerExpenses(),
      ]);
      return {
        docs,
        customerCount: customers.count ?? 0,
        expenses,
      };
    },
  });

  const docs = data?.docs ?? [];
  const expenses = data?.expenses ?? [];
  const invoices = docs.filter((d) => d.type === "invoice" && d.status !== "cancelled");
  const openTotal = invoices
    .filter((d) => d.status !== "paid")
    .reduce((sum, d) => sum + Number(d.total), 0);
  const paidTotal = invoices
    .filter((d) => d.status === "paid")
    .reduce((sum, d) => sum + Number(d.total), 0);
  const openItems = invoices
    .filter((d) => d.status !== "paid" && d.status !== "draft")
    .map((d) => ({
      d,
      due: dueInfo(d.due_date, d.status),
      level: Number((d as unknown as Record<string, unknown>)["reminder_level"] ?? 0),
    }))
    .sort((a, b) => String(a.d.due_date ?? "").localeCompare(String(b.d.due_date ?? "")));
  const quotes = docs.filter((d) => d.type === "quote");
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.gross_amount), 0);

  const quarters = [1, 2, 3, 4].map((q) => {
    const inQ = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.getFullYear() === year && Math.floor(d.getMonth() / 3) + 1 === q;
    };
    const rows = invoices.filter((d) => inQ(d.issue_date));
    const exp = expenses.filter((e) => inQ(e.expense_date));
    const net = rows.reduce((s, d) => s + Number(d.net_total || d.total), 0);
    const vat = rows.reduce((s, d) => s + Number(d.vat_amount), 0);
    const expNet = exp.reduce((s, e) => s + Number(e.net_amount), 0);
    const expVat = exp.reduce((s, e) => s + Number(e.vat_amount), 0);
    return { q, net, vat, expNet, expVat, balance: vat - expVat, profit: net - expNet };
  });

  const inYear = (v?: string | null) => String(v ?? "").slice(0, 4) === String(year);
  const euer = computeEuer(
    docs.filter((d) => inYear(d.issue_date)),
    expenses.filter((e) => inYear(e.expense_date)),
    `${year}-01-01`,
    `${year}-12-31`,
  );

  const stats = [
    {
      label: `Umsatz ${year} (netto)`,
      value: formatMoney(euer.incomeNet),
      icon: Receipt,
      accent: "",
    },
    { label: "Bezahlt", value: formatMoney(paidTotal), icon: CheckCircle2, accent: "" },
    {
      label: "Ausgaben (brutto)",
      value: formatMoney(expenseTotal),
      icon: TrendingDown,
      accent: "",
    },
    {
      label: euer.profit >= 0 ? "Saldo (Gewinn netto)" : "Saldo (Verlust netto)",
      value: formatMoney(euer.profit),
      icon: LayoutDashboard,
      accent: euer.profit >= 0 ? "text-primary" : "text-destructive",
    },
  ];

  const acceptedQuotes = quotes.filter((d) => d.status === "accepted").length;
  const declinedQuotes = quotes.filter((d) => d.status === "declined").length;
  const kpis = [
    { label: "Rechnungen", value: String(invoices.length), icon: Receipt, accent: "text-primary" },
    { label: "Angebote", value: String(quotes.length), icon: FileText, accent: "text-primary" },
    {
      label: "Angenommen",
      value: String(acceptedQuotes),
      icon: CheckCircle2,
      accent: "text-primary",
    },
    {
      label: "Abgelehnt",
      value: String(declinedQuotes),
      icon: XCircle,
      accent: "text-destructive",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Übersicht</h1>
          <p className="mt-1 text-muted-foreground">
            Umsatz, Umsatzsteuer und Ergebnis – konform zu § 14 UStG.
          </p>
        </div>
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

      {/* 1. Finanzkennzahlen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="size-4 text-primary" />
            </div>
            <div className={`mt-3 font-display text-2xl font-semibold ${s.accent}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* 2. Operativer Bereich: heutige Einsätze */}
      <EinsaetzeHeute />

      {/* 3. Schnellaktionen */}
      <section aria-label="Schnellaktionen" className="surface p-5">
        <h2 className="font-semibold">Schnellaktionen</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Die häufigsten Vorgänge – direkt aus der Übersicht.
        </p>
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
        <nav
          aria-label="Schnellzugriff"
          className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-sm"
        >
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
      </section>

      <FinanzDashboard docs={docs} expenses={expenses} />

      <div className="surface overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Belege im Überblick</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Anzahl der Rechnungen und Angebote sowie deren Status.
          </p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <k.icon className={`size-4 ${k.accent}`} />
              </div>
              <div className="mt-3 font-display text-3xl font-semibold">{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Offene Posten</h2>
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
            {openItems.map(({ d, due, level }) => (
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
      </div>

      <div id="euer" className="surface scroll-mt-24 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">EÜR {year} – Einnahmenüberschussrechnung</h2>
            <p className="text-sm text-muted-foreground">
              Betriebseinnahmen abzüglich Betriebsausgaben (§ 4 Abs. 3 EStG), netto.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/steuerberater">
              <FileText className="size-4" /> Vollständiger Bericht
            </Link>
          </Button>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-3">
          <div className="bg-card p-5">
            <div className="text-sm text-muted-foreground">Betriebseinnahmen (netto)</div>
            <div className="mt-2 font-display text-2xl font-semibold">
              {formatMoney(euer.incomeNet)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{euer.incomeCount} Rechnungen</div>
          </div>
          <div className="bg-card p-5">
            <div className="text-sm text-muted-foreground">Betriebsausgaben (netto)</div>
            <div className="mt-2 font-display text-2xl font-semibold">
              {formatMoney(euer.expenseNet)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{euer.expenseCount} Belege</div>
          </div>
          <div className="bg-card p-5">
            <div className="text-sm text-muted-foreground">
              {euer.profit >= 0 ? "Gewinn (netto)" : "Verlust (netto)"}
            </div>
            <div
              className={`mt-2 font-display text-2xl font-semibold ${
                euer.profit >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {formatMoney(euer.profit)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              USt vereinnahmt {formatMoney(euer.incomeVat)} · Vorsteuer{" "}
              {formatMoney(euer.expenseVat)}
            </div>
          </div>
        </div>
        <div className="p-5">
          <EuerChart year={year} docs={docs} expenses={expenses} />
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Quartale {year} – Umsatzsteuer-Voranmeldung</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Endabrechnung je Quartal: Umsatzsteuer abzüglich Vorsteuer ergibt Zahllast (an das
            Finanzamt) oder Erstattung (vom Finanzamt).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="px-5 py-3">Quartal</th>
                <th className="px-5 py-3 text-right">Umsatz netto</th>
                <th className="px-5 py-3 text-right">Umsatzsteuer</th>
                <th className="px-5 py-3 text-right">Vorsteuer</th>
                <th className="px-5 py-3 text-right">Ausgaben netto</th>
                <th className="px-5 py-3 text-right">Ergebnis</th>
                <th className="px-5 py-3 text-right">Endabrechnung</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q) => (
                <tr key={q.q} className="border-b last:border-0">
                  <td className="px-5 py-3 font-medium">Q{q.q}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(q.net)}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(q.vat)}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(q.expVat)}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(q.expNet)}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatMoney(q.profit)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="font-semibold">{formatMoney(Math.abs(q.balance))}</div>
                    <div
                      className={
                        q.balance > 0
                          ? "text-xs font-medium text-destructive"
                          : q.balance < 0
                            ? "text-xs font-medium text-primary"
                            : "text-xs text-muted-foreground"
                      }
                    >
                      {q.balance > 0 ? "Zahllast" : q.balance < 0 ? "Erstattung" : "ausgeglichen"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Zuletzt erstellt</h2>
        </div>
        {docs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Noch keine Dokumente vorhanden.
          </p>
        ) : (
          <ul className="divide-y">
            {docs.slice(0, 8).map((d) => (
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
      </div>
    </div>
  );
}
