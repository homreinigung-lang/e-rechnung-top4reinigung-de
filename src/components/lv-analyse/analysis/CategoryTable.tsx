import { formatMoney, formatNumber } from "@/lib/format";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CATEGORY_LABELS, type LvItemCategory } from "@/lib/lv-analyse/types";

export function CategoryTable({
  rows,
  column,
}: {
  rows: {
    category: LvItemCategory;
    items: number;
    area_m2: number;
    hours: number;
    total: number;
  }[];
  column: "area_m2" | "hours" | "total";
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Daten vorhanden.</p>;
  }
  const header = column === "area_m2" ? "Fläche m²" : column === "hours" ? "Stunden" : "Betrag €";
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Kategorie</TableHead>
          <TableHead className="w-24 text-right">Positionen</TableHead>
          <TableHead className="w-40 text-right">{header}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.category}>
            <TableCell>{CATEGORY_LABELS[row.category].de}</TableCell>
            <TableCell className="text-right tabular-nums">{row.items}</TableCell>
            <TableCell className="text-right tabular-nums">
              {column === "total" ? formatMoney(row.total) : formatNumber(row[column])}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
