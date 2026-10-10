import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Download, Upload } from "lucide-react";
import { AccountantAccessCard } from "@/components/AccountantAccessCard";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { BankdatenSection } from "./BankdatenSection";
import { EinstellungenEMailSMTPSignatur } from "./EinstellungenEMailSMTPSignatur";
import { EinstellungenKalkulationsgrundlagen } from "./EinstellungenKalkulationsgrundlagen";
import type { EinstellungenState } from "./useEinstellungenState";
export function EinstellungenView({ state }: { state: EinstellungenState }) {
  const {
    KIND_LABEL,
    backupBusy,
    exportBackupJson,
    exportBackupXlsx,
    exportDocuments,
    exportExpenses,
    from,
    importFile,
    isAdmin,
    preview,
    previewOpen,
    savePreview,
    saving,
    setFrom,
    setPreview,
    setPreviewOpen,
    setTo,
    to,
  } = state;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Einstellungen</h1>
        <p className="mt-1 text-muted-foreground">
          E-Mail-Versand, Steuerberater-Export und Datenimport. Firmendaten finden Sie unter „Mein
          Profil“.
        </p>
      </div>

      <BankdatenSection />

      <EinstellungenKalkulationsgrundlagen state={state} />

      <EinstellungenEMailSMTPSignatur state={state} />

      <div className="surface space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Steuerberater-Export (DATEV/CSV)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="from">Von</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">Bis</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportDocuments}>
            <Download className="size-4" /> Rechnungen exportieren
          </Button>
          <Button variant="outline" onClick={exportExpenses}>
            <Download className="size-4" /> Ausgaben exportieren
          </Button>
          <Button asChild>
            <Link to="/steuerberater">Steuerberater-Bereich öffnen (DATEV, Excel, PDF)</Link>
          </Button>
        </div>
      </div>

      <div className="surface space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Kunden- und Belegexport</h2>
        <p className="text-sm text-muted-foreground">
          Exportiert Kunden, Rechnungen/Angebote und Positionen als Excel oder JSON. Mitarbeiter,
          Projekte, Arbeitszeiten und hochgeladene Dateien sind nicht enthalten. Für eine
          vollständige Wiederherstellung ist zusätzlich eine Datenbank- und Dateisicherung nötig.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportBackupXlsx} disabled={backupBusy}>
            <Download className="size-4" /> Export als Excel (.xlsx)
          </Button>
          <Button variant="outline" onClick={exportBackupJson} disabled={backupBusy}>
            <Download className="size-4" /> Export als JSON
          </Button>
        </div>
      </div>

      <AccountantAccessCard />

      {isAdmin && (
        <div className="surface space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">Import aus Lexoffice / Lexware</h2>
          <p className="text-sm text-muted-foreground">
            Datei auswählen – der Typ wird automatisch erkannt: Rechnungen (z. B. Export_RE_…)
            landen unter „Rechnungen“, Ausgaben (z. B. Export_RA_…) unter „Ausgaben“, Kundenlisten
            im Kundenstamm. Trennzeichen (; , Tab |), Kodierung (UTF-8 / Windows-1252 / ISO-8859-1)
            und abweichende Spaltennamen werden automatisch erkannt; unbekannte Spalten werden
            übersprungen.
          </p>
          <Label
            htmlFor="csv"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <Upload className="size-4" /> Datei importieren (Rechnungen, Ausgaben oder Kunden)
          </Label>
          <input
            id="csv"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = "";
            }}
          />
          {preview && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-3 text-sm">
              <span>
                <strong>{preview.rows.length}</strong> Zeilen erkannt ({KIND_LABEL[preview.kind]})
                aus {preview.fileName}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                Vorschau
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={(o) => setPreviewOpen(o)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Vorschau: {preview ? `${preview.rows.length} ${KIND_LABEL[preview.kind]}` : ""}
            </DialogTitle>
          </DialogHeader>
          {preview && preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    {Object.keys(preview.rows[0]!).map((k) => (
                      <th key={k} className="whitespace-nowrap px-2 py-2 font-medium">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {Object.keys(preview.rows[0]!).map((k) => (
                        <td key={k} className="whitespace-nowrap px-2 py-1.5">
                          {String(r[k] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 50 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  … {preview.rows.length - 50} weitere Zeilen
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPreviewOpen(false);
                setPreview(null);
              }}
            >
              Verwerfen
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                await savePreview();
                setPreviewOpen(false);
              }}
            >
              {saving ? "Speichern…" : "Jetzt importieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
