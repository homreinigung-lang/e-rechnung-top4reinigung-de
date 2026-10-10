import { TableSummary } from "@/components/TableSummary";

import { type Table } from "./shared";

export function DataTable({ rows, empty }: { rows: Table[]; empty: string }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>;
  const headers = Object.keys(rows[0]!);
  return (
    <>
      <TableSummary rows={rows} />
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
    </>
  );
}
