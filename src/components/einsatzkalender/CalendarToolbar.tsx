import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Printer } from "lucide-react";
import { AbwesenheitZeitraum } from "@/components/AbwesenheitZeitraum";
import type { EinsatzKalenderStateContext } from "./useEinsatzKalenderState";

export function CalendarToolbar({ state }: { state: EinsatzKalenderStateContext }) {
  const { employees, exportXlsx, periodLabel, printPlan, setAnchor, setView, shift, view } = state;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Einsatz-Kalender</h2>
        <p className="text-sm text-muted-foreground">
          Monats- oder Wochenansicht, Einsatzort je Zeitfenster sowie Soll-/Ist-Stunden je
          Mitarbeiter.
        </p>
        <p className="hidden text-sm font-medium print:block">{periodLabel}</p>
      </div>
      <div className="kalender-no-print flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border">
          <Button
            variant={view === "month" ? "default" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setView("month")}
          >
            Monat
          </Button>
          <Button
            variant={view === "week" ? "default" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setView("week")}
          >
            Woche
          </Button>
        </div>
        <Button variant="outline" size="icon" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[9rem] text-center text-sm font-medium">{periodLabel}</span>
        <Button variant="outline" size="icon" onClick={() => shift(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const d = new Date();
            d.setHours(12, 0, 0, 0);
            setAnchor(d);
          }}
        >
          Heute
        </Button>
        <Button variant="outline" size="sm" onClick={exportXlsx}>
          <FileSpreadsheet className="size-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={printPlan}>
          <Printer className="size-4" /> Drucken / PDF
        </Button>
        <AbwesenheitZeitraum employees={employees} />
      </div>
    </div>
  );
}
