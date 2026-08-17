import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import { buildGobdExport, downloadBlob } from "@/lib/gobd";
import { saveFile } from "@/lib/download";
import {
  Archive,
  Calculator,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { buildEuerCsv, buildEuerPdf, computeEuer } from "@/lib/euer";
import { AccountantAccessCard } from "@/components/AccountantAccessCard";

export const Route = createFileRoute("/_authenticated/steuerberater")({
  head: () => ({
    meta: [
      { title: "Steuerberater – DATEV, Excel & PDF Export" },
      {
        name: "description",
        content:
          "Auswertung für den Steuerberater: Umsatz, Umsatzsteuer und Ausgaben je Zeitraum als DATEV-CSV, Excel oder PDF exportieren.",
      },
      { property: "og:title", content: "Steuerberater-Auswertung" },
      {
        property: "og:description",
        content: "Umsätze, Vorsteuer und Zahllast exportieren – DATEV, Excel, PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Steuerberater,
});

type Row = Record<string, string>;

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function download(name: string, blob: Blob) {
  void saveFile(blob, name);
}

function downloadCsv(name: string, rows: Row[]) {
  if (rows.length === 0) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  const headers = Object.keys(rows[0]!);
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(";")),
  ].join("\r\n");
  download(name, new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
}

function downloadExcel(name: string, sheets: { title: string; rows: Row[] }[]) {
  const tables = sheets
    .filter((s) => s.rows.length > 0)
    .map((s) => {
      const headers = Object.keys(s.rows[0]!);
      return `<h3>${s.title}</h3><table border="1"><tr>${headers
        .map((h) => `<th>${h}</th>`)
        .join("")}</tr>${s.rows
        .map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`)
        .join("")}</table>`;
    })
    .join("<br/>");
  if (!tables) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body>${tables}</body></html>`;
  download(name, new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" }));
}

function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

function de(v: number) {
  return v.toFixed(2).replace(".", ",");
}

function Steuerberater() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data: documents = [] } = useQuery({
    queryKey: ["stb_documents", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("type", "invoice")
        .gte("issue_date", from)
        .lte("issue_date", to)
        .order("issue_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["stb_expenses", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["stb_audit", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_audit_log")
        .select("*")
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const gobdExport = useMutation({
    mutationFn: async () => {
      const blob = await buildGobdExport(from, to);
      await downloadBlob(blob, `GoBD-Pruefexport_${from}_${to}.zip`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: settings } = useQuery({
    queryKey: ["stb_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("company_name").maybeSingle();
      return data ?? null;
    },
  });

  const euer = useMemo(
    () =>
      computeEuer(
        documents as unknown as Record<string, unknown>[],
        expenses as unknown as Record<string, unknown>[],
        from,
        to,
      ),
    [documents, expenses, from, to],
  );

  const euerPdf = useMutation({
    mutationFn: async () => {
      const blob = await buildEuerPdf(euer, settings?.company_name ?? "Hom Reinigung Service");
      await saveFile(blob, `EUER_${from}_${to}.pdf`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    const net = documents.reduce(
      (s, d) => s + num((d as Record<string, unknown>)["net_total"] ?? d.total),
      0,
    );
    const vat = documents.reduce(
      (s, d) => s + num((d as Record<string, unknown>)["vat_amount"]),
      0,
    );
    const gross = documents.reduce((s, d) => s + num(d.total), 0);
    const expNet = expenses.reduce((s, e) => s + num(e.net_amount), 0);
    const expVat = expenses.reduce((s, e) => s + num(e.vat_amount), 0);
    const expGross = expenses.reduce((s, e) => s + num(e.gross_amount), 0);
    return {
      net,
      vat,
      gross,
      expNet,
      expVat,
      expGross,
      zahllast: vat - expVat,
      ergebnis: net - expNet,
    };
  }, [documents, expenses]);

  const docRows: Row[] = documents.map((d) => ({
    Belegdatum: formatDate(d.issue_date),
    Rechnungsnummer: d.number,
    Kunde: d.customer_company || d.customer_name,
    "USt-IdNr. Kunde": String((d as Record<string, unknown>)["customer_vat_id"] ?? ""),
    Bestellnummer: String((d as Record<string, unknown>)["order_number"] ?? ""),
    Netto: de(num((d as Record<string, unknown>)["net_total"] ?? d.total)),
    Umsatzsteuer: de(num((d as Record<string, unknown>)["vat_amount"])),
    Brutto: de(num(d.total)),
    Steuerart:
      (d as Record<string, unknown>)["tax_mode"] === "domestic"
        ? "19% Inland"
        : "Reverse-Charge (§ 13b UStG)",
    Status: String(d.status),
  }));

  const expenseRows: Row[] = expenses.map((e) => ({
    Belegdatum: formatDate(e.expense_date),
    Belegnummer: e.document_number,
    Lieferant: e.supplier,
    Kategorie: e.category,
    Netto: de(num(e.net_amount)),
    Vorsteuer: de(num(e.vat_amount)),
    Brutto: de(num(e.gross_amount)),
    Notiz: e.notes,
  }));

  // DATEV-kompatibler Buchungsstapel (vereinfacht, EXTF-Spaltennamen).
  const datevRows: Row[] = [
    ...documents.map((d) => ({
      Umsatz: de(num(d.total)),
      "Soll/Haben-Kennzeichen": "S",
      "WKZ Umsatz": "EUR",
      Konto: "10000",
      "Gegenkonto (ohne BU-Schlüssel)":
        (d as Record<string, unknown>)["tax_mode"] === "domestic" ? "8400" : "8336",
      "BU-Schlüssel": "",
      Belegdatum: formatDate(d.issue_date).slice(0, 5).replace(".", ""),
      Belegfeld1: d.number,
      Buchungstext: (d.customer_company || d.customer_name).slice(0, 60),
    })),
    ...expenses.map((e) => ({
      Umsatz: de(num(e.gross_amount)),
      "Soll/Haben-Kennzeichen": "H",
      "WKZ Umsatz": "EUR",
      Konto: "6300",
      "Gegenkonto (ohne BU-Schlüssel)": "70000",
      "BU-Schlüssel": num(e.vat_amount) > 0 ? "9" : "",
      Belegdatum: formatDate(e.expense_date).slice(0, 5).replace(".", ""),
      Belegfeld1: e.document_number,
      Buchungstext: e.supplier.slice(0, 60),
    })),
  ];

  const AUDIT_LABEL: Record<string, string> = {
    finalized: "Festgeschrieben",
    archived: "PDF archiviert",
    storno_created: "Stornorechnung erstellt",
    cancelled: "Storniert",
    sent: "Versendet",
    gobd_export: "GoBD-Export",
    xrechnung_export: "XRechnung (XML) erstellt",
    zugferd_export: "ZUGFeRD-PDF erstellt",
  };

  const auditRows: Row[] = auditLog.map((a) => ({
    Zeitpunkt: new Date(a.created_at).toLocaleString("de-DE-u-ca-gregory-nu-latn"),
    Beleg: a.document_number,
    Vorgang: AUDIT_LABEL[a.action] ?? a.action,
    Details: JSON.stringify(a.details),
  }));

  const period = `${from}_${to}`;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="font-display text-2xl font-semibold">Steuerberater</h1>
        <p className="text-sm text-muted-foreground">
          Auswertung und Belegexport für Ihren Steuerberater – DATEV-Buchungsstapel, Excel oder PDF.
        </p>
      </div>

      <div className="no-print">
        <AccountantAccessCard />
      </div>

      <section className="no-print grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="from">Zeitraum von</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Zeitraum bis</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {[1, 2, 3, 4].map((q) => (
            <Button
              key={q}
              variant="outline"
              size="sm"
              onClick={() => {
                const startMonth = (q - 1) * 3;
                const start = new Date(Date.UTC(year, startMonth, 1));
                const end = new Date(Date.UTC(year, startMonth + 3, 0));
                setFrom(start.toISOString().slice(0, 10));
                setTo(end.toISOString().slice(0, 10));
              }}
            >
              Q{q} {year}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom(`${year}-01-01`);
              setTo(`${year}-12-31`);
            }}
          >
            Gesamtes Jahr {year}
          </Button>
        </div>
      </section>

      <section className="no-print flex flex-wrap gap-2">
        <Button onClick={() => downloadCsv(`DATEV_Buchungsstapel_${period}.csv`, datevRows)}>
          <Download className="size-4" /> DATEV-Export (CSV)
        </Button>
        <Button variant="outline" onClick={() => downloadCsv(`Rechnungen_${period}.csv`, docRows)}>
          <Download className="size-4" /> Rechnungen (CSV)
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadCsv(`Ausgaben_${period}.csv`, expenseRows)}
        >
          <Download className="size-4" /> Ausgaben (CSV)
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadExcel(`Steuerauswertung_${period}.xls`, [
              { title: "Rechnungen", rows: docRows },
              { title: "Ausgaben", rows: expenseRows },
            ])
          }
        >
          <FileSpreadsheet className="size-4" /> Excel-Export
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Als PDF drucken
        </Button>
      </section>

      <section className="no-print rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <ShieldCheck className="size-4 text-primary" /> GoBD-Prüfexport (Betriebsprüfung)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enthält Belegdaten, Positionen, das unveränderbare Prüfprotokoll (Audit-Log) sowie
              alle archivierten Original-PDF-Dateien des gewählten Zeitraums als ZIP-Archiv.
            </p>
          </div>
          <Button onClick={() => gobdExport.mutate()} disabled={gobdExport.isPending}>
            <Archive className="size-4" />
            {gobdExport.isPending ? "Export wird erstellt…" : "GoBD-Export herunterladen"}
          </Button>
        </div>

        <h3 className="mt-5 font-display text-sm font-semibold">
          Prüfprotokoll (letzte Einträge im Zeitraum)
        </h3>
        <Table rows={auditRows} empty="Noch keine protokollierten Vorgänge im Zeitraum." />
      </section>

      <section className="print-area rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Calculator className="size-5 text-primary" /> EÜR – Einnahmenüberschussrechnung
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gewinnermittlung nach § 4 Abs. 3 EStG für {formatDate(from)} – {formatDate(to)}.
              Entwürfe bleiben unberücksichtigt, Stornorechnungen mindern die Einnahmen.
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button onClick={() => euerPdf.mutate()} disabled={euerPdf.isPending}>
              <FileText className="size-4" />
              {euerPdf.isPending ? "PDF wird erstellt…" : "EÜR als PDF"}
            </Button>
            <Button
              variant="outline"
              onClick={() => download(`EUER_${period}.csv`, buildEuerCsv(euer))}
            >
              <Download className="size-4" /> EÜR als CSV
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Kpi label="Betriebseinnahmen (netto)" value={formatMoney(euer.incomeNet)} />
          <Kpi label="Betriebsausgaben (netto)" value={formatMoney(euer.expenseNet)} />
          <Kpi
            label={euer.profit >= 0 ? "Gewinn (netto)" : "Verlust (netto)"}
            value={formatMoney(euer.profit)}
          />
        </div>

        <Table
          rows={[
            { Position: "Betriebseinnahmen (netto)", Betrag: formatMoney(euer.incomeNet) },
            { Position: "Vereinnahmte Umsatzsteuer", Betrag: formatMoney(euer.incomeVat) },
            { Position: "Betriebseinnahmen (brutto)", Betrag: formatMoney(euer.incomeGross) },
            { Position: "Betriebsausgaben (netto)", Betrag: formatMoney(euer.expenseNet) },
            { Position: "Gezahlte Vorsteuer", Betrag: formatMoney(euer.expenseVat) },
            { Position: "Betriebsausgaben (brutto)", Betrag: formatMoney(euer.expenseGross) },
            {
              Position: euer.profit >= 0 ? "Gewinn (netto)" : "Verlust (netto)",
              Betrag: formatMoney(euer.profit),
            },
          ]}
          empty=""
        />

        <h3 className="mt-6 font-display text-sm font-semibold">Betriebsausgaben je Kategorie</h3>
        <Table
          rows={euer.expensesByCategory.map((c) => ({
            Kategorie: c.category,
            Netto: formatMoney(c.net),
            Vorsteuer: formatMoney(c.vat),
            Brutto: formatMoney(c.gross),
          }))}
          empty="Keine Ausgaben im Zeitraum."
        />
      </section>

      <section className="print-area rounded-lg border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">
          Steuerauswertung {formatDate(from)} – {formatDate(to)}
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Kpi label="Umsatz netto" value={formatMoney(totals.net)} />
          <Kpi label="Umsatzsteuer (Ausgang)" value={formatMoney(totals.vat)} />
          <Kpi label="Umsatz brutto" value={formatMoney(totals.gross)} />
          <Kpi label="Ausgaben netto" value={formatMoney(totals.expNet)} />
          <Kpi label="Vorsteuer" value={formatMoney(totals.expVat)} />
          <Kpi label="Ausgaben brutto" value={formatMoney(totals.expGross)} />
          <Kpi label="USt-Zahllast" value={formatMoney(totals.zahllast)} />
          <Kpi label="Ergebnis (netto)" value={formatMoney(totals.ergebnis)} />
          <Kpi label="Belege" value={`${documents.length} / ${expenses.length}`} />
        </div>

        <h3 className="mt-6 font-display text-sm font-semibold">Rechnungen</h3>
        <Table rows={docRows} empty="Keine Rechnungen im Zeitraum." />

        <h3 className="mt-6 font-display text-sm font-semibold">Ausgaben</h3>
        <Table rows={expenseRows} empty="Keine Ausgaben im Zeitraum." />
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-base font-semibold">{value}</div>
    </div>
  );
}

function Table({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>;
  const headers = Object.keys(rows[0]!);
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {headers.map((h) => (
                <td key={h} className="py-1.5 pr-3">
                  {r[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
