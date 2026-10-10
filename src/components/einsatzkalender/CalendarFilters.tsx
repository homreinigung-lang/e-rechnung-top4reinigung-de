import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL } from "./shared";
import type { EinsatzKalenderStateContext } from "./useEinsatzKalenderState";

export function CalendarFilters({ state }: { state: EinsatzKalenderStateContext }) {
  const {
    employees,
    filterEmployee,
    filterProject,
    projects,
    setFilterEmployee,
    setFilterProject,
  } = state;
  return (
    <div className="kalender-no-print flex flex-wrap items-center gap-2">
      <Select value={filterEmployee} onValueChange={setFilterEmployee}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Alle Mitarbeiter" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Mitarbeiter</SelectItem>
          {employees.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filterProject} onValueChange={setFilterProject}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Alle Objekte" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Objekte / Projekte</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name || "Ohne Namen"}
              {p.city ? ` · ${p.city}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(filterEmployee !== ALL || filterProject !== ALL) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFilterEmployee(ALL);
            setFilterProject(ALL);
          }}
        >
          Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}
