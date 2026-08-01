import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, DOC_TYPE_LABEL, STATUS_LABEL } from "@/lib/format";
import { FileText, Plus, Receipt, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Übersicht – Rechnungen & Angebote" },
      { name: "description", content: "Überblick über offene Rechnungen, Angebote und Umsätze." },
      { property: "og:title", content: "Übersicht – Rechnungen & Angebote" },
      { property: "og:description", content: "Offene Rechnungen, Angebote und Umsätze auf einen Blick." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [docs, customers] = await Promise.all([
        supabase
          .from("documents")
          .select("id, type, number, status, issue_date, total, customer_name, customer_company")
          .order("issue_date", { ascending: false })
          .limit(50),
        supabase.from("customers").select("id", { count: "exact", head: true }),
      ]);
      if (docs.error) throw docs.error;
      return { docs: docs.data ?? [], customerCount: customers.count ?? 0 };
    },
  });

  const docs = data?.docs ?? [];
  const invoices = docs.filter((d) => d.type === "invoice");
  const openTotal = invoices
    .filter((d) => d.status !== "paid" && d.status !== "cancelled")
    .reduce((sum, d) => sum + Number(d.total), 0);
  const paidTotal = invoices
    .filter((d) => d.status === "paid")
    .reduce((sum, d) => sum + Number(d.total), 0);
  const quotes = docs.filter((d) => d.type === "quote");

  const stats = [
    { label: "Offene Rechnungen", value: formatMoney(openTotal), icon: Receipt },
    { label: "Bezahlt", value: formatMoney(paidTotal), icon: Receipt },
    { label: "Angebote", value: String(quotes.length), icon: FileText },
    { label: "Kunden", value: String(data?.customerCount ?? 0), icon: Users },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Übersicht</h1>
          <p className="mt-1 text-muted-foreground">
            Reinigungsdienstleistungen abrechnen – ohne Umsatzsteuer (Reverse Charge, EU).
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
