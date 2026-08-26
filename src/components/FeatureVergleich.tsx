import { Fragment } from "react";
import { Check, Minus } from "lucide-react";

import type { Plan } from "@/lib/admin";

type Availability = Record<string, boolean | string>;

type Group = {
  title: string;
  rows: { label: string; plans: Availability }[];
};

/** Nur Funktionen, die tatsächlich im System vorhanden und den Paketen zugeordnet sind. */
const groups: Group[] = [
  {
    title: "Core Calculation Features",
    rows: [
      {
        label: "Angebote & Kostenvoranschläge",
        plans: { basis: true, pro: true, enterprise: true },
      },
      {
        label: "Rechnungen mit automatischer Nummernvergabe",
        plans: { basis: true, pro: true, enterprise: true },
      },
      {
        label: "Auftragsbestätigung (Angebot → Auftrag → Rechnung)",
        plans: { basis: true, pro: true, enterprise: true },
      },
      {
        label: "Kleinunternehmerregelung (§ 19 UStG)",
        plans: { basis: true, pro: true, enterprise: true },
      },
      {
        label: "EU-Reverse-Charge (§ 13b UStG)",
        plans: { basis: false, pro: true, enterprise: true },
      },
      {
        label: "Kalkulation nach Fläche & Leistungswerten",
        plans: { basis: false, pro: true, enterprise: true },
      },
      {
        label: "Leistungsverzeichnis (LV) inkl. PDF-Export",
        plans: { basis: false, pro: true, enterprise: true },
      },
      {
        label: "Wiederkehrende Rechnungen & Ausgaben",
        plans: { basis: false, pro: true, enterprise: true },
      },
    ],
  },
  {
    title: "Client / Project Management",
    rows: [
      {
        label: "Kundenverwaltung mit Kundennummern",
        plans: { basis: true, pro: true, enterprise: true },
      },
      { label: "Client-360-Kundenakte", plans: { basis: false, pro: true, enterprise: true } },
      { label: "Projekte & Objekt-Mappen", plans: { basis: false, pro: false, enterprise: true } },
      {
        label: "Raumbuch & KI-Grundriss-Analyse",
        plans: { basis: false, pro: false, enterprise: true },
      },
      { label: "Einsatzkarte & Standorte", plans: { basis: false, pro: true, enterprise: true } },
    ],
  },
  {
    title: "Team & Reports",
    rows: [
      { label: "Benutzer", plans: { basis: "1", pro: "bis 20", enterprise: "unbegrenzt" } },
      {
        label: "Mobile Zeiterfassung für Mitarbeitende",
        plans: { basis: false, pro: true, enterprise: true },
      },
      {
        label: "Einsatzplanung & Kalender (Drag & Drop)",
        plans: { basis: false, pro: true, enterprise: true },
      },
      {
        label: "Urlaub, Abwesenheiten & Zeitkonto",
        plans: { basis: false, pro: true, enterprise: true },
      },
      {
        label: "Finanz-Dashboard & EÜR-Auswertung",
        plans: { basis: true, pro: true, enterprise: true },
      },
      {
        label: "Quartals- und Kalkulations-Analysen",
        plans: { basis: false, pro: true, enterprise: true },
      },
    ],
  },
  {
    title: "Export & Integrations",
    rows: [
      {
        label: "E-Rechnung: XRechnung 3.0 & ZUGFeRD 2.3",
        plans: { basis: true, pro: true, enterprise: true },
      },
      { label: "PDF-Versand per E-Mail", plans: { basis: true, pro: true, enterprise: true } },
      {
        label: "GoBD-Archivierung & Prüfprotokoll",
        plans: { basis: true, pro: true, enterprise: true },
      },
      {
        label: "Eingehende E-Rechnungen importieren",
        plans: { basis: false, pro: true, enterprise: true },
      },
      {
        label: "Steuerberater-Portal & DATEV-Export",
        plans: { basis: false, pro: false, enterprise: true },
      },
      {
        label: "Bankabgleich (Kontoumsätze zuordnen)",
        plans: { basis: false, pro: false, enterprise: true },
      },
      {
        label: "Backup-Export (Excel / JSON)",
        plans: { basis: true, pro: true, enterprise: true },
      },
    ],
  },
];

function Cell({ value }: { value: boolean | string | undefined }) {
  if (typeof value === "string") return <span className="text-xs font-semibold">{value}</span>;
  return value ? (
    <Check className="mx-auto size-4 text-primary" aria-label="enthalten" />
  ) : (
    <Minus className="mx-auto size-4 text-muted-foreground/60" aria-label="nicht enthalten" />
  );
}

/** Feature-Vergleich der aktiven Pakete – Desktop als Tabelle, mobil als Karten. */
export function FeatureVergleich({ plans }: { plans: Plan[] }) {
  if (plans.length === 0) return null;

  return (
    <div className="mt-14">
      <h3 className="text-xl font-bold md:text-2xl">Funktionen im Paketvergleich</h3>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Alle Funktionen, die in GebCalc verfügbar sind – übersichtlich nach Paketen.
      </p>

      {/* Desktop */}
      <div className="mt-6 hidden overflow-hidden rounded-xl border md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-secondary/60">
            <tr>
              <th className="w-1/2 px-4 py-3 text-left font-semibold">Funktion</th>
              {plans.map((p) => (
                <th key={p.id} className="px-4 py-3 text-center font-semibold">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.title}>
                <tr className="bg-muted/40">
                  <td
                    colSpan={plans.length + 1}
                    className="px-4 py-2 text-xs font-semibold tracking-wide uppercase text-muted-foreground"
                  >
                    {g.title}
                  </td>
                </tr>
                {g.rows.map((r) => (
                  <tr key={g.title + r.label} className="border-t">
                    <td className="px-4 py-2.5">{r.label}</td>
                    {plans.map((p) => (
                      <td key={p.id} className="px-4 py-2.5 text-center">
                        <Cell value={r.plans[p.code]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil */}
      <div className="mt-6 space-y-4 md:hidden">
        {plans.map((p) => (
          <div key={p.id} className="surface p-5">
            <h4 className="text-base font-semibold">{p.name}</h4>
            {groups.map((g) => (
              <div key={g.title} className="mt-4">
                <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                  {g.title}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {g.rows.map((r) => (
                    <li key={r.label} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-foreground/90">{r.label}</span>
                      <span className="shrink-0">
                        <Cell value={r.plans[p.code]} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
