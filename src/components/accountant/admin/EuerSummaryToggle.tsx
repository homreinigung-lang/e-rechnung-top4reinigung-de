import { useState } from "react";

import { formatMoney } from "@/lib/format";

export function EuerSummaryToggle({
  incomeGross,
  profit,
}: {
  incomeGross: number;
  profit: number;
}) {
  const [mode, setMode] = useState<"einnahmen" | "gewinn">("einnahmen");
  const isEinnahmen = mode === "einnahmen";
  return (
    <div className="mt-3 rounded-md border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          {(
            [
              ["einnahmen", "Gesamteinnahmen"],
              ["gewinn", "Netto-Gewinn"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
                mode === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <p className="text-[11px] text-muted-foreground">
          {isEinnahmen ? "Betriebseinnahmen (brutto)" : "Gewinn (netto)"}
        </p>
        <p
          className={`text-lg font-semibold tabular-nums ${
            !isEinnahmen && profit < 0 ? "text-destructive" : ""
          }`}
        >
          {formatMoney(isEinnahmen ? incomeGross : profit)}
        </p>
      </div>
    </div>
  );
}
