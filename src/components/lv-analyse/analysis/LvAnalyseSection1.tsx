import { FileSearch, Loader2, FileSpreadsheet, FileText, Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { DOCUMENT_KIND_LABELS } from "@/lib/lv-analyse/types";

import { STATUS_STYLE } from "./shared";

import { StepIcon } from "./StepIcon";

import type { LvAnalyseState } from "./useLvAnalyseState";
export function LvAnalyseSection1({ state }: { state: LvAnalyseState }) {
  const {
    busy,
    exportDisabled,
    exportHint,
    exporting,
    handleUpload,
    result,
    runExport,
    setShowText,
    showText,
    steps,
  } = state;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSearch className="size-4" />
          Ausschreibung hochladen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex">
            <input
              type="file"
              className="hidden"
              accept=".pdf,.xlsx,.xlsm,.csv,.txt,.x81,.x82,.x83,.x84,.x85,.x86,.d81,.d83,.d84,.p83,.gaeb,.xml"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleUpload(file);
              }}
            />
            <Button asChild disabled={busy}>
              <span className="cursor-pointer">
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 size-4" />
                )}
                Datei auswählen
              </span>
            </Button>
          </label>
          <span className="text-xs text-muted-foreground">
            Unterstützte Formate: PDF, XLSX, CSV, GAEB
          </span>
        </div>

        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ergebnisse herunterladen
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              onClick={() => void runExport("xlsx")}
            >
              <FileSpreadsheet className="mr-1 size-4" /> XLSX-Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              onClick={() => void runExport("csv")}
            >
              <Download className="mr-1 size-4" /> CSV-Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              onClick={() => void runExport("pdf")}
            >
              <FileText className="mr-1 size-4" /> PDF-Bericht
            </Button>
            {exporting && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">{exportHint}</p>
        </div>

        {/* Verarbeitungsstatus – immer sichtbar, nie leer */}
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Verarbeitungsstatus
          </p>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Datei verarbeitet. Laden Sie ein Leistungsverzeichnis, Preisblatt oder eine
              Leistungsbeschreibung hoch.
            </p>
          ) : (
            <ul className="space-y-1">
              {steps.map((step, index) => (
                <li key={`${step.label}-${index}`} className="flex items-start gap-2 text-sm">
                  <StepIcon state={step.state} />
                  <span>{step.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {result && (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs uppercase text-muted-foreground">Dokumenttyp</p>
              <p className="font-medium">{DOCUMENT_KIND_LABELS[result.kind].de}</p>
              <p className="text-xs text-muted-foreground">{result.kindReason}</p>
            </div>
            <div className="space-y-1">
              <Badge variant={STATUS_STYLE[result.status].variant}>
                {STATUS_STYLE[result.status].label}
              </Badge>
              <p className="text-sm">{result.statusMessage}</p>
              <p className="text-xs text-muted-foreground">
                <strong>Empfohlene Maßnahme:</strong> {result.recommendedAction}
              </p>
              {result.kind === "pricing_form" && (
                <p className="text-xs text-amber-700">
                  Das Dokument enthält keine vollständige LV-Struktur. Preise, Intervalle und
                  fehlende Felder müssen vor der Freigabe geprüft werden.
                </p>
              )}
              {result.rawText && (
                <Button variant="ghost" size="sm" onClick={() => setShowText((v) => !v)}>
                  {showText ? "Textvorschau ausblenden" : "Textvorschau anzeigen"}
                </Button>
              )}
            </div>
          </div>
        )}

        {showText && result?.rawText && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">
            {result.rawText.slice(0, 20000)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
