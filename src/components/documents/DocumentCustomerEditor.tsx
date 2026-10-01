import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Customer = { id: string; company?: string | null; name?: string | null };
type Project = { id: string; customer_id?: string | null; name?: string | null; city?: string | null };

type DocumentCustomerEditorProps = {
  isQuote: boolean;
  isPrivat: boolean;
  quoteRecipientMode: string;
  customerId: string;
  projectId: string;
  customers: Customer[];
  projects: Project[];
  values: Record<string, unknown>;
  onQuoteRecipientModeChange: (mode: string) => void;
  onResetProspect: () => void;
  onPickCustomer: (id: string) => void;
  onFieldChange: (key: string, value: unknown) => void;
};

export function DocumentCustomerEditor({
  isQuote, isPrivat, quoteRecipientMode, customerId, projectId, customers, projects,
  values, onQuoteRecipientModeChange, onResetProspect, onPickCustomer, onFieldChange,
}: DocumentCustomerEditorProps) {
  const customerProjectFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Kunde auswählen</Label>
        <Select value={customerId} onValueChange={onPickCustomer}>
          <SelectTrigger><SelectValue placeholder="Kunde aus dem Kundenstamm wählen" /></SelectTrigger>
          <SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.company || customer.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Objekt / Projekt</Label>
        <Select value={projectId} onValueChange={(value) => onFieldChange("project_id", value === "__none__" ? null : value)}>
          <SelectTrigger><SelectValue placeholder={customerId ? "Objekt zuordnen" : "Zuerst Kunde auswählen"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nicht zugeordnet</SelectItem>
            {projects.filter((project) => Boolean(customerId) && project.customer_id === customerId).map((project) => (
              <SelectItem key={project.id} value={project.id}>{project.name || "Ohne Namen"}{project.city ? ` · ${project.city}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Die Zuordnung wird für Objekt-Controlling und Marge verwendet.</p>
      </div>
    </div>
  );

  return (
    <>
      {isQuote ? (
        <div className="space-y-4 rounded-md border p-4">
          <div>
            <Label>Empfänger</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
              <Button type="button" variant={quoteRecipientMode === "interessent" ? "default" : "outline"} onClick={() => { onQuoteRecipientModeChange("interessent"); onResetProspect(); }}>Interessent</Button>
              <Button type="button" variant={quoteRecipientMode === "kunde" ? "default" : "outline"} onClick={() => onQuoteRecipientModeChange("kunde")}>Kunde</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Ein Interessent kann ein Angebot erhalten, ohne vorher im Kundenstamm angelegt zu werden. Bei Annahme wird er automatisch als Kunde übernommen.</p>
          </div>
          {quoteRecipientMode === "kunde" ? customerProjectFields : null}
        </div>
      ) : customerProjectFields}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Kundentyp</Label>
          <Select value={isPrivat ? "privat" : "firma"} onValueChange={(value) => onFieldChange("customer_type", value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="firma">Firmenkunde</SelectItem><SelectItem value="privat">Privatkunde</SelectItem></SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Bei Privatkunden entfallen Firma, USt-IdNr. und Bestellnummer – das Angebot nutzt den Privatkunden-Text.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {([
          ...(!isPrivat ? [{ key: "customer_company", label: "Firma" }, { key: "customer_vat_id", label: "USt-IdNr. des Kunden" }] : []),
          { key: "customer_name", label: isPrivat ? "Name" : "Ansprechpartner" },
          { key: "customer_email", label: "E-Mail" }, { key: "customer_phone", label: "Telefon" },
          { key: "customer_address_line", label: "Straße und Hausnummer" }, { key: "customer_postal_code", label: "PLZ" },
          { key: "customer_city", label: "Ort" }, { key: "customer_country", label: "Land" },
        ] as const).map(({ key, label }) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>{label}</Label>
            <Input id={key} value={String(values[key] ?? "")} onChange={(event) => onFieldChange(key, event.target.value)} />
          </div>
        ))}
      </div>
    </>
  );
}
