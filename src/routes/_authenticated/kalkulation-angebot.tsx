import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calculator, FileSignature, Map, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { createDocument } from "@/lib/create-document";
import { computeDocumentTotals } from "@/lib/document-totals";
import { formatMoney, formatNumber, parsePositiveNumber, taxNoteForTaxMode, vatRateForTaxMode } from "@/lib/format";
import { STAIR_RATE_PER_FLOOR, WEEKS_PER_MONTH } from "@/lib/constants";
import { buildConsolidatedPositions, buildDiscountPosition, positionsTotal, round2 } from "@/lib/kalkulation-engine";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Search = { area?: number; belag?: string };
type Mode = "area" | "hours";

const TYPES = [
  { value: "unterhalt", label: "Unterhaltsreinigung", area: 0.35, hourly: 35 },
  { value: "grund", label: "Grundreinigung", area: 1.9, hourly: 43 },
  { value: "bau", label: "Bauendreinigung", area: 2.6, hourly: 44 },
  { value: "glas", label: "Glas- und Fensterreinigung", area: 1.4, hourly: 38 },
  { value: "treppenhaus", label: "Treppenhausreinigung", area: 0.6, hourly: 35 },
  { value: "buero", label: "Büroreinigung", area: 0.4, hourly: 35 },
  { value: "praxis", label: "Praxisreinigung", area: 0.4, hourly: 35 },
] as const;

const EXTRAS = [
  { key: "fenster", label: "Fensterreinigung innen/außen", price: 60 },
  { key: "entsorgung", label: "Müllentsorgung", price: 35 },
] as const;

function num(value: string) {
  return parsePositiveNumber(value);
}

export const Route = createFileRoute("/_authenticated/kalkulation-angebot")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const area = Number(search["area"]);
    return {
      ...(Number.isFinite(area) && area > 0 ? { area } : {}),
      ...(search["belag"] ? { belag: String(search["belag"]) } : {}),
    };
  },
  head: () => ({ meta: [{ title: "Kalkulation – Angebot" }] }),
  component: KalkulationAngebotPage,
});

function KalkulationAngebotPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("unterhalt");
  const selected = TYPES.find((entry) => entry.value === type) ?? TYPES[0];
  const [mode, setMode] = useState<Mode>("area");
  const [area, setArea] = useState(search.area ? String(search.area).replace(".", ",") : "100");
  const [pricePerSqm, setPricePerSqm] = useState(String(selected.area).replace(".", ","));
  const [hours, setHours] = useState("4");
  const [hourlyRate, setHourlyRate] = useState(String(selected.hourly));
  const [frequency, setFrequency] = useState("1");
  const [frequencyUnit, setFrequencyUnit] = useState<"week" | "month">("week");
  const [travel, setTravel] = useState("0");
  const [extras, setExtras] = useState<string[]>([]);
  const [stairs, setStairs] = useState(false);
  const [floors, setFloors] = useState("1");
  const [stairRate, setStairRate] = useState(String(STAIR_RATE_PER_FLOOR));
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [taxMode, setTaxMode] = useState("domestic");
  const [note, setNote] = useState(search.belag ? `Bodenbelag: ${search.belag}` : "");
  const [confirmed, setConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);

  const visitsPerMonth = useMemo(() => {
    const value = Math.max(1, num(frequency) || 1);
    return frequencyUnit === "week" ? value * WEEKS_PER_MONTH : value;
  }, [frequency, frequencyUnit]);

  const basePositions = useMemo(
    () =>
      buildConsolidatedPositions({
        typeValue: selected.value,
        typeLabel: selected.label,
        mode,
        areaSqm: num(area),
        pricePerSqm: num(pricePerSqm),
        hours: num(hours),
        hourlyRate: num(hourlyRate),
        visitsPerMonth,
        stairs,
        floors: num(floors),
        stairRate: num(stairRate),
        stairVisitsPerMonth: 0,
        hasLift: false,
        liftRate: 0,
        extras: EXTRAS.filter((item) => extras.includes(item.key)).map((item) => ({ label: item.label, price: item.price })),
        travel: num(travel),
        discountPercent: 0,
        discountReason: "",
      }),
    [selected, mode, area, pricePerSqm, hours, hourlyRate, visitsPerMonth, stairs, floors, stairRate, extras, travel],
  );

  const discountPosition = useMemo(
    () =>
      buildDiscountPosition(basePositions, {
        percent: Math.min(100, num(discountPercent)),
        amount: num(discountAmount),
        reason: discountReason,
      }),
    [basePositions, discountPercent, discountAmount, discountReason],
  );

  const positions = useMemo(
    () => (discountPosition ? [...basePositions, discountPosition] : basePositions),
    [basePositions, discountPosition],
  );
  const net = positionsTotal(positions);
  const vatRate = vatRateForTaxMode(taxMode);
  const vat = round2((net * vatRate) / 100);
  const gross = round2(net + vat);
  const taxNote = taxNoteForTaxMode(taxMode);

  const createQuote = async () => {
    if (!confirmed || net <= 0 || positions.length === 0) return;
    setCreating(true);
    try {
      const quoteId = await createDocument("quote");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const { error: itemsError } = await supabase.from("document_items").insert(
        positions.map((item, index) => ({
          document_id: quoteId,
          user_id: userId,
          position: index + 1,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
        })),
      );
      if (itemsError) throw itemsError;

      const totals = computeDocumentTotals(positions, 0, vatRate);
      const description = [
        selected.label,
        `Turnus: ${formatNumber(visitsPerMonth)} Einsätze/Monat`,
        note.trim(),
      ].filter(Boolean).join("\n");

      const { error: docError } = await supabase
        .from("documents")
        .update({
          service_description: description,
          discount_percent: 0,
          discount_amount: 0,
          discount_reason: discountReason,
          tax_mode: taxMode,
          vat_rate: vatRate,
          reverse_charge: taxMode === "eu_reverse_charge",
          net_total: totals.netTotal,
          vat_amount: totals.vatAmount,
          total: totals.grossTotal,
        } as never)
        .eq("id", quoteId);
      if (docError) throw docError;

      toast.success("Angebot aus Kalkulation erstellt");
      navigate({ to: "/dokumente/$id", params: { id: quoteId }, search: { bearbeiten: true } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), { duration: 8000 });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Kalkulation</h1>
        <p className="text-sm text-muted-foreground">Für normale Kundenangebote: Leistung erfassen, Preis prüfen und direkt ein Angebot erstellen.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Map className="size-5" /> Grundriss optional</CardTitle>
              <CardDescription>Wenn ein Plan vorhanden ist, können Fläche und Räume zuerst geprüft werden. Ohne Grundriss funktioniert die Kalkulation vollständig manuell.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/grundriss-review" })}>
                Grundriss prüfen
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calculator className="size-5" /> Leistungsdaten</CardTitle>
              <CardDescription>Reinigung, Umfang, Turnus und Zusatzleistungen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Reinigungstyp</Label>
                  <Select value={type} onValueChange={(value) => {
                    const next = value as (typeof TYPES)[number]["value"];
                    setType(next);
                    const preset = TYPES.find((entry) => entry.value === next);
                    if (preset) {
                      setPricePerSqm(String(preset.area).replace(".", ","));
                      setHourlyRate(String(preset.hourly));
                    }
                    setConfirmed(false);
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Berechnungsart</Label>
                  <Select value={mode} onValueChange={(value) => { setMode(value as Mode); setConfirmed(false); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="area">Nach Fläche (m²)</SelectItem>
                      <SelectItem value="hours">Nach Stunden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {mode === "area" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Fläche (m²)</Label><Input inputMode="decimal" value={area} onChange={(e) => { setArea(e.target.value); setConfirmed(false); }} /></div>
                  <div className="space-y-2"><Label>Preis pro m² netto</Label><Input inputMode="decimal" value={pricePerSqm} onChange={(e) => { setPricePerSqm(e.target.value); setConfirmed(false); }} /></div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Stunden je Einsatz</Label><Input inputMode="decimal" value={hours} onChange={(e) => { setHours(e.target.value); setConfirmed(false); }} /></div>
                  <div className="space-y-2"><Label>Stundensatz netto</Label><Input inputMode="decimal" value={hourlyRate} onChange={(e) => { setHourlyRate(e.target.value); setConfirmed(false); }} /></div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2"><Label>Einsätze</Label><Input inputMode="decimal" value={frequency} onChange={(e) => { setFrequency(e.target.value); setConfirmed(false); }} /></div>
                <div className="space-y-2">
                  <Label>Zeitraum</Label>
                  <Select value={frequencyUnit} onValueChange={(value) => { setFrequencyUnit(value as "week" | "month"); setConfirmed(false); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="week">Pro Woche</SelectItem><SelectItem value="month">Pro Monat</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Anfahrt netto</Label><Input inputMode="decimal" value={travel} onChange={(e) => { setTravel(e.target.value); setConfirmed(false); }} /></div>
              </div>

              <div className="space-y-2">
                <Label>Zusatzoptionen</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EXTRAS.map((item) => (
                    <label key={item.key} className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
                      <Checkbox checked={extras.includes(item.key)} onCheckedChange={(checked) => {
                        setExtras((prev) => checked ? [...prev, item.key] : prev.filter((key) => key !== item.key));
                        setConfirmed(false);
                      }} />
                      <span className="flex-1">{item.label}</span><span>{formatMoney(item.price)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox checked={stairs} onCheckedChange={(checked) => { setStairs(Boolean(checked)); setConfirmed(false); }} /> Treppenhausreinigung
                </label>
                {stairs ? <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Etagen</Label><Input inputMode="decimal" value={floors} onChange={(e) => { setFloors(e.target.value); setConfirmed(false); }} /></div>
                  <div className="space-y-2"><Label>Preis pro Etage netto</Label><Input inputMode="decimal" value={stairRate} onChange={(e) => { setStairRate(e.target.value); setConfirmed(false); }} /></div>
                </div> : null}
              </div>

              <div className="space-y-2"><Label>Bemerkung</Label><Textarea rows={3} value={note} onChange={(e) => { setNote(e.target.value); setConfirmed(false); }} placeholder="z. B. Reinigung montags und donnerstags, Zutritt nach Absprache" /></div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader><CardTitle>Angebotspreis</CardTitle><CardDescription>Live berechnet. Alle Werte bleiben vor dem Angebot änderbar.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {positions.map((item, index) => <div key={`${item.description}-${index}`} className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{item.description}</span><span className="shrink-0">{formatMoney(round2(item.quantity * item.unit_price))}</span></div>)}
              {positions.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine berechenbare Leistung.</p> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="space-y-2"><Label>Rabatt %</Label><Input inputMode="decimal" value={discountPercent} onChange={(e) => { setDiscountPercent(e.target.value); setConfirmed(false); }} /></div>
              <div className="space-y-2"><Label>Rabatt Betrag netto</Label><Input inputMode="decimal" value={discountAmount} onChange={(e) => { setDiscountAmount(e.target.value); setConfirmed(false); }} /></div>
            </div>
            <div className="space-y-2"><Label>Rabattgrund</Label><Input value={discountReason} onChange={(e) => { setDiscountReason(e.target.value); setConfirmed(false); }} placeholder="z. B. Treuerabatt" /></div>

            <div className="space-y-2">
              <Label>Steuerart</Label>
              <Select value={taxMode} onValueChange={(value) => { setTaxMode(value); setConfirmed(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="domestic">Inland – 19 % USt.</SelectItem>
                  <SelectItem value="eu_reverse_charge">EU-Ausland – Reverse-Charge</SelectItem>
                  <SelectItem value="kleinunternehmer">Kleinunternehmer § 19 UStG</SelectItem>
                </SelectContent>
              </Select>
              {taxNote ? <p className="text-xs text-muted-foreground">{taxNote}</p> : null}
            </div>

            <div className="space-y-2 rounded-md border bg-muted/40 p-4">
              <div className="flex justify-between"><span>Gesamt netto</span><strong>{formatMoney(net)}</strong></div>
              <div className="flex justify-between text-sm text-muted-foreground"><span>Umsatzsteuer</span><span>{formatMoney(vat)}</span></div>
              <div className="flex justify-between border-t pt-2 text-lg"><strong>Gesamt brutto</strong><strong>{formatMoney(gross)}</strong></div>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-dashed p-3 text-sm font-medium">
              <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(Boolean(checked))} />
              Kalkulation geprüft und final bestätigt
            </label>

            <Button className="w-full" disabled={!confirmed || net <= 0 || creating} onClick={() => void createQuote()}>
              <FileSignature className="size-4" /> {creating ? "Angebot wird erstellt …" : "Angebot erstellen"}
            </Button>

            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate({ to: "/kalkulation" })}>
              <Plus className="size-4" /> Alte Kalkulation zum Vergleich öffnen
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
