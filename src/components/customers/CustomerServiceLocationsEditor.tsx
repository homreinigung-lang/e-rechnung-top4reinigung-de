import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyServiceLocation,
  type CustomerServiceLocation,
} from "@/lib/customer-service-locations";

export function CustomerServiceLocationsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: CustomerServiceLocation[];
  onChange: (value: CustomerServiceLocation[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Einsatzorte</h2>
        <p className="text-xs text-muted-foreground">
          Mehrere Arbeitsadressen je Kunde. Der erste Ort ist der Standard für neue Einsätze. Ohne
          Einsatzort gilt die Rechnungsadresse.
        </p>
      </div>
      {value.map((site, index) => (
        <fieldset key={site.id} disabled={disabled} className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Einsatzort {index + 1}
            {index === 0 ? " (Standard)" : ""}
          </legend>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Einsatzort ${index + 1} entfernen`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" /> Entfernen
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["address_line", "Straße und Hausnummer"],
                ["note", "Hinweis (z. B. Objekt, Etage, Schlüssel)"],
                ["postal_code", "PLZ"],
                ["city", "Ort"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`site-${site.id}-${key}`}>{label}</Label>
                <Input
                  id={`site-${site.id}-${key}`}
                  value={site[key]}
                  onChange={(event) =>
                    onChange(
                      value.map((item, i) =>
                        i === index ? { ...item, [key]: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange([...value, emptyServiceLocation()])}
      >
        <Plus className="size-4" /> Einsatzort hinzufügen
      </Button>
    </div>
  );
}
