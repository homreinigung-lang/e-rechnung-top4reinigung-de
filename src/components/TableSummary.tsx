import { formatSummaryValue, summarizeRows, type TableRow } from "@/lib/table-summary";

/**
 * Generischer Zusammenfassungsblock: zeigt die Endsummen jeder Tabelle
 * mit Zahlenwerten direkt oberhalb der Tabelle an.
 */
export function TableSummary({
  rows,
  title,
  className,
}: {
  rows: TableRow[];
  title?: string;
  className?: string;
}) {
  const entries = summarizeRows(rows);
  if (rows.length === 0 || entries.length === 0) return null;
  return (
    <div className={`mt-3 rounded-md border bg-muted/40 p-3 ${className ?? ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Zusammenfassung{title ? ` – ${title}` : ""} · {rows.length} Datensätze
      </p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {entries.map((entry) => (
          <div key={entry.column}>
            <p className="text-[11px] text-muted-foreground">{entry.label}</p>
            <p className="text-sm font-semibold tabular-nums">{formatSummaryValue(entry)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
