import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DocumentTaxEditorProps = {
  taxMode: string;
  taxNote: string;
  isSmallBusiness: boolean;
  reverseChargeAllowed: boolean;
  onTaxModeChange: (value: string) => void;
};

export function DocumentTaxEditor({
  taxMode,
  taxNote,
  isSmallBusiness,
  reverseChargeAllowed,
  onTaxModeChange,
}: DocumentTaxEditorProps) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
      <Label>Steuer-Art</Label>
      {isSmallBusiness && (
        <p className="rounded-md border border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          Kleinunternehmerregelung (§ 19 UStG) ist im Firmenprofil aktiv – es wird keine
          Umsatzsteuer berechnet oder ausgewiesen.
        </p>
      )}
      <Select value={taxMode} onValueChange={onTaxModeChange} disabled={isSmallBusiness}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="domestic">Inland (Deutschland) – 19 % MwSt.</SelectItem>
          <SelectItem value="eu_reverse_charge" disabled={!reverseChargeAllowed}>
            EU-Ausland – Reverse-Charge (0 % MwSt.){reverseChargeAllowed ? "" : " – ab Pro"}
          </SelectItem>
          <SelectItem value="kleinunternehmer">Kleinunternehmer § 19 UStG (0 % MwSt.)</SelectItem>
        </SelectContent>
      </Select>
      {!reverseChargeAllowed && (
        <p className="flex flex-wrap items-center gap-1 rounded-md border border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Rechnungen ohne MwSt. (Reverse-Charge für EU-Ausland) sind ab dem{" "}
          <strong className="font-semibold text-foreground">Pro-Paket</strong> verfügbar.
          <Link to="/mein-paket" className="font-medium text-primary underline">Paket ansehen</Link>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {taxMode === "domestic"
          ? "Es werden 19 % Umsatzsteuer ausgewiesen. Es wird kein Steuerhinweis gedruckt."
          : `0 % Umsatzsteuer. Folgender Pflichthinweis erscheint automatisch auf dem Dokument: „${taxNote}“`}
      </p>
    </div>
  );
}
