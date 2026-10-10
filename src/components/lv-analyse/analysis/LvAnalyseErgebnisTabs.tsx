import { RefreshCw, Trash2 } from "lucide-react";

import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DOCUMENT_KIND_LABELS } from "@/lib/lv-analyse/types";

import { NO_OWN_PRICE_HINT } from "@/lib/lv-analyse/calculation";
import { LvPositionenTabelle } from "@/components/lv-analyse/LvPositionenTabelle";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";

import { STATUS_STYLE } from "./shared";

import { EmptyHint } from "./EmptyHint";
import { Kpi } from "./Kpi";
import { CategoryTable } from "./CategoryTable";

import { LabeledNumber } from "./LabeledNumber";
import type { LvAnalyseState } from "./useLvAnalyseState";
export function LvAnalyseErgebnisTabs({ state }: { state: LvAnalyseState }) {
  const {
    addItem,
    approveAll,
    area,
    categories,
    cost,
    deleteAllLogEntries,
    deleteLogEntry,
    deletingLog,
    exportDisabled,
    exportHint,
    exporting,
    hours,
    issues,
    items,
    loadLog,
    log,
    ownSummary,
    price,
    priceInputs,
    result,
    runExport,
    setItems,
    setPriceInputs,
    update,
  } = state;
  return (
    <Tabs defaultValue="items">
      <TabsList className="flex h-auto flex-wrap gap-1">
        <TabsTrigger value="items">Positionen</TabsTrigger>
        <TabsTrigger value="area">Flächen</TabsTrigger>
        <TabsTrigger value="hours">Arbeitsstunden</TabsTrigger>
        <TabsTrigger value="cost">Kostenanalyse</TabsTrigger>
        <TabsTrigger value="price">Preisempfehlung</TabsTrigger>
        <TabsTrigger value="missing">Fehlende Daten</TabsTrigger>
        <TabsTrigger value="log">Importprotokoll</TabsTrigger>
      </TabsList>

      {/* 1) Positionen prüfen & freigeben */}
      <TabsContent value="items" className="space-y-3">
        <LvPositionenTabelle
          items={items}
          issueCount={issues.length}
          exporting={exporting}
          exportHint={exportHint}
          exportDisabled={exportDisabled}
          onExport={(kind) => void runExport(kind)}
          onUpdate={update}
          onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
          onAdd={addItem}
          onApproveAll={approveAll}
          emptyState={<EmptyHint result={result} />}
        />
      </TabsContent>

      {/* 2) Flächen */}
      <TabsContent value="area" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Gesamtfläche" value={`${formatNumber(area.totalArea)} m²`} />
          <Kpi label="Jahresfläche" value={`${formatNumber(area.annualArea)} m²`} />
          <Kpi label="Positionen mit Fläche" value={String(area.itemsWithArea)} />
          <Kpi label="Ohne Flächenangabe" value={String(area.itemsWithoutArea)} />
        </div>
        <CategoryTable rows={categories} column="area_m2" />
      </TabsContent>

      {/* 3) Arbeitsstunden */}
      <TabsContent value="hours" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Stunden je Einsatz" value={formatNumber(hours.totalHours)} />
          <Kpi label="Jahresstunden gesamt" value={formatNumber(hours.annualHoursTotal)} />
          <Kpi label="Monatsstunden gesamt" value={formatNumber(hours.monthlyHoursTotal)} />
          <Kpi
            label={`Geschätzt aus Fläche (${formatNumber(hours.performanceRate)} m²/Std.)`}
            value={formatNumber(hours.estimatedFromArea)}
          />
        </div>
        <CategoryTable rows={categories} column="hours" />
      </TabsContent>

      {/* 4) Kostenanalyse */}
      <TabsContent value="cost" className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">A. Anforderungen aus der Ausschreibung</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Positionen" value={String(items.length)} />
            <Kpi label="Gesamtfläche" value={`${formatNumber(area.totalArea)} m²`} />
            <Kpi label="Jahresstunden gesamt" value={formatNumber(hours.annualHoursTotal)} />
            <Kpi label="Ohne eigenen Preis" value={String(ownSummary.openItems)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">B. Eigene Kalkulation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Kpi label="Angebotssumme netto" value={formatMoney(ownSummary.net)} />
              <Kpi label={`MwSt ${formatNumber(cost.vatRate)} %`} value={formatMoney(cost.vat)} />
              <Kpi label="Brutto" value={formatMoney(cost.gross)} />
              <Kpi label="Jahresnetto" value={formatMoney(ownSummary.annualNet)} />
            </div>
            <p className="text-sm text-muted-foreground">
              {cost.documentVatRateHint !== null
                ? `Hinweis: Im Dokument ist ein abweichender Steuersatz von ${formatNumber(cost.documentVatRateHint)} % genannt. Gerechnet wird mit ${formatNumber(cost.vatRate)} % aus Ihren Firmeneinstellungen. `
                : ""}
              {ownSummary.calculatedItems === 0
                ? NO_OWN_PRICE_HINT
                : `${ownSummary.calculatedItems} von ${items.length} Positionen kalkuliert. Die Gesamtsumme enthält ausschließlich eigene Preise.`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Summen aus dem Dokument (Preisblatt) – nur zur Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cost.documentTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Im Dokument wurden keine separaten Summenzeilen gefunden.
              </p>
            ) : (
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead className="w-24 text-right">Seite</TableHead>
                    <TableHead className="w-40 text-right">Betrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cost.documentTotals.map((t, i) => (
                    <TableRow key={`${t.label}-${i}`}>
                      <TableCell>{t.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.source_page ?? "–"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(t.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <CategoryTable rows={categories} column="total" />
      </TabsContent>

      {/* 5) Preisempfehlung */}
      <TabsContent value="price" className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Kalkulationsparameter</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <LabeledNumber
              label="Stundensatz €"
              value={priceInputs.hourlyRate}
              onChange={(v) => setPriceInputs((p) => ({ ...p, hourlyRate: v }))}
            />
            <LabeledNumber
              label="Gemeinkosten %"
              value={priceInputs.overheadPercent}
              onChange={(v) => setPriceInputs((p) => ({ ...p, overheadPercent: v }))}
            />
            <LabeledNumber
              label="Gewinn %"
              value={priceInputs.profitPercent}
              onChange={(v) => setPriceInputs((p) => ({ ...p, profitPercent: v }))}
            />
            <LabeledNumber
              label="Leistungswert m²/Std."
              value={priceInputs.performanceRate}
              onChange={(v) => setPriceInputs((p) => ({ ...p, performanceRate: v || 1 }))}
            />
          </CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Kalkulierte Jahresstunden" value={formatNumber(price.annualHours)} />
          <Kpi label="Empfehlung Jahr netto" value={formatMoney(price.recommendedAnnualNet)} />
          <Kpi label="Empfehlung Monat netto" value={formatMoney(price.recommendedMonthlyNet)} />
          <Kpi label="Preis je m²" value={formatMoney(price.recommendedPerSqm)} />
        </div>
        <p className="text-sm text-muted-foreground">
          {price.deltaPercent === null
            ? "Es wurden noch keine eigenen Preise eingetragen – die Empfehlung basiert vollständig auf den Kalkulationsparametern."
            : `Die eigene Positionskalkulation liegt ${formatNumber(price.deltaPercent)} % ${
                price.deltaPercent >= 0 ? "über" : "unter"
              } der Preisempfehlung (${formatMoney(price.documentAnnualNet)} pro Jahr).`}
        </p>
      </TabsContent>

      {/* 6) Fehlende Daten */}
      <TabsContent value="missing" className="space-y-3">
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine fehlenden Pflichtangaben.</p>
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Ebene</TableHead>
                <TableHead className="w-32">Feld</TableHead>
                <TableHead>Hinweis</TableHead>
                <TableHead>Empfohlene Maßnahme</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue, index) => (
                <TableRow key={`${issue.itemId}-${issue.field}-${index}`}>
                  <TableCell>
                    <Badge variant={issue.level === "error" ? "destructive" : "secondary"}>
                      {issue.level === "error" ? "Pflicht" : "Hinweis"}
                    </Badge>
                  </TableCell>
                  <TableCell>{issue.field}</TableCell>
                  <TableCell>{issue.message}</TableCell>
                  <TableCell className="text-muted-foreground">{issue.hint}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>

      {/* 7) Import-Protokoll */}
      <TabsContent value="log" className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadLog()}>
            <RefreshCw className="mr-1 size-4" /> Aktualisieren
          </Button>
          {log.length > 0 && (
            <ConfirmDeleteButton
              title="Alle Protokolleinträge löschen?"
              description={`Es werden alle ${log.length} Einträge unwiderruflich gelöscht.`}
              onConfirm={() => void deleteAllLogEntries()}
              confirmLabel="Alle löschen"
              disabled={deletingLog}
              size="sm"
              variant="outline"
              ariaLabel="Alle Protokolleinträge löschen"
            >
              <Trash2 className="mr-1 size-4 text-destructive" /> Alle Einträge löschen
            </ConfirmDeleteButton>
          )}
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Importe protokolliert.</p>
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Dateiname</TableHead>
                <TableHead className="w-32">Hochgeladen</TableHead>
                <TableHead className="w-56">Erkannter Typ</TableHead>
                <TableHead className="w-24 text-right">Positionen</TableHead>
                <TableHead className="w-40">Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.file_name}</TableCell>
                  <TableCell>{formatDate(entry.uploaded_at)}</TableCell>
                  <TableCell>
                    {DOCUMENT_KIND_LABELS[entry.document_kind]?.de ?? entry.document_kind}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{entry.item_count}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_STYLE[entry.status]?.variant ?? "outline"}>
                      {STATUS_STYLE[entry.status]?.label ?? entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ConfirmDeleteButton
                      title="Protokolleintrag löschen?"
                      description={`„${entry.file_name}" wird unwiderruflich aus dem Protokoll entfernt.`}
                      onConfirm={() => void deleteLogEntry(entry.id)}
                      disabled={deletingLog}
                      ariaLabel={`Protokolleintrag ${entry.file_name} löschen`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>
    </Tabs>
  );
}
