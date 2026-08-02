import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Kalender zur Auswahl eines Leistungszeitraums, Ausgabe im deutschen Format. */
export function DateRangeField({
  value,
  onChange,
  placeholder = "Zeitraum wählen",
}: {
  value: string;
  onChange: (formatted: string) => void;
  placeholder?: string;
}) {
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  function apply(next: DateRange | undefined) {
    setRange(next);
    if (!next?.from) return;
    const from = formatDate(toIso(next.from));
    const to = next.to ? formatDate(toIso(next.to)) : "";
    onChange(to && to !== from ? `${from} – ${to}` : from);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="size-4" />
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={range?.from ?? new Date()}
          selected={range}
          onSelect={apply}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
