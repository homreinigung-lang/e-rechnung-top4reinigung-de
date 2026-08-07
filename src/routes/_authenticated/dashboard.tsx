import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, DOC_TYPE_LABEL, STATUS_LABEL } from "@/lib/format";
import { computeEuer } from "@/lib/euer";
import { dueInfo, mahnLabel } from "@/lib/workflow";
import { AlertTriangle, FileText, Plus, Receipt, TrendingDown, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Übersicht – Umsatz, Umsatzsteuer & Quartale" },
      {
        name: "description",
        content: "Offene Rechnungen, Umsatz und Umsatzsteuer je Quartal sowie Ausgaben im Blick.",
      },
      { property: "og:title", content: "Übersicht – Rechnungen & Angebote" },
      { property: "og:description", content: "Umsatz, Umsatzsteuer und Quartalszahlen auf einen Blick." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const year = new Date().getFullYear();

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [docs, customers, expenses] = await Promise.all([
        supabase
          .from("documents")
          .select(
            "id, type, number, status, issue_date, due_date, reminder_level, total, net_total, vat_amount, customer_name, customer_company",
          )
          .order("issue_date", { ascending: false }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("expenses").select("expense_date, net_amount, gross_amount, vat_amount"),
      ]);
      if (docs.error) throw docs.error;
      return {
        docs: docs.data ?? [],
        customerCount: customers.count ?? 0,
        expenses: expenses.data ?? [],
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
    return { q, net, vat, expNet, profit: net - expNet };
  });

  const inYear = (v?: string | null) => String(v ?? "").slice(0, 4) === String(year);
  const euer = computeEuer(
    docs.filter((d) => inYear(d.issue_date)),
    expenses.filter((e) => inYear(e.expense_date)),
    `${year}-01-01`,
    `${year}-12-31`,
  );

  const stats = [
    { label: "Offene Rechnungen", value: formatMoney(openTotal), icon: Receipt },
    { label: "Bezahlt", value: formatMoney(paidTotal), icon: Receipt },
    { label: "Ausgaben", value: formatMoney(expenseTotal), icon: TrendingDown },
    { label: "Kunden", value: String(data?.customerCount ?? 0), icon: Users },
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
        <Button asChild>
          <Link to="/dokumente">
            <Plus className="size-4" /> Neues Dokument
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Offene Posten</h2>
          <span className="text-sm text-muted-foreground">
            {openItems.length} offen · {openItems.filter((o) => o.due?.overdue).length} überfällig
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

      <div className="surface overflow-hidden">
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
            <div className="mt-1 text-xs text-muted-foreground">
              {euer.incomeCount} Rechnungen
            </div>
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
      </div>


      <div className="surface overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Quartale {year} – Umsatz & Umsatzsteuer</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="px-5 py-3">Quartal</th>
                <th className="px-5 py-3 text-right">Umsatz netto</th>
                <th className="px-5 py-3 text-right">Umsatzsteuer</th>
                <th className="px-5 py-3 text-right">Ausgaben netto</th>
                <th className="px-5 py-3 text-right">Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q) => (
                <tr key={q.q} className="border-b last:border-0">
                  <td className="px-5 py-3 font-medium">Q{q.q}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(q.net)}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(q.vat)}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(q.expNet)}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatMoney(q.profit)}</td>
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
