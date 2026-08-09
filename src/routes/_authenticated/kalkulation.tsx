import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calculator, FileSignature, FileText, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createDocument } from "@/lib/create-document";
import { formatMoney, formatNumber } from "@/lib/format";
import { fileUrl } from "@/lib/storage";
import { FileUploadButton } from "@/components/FileUploadButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/kalkulation")({
  head: () => ({
    meta: [
      { title: "Kalkulation – Reinigungspreise berechnen" },
      {
        name: "description",
        content:
          "Reinigungsaufträge nach Fläche, Stundensatz und Zusatzleistungen kalkulieren, Endpreis anpassen und direkt in ein Angebot übernehmen.",
      },
      { property: "og:title", content: "Kalkulation – Reinigungspreise berechnen" },
      {
        property: "og:description",
        content: "Preise für Reinigungsaufträge kalkulieren und als Angebot übernehmen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KalkulationPage,
});

type Mode = "area" | "hours";

const CLEANING_TYPES: { value: string; label: string; area: number; hourly: number }[] = [
  { value: "unterhalt", label: "Unterhaltsreinigung", area: 0.55, hourly: 29.41 },
  { value: "grund", label: "Grundreinigung", area: 1.9, hourly: 34.0 },
  { value: "bau", label: "Bauendreinigung", area: 2.6, hourly: 38.0 },
  { value: "glas", label: "Glas- und Fensterreinigung", area: 1.4, hourly: 33.0 },
  { value: "treppenhaus", label: "Treppenhausreinigung", area: 0.75, hourly: 29.41 },
  { value: "buero", label: "Büroreinigung", area: 0.65, hourly: 29.41 },
];

const EXTRAS: { key: string; label: string; price: number }[] = [
  { key: "fenster", label: "Fensterreinigung innen/außen", price: 60 },
  { key: "teppich", label: "Teppich-/Polsterreinigung", price: 90 },
  { key: "desinfektion", label: "Desinfektion", price: 45 },
  { key: "entsorgung", label: "Müllentsorgung", price: 35 },
  { key: "material", label: "Reinigungsmaterial & Verbrauch", price: 25 },
];

function num(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** 52 Wochen / 12 Monate */
const WEEKS_PER_MONTH = 4.33;
const STAIR_RATE_PER_FLOOR = 12.5;

function KalkulationPage() {
  const navigate = useNavigate();

  const [type, setType] = useState(CLEANING_TYPES[0]!.value);
  const [mode, setMode] = useState<Mode>("area");
  const [area, setArea] = useState("100");
  const [pricePerSqm, setPricePerSqm] = useState(String(CLEANING_TYPES[0]!.area));
  const [hours, setHours] = useState("4");
  const [hourlyRate, setHourlyRate] = useState(String(CLEANING_TYPES[0]!.hourly));
  const [frequency, setFrequency] = useState("1");
  const [frequencyUnit, setFrequencyUnit] = useState<"week" | "month">("month");
  const [travel, setTravel] = useState("0");
  const [extras, setExtras] = useState<string[]>([]);
  const [stairs, setStairs] = useState(false);
  const [floors, setFloors] = useState("1");
  const [stairRate, setStairRate] = useState(String(STAIR_RATE_PER_FLOOR));
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [finalTouched, setFinalTouched] = useState(false);
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<
    { path: string; name: string; url: string; isImage: boolean }[]
  >([]);
  const [confirmed, setConfirmed] = useState(false);

  const selected = CLEANING_TYPES.find((t) => t.value === type) ?? CLEANING_TYPES[0]!;

  /** Einsätze umgerechnet auf den Monat (Pro Woche × 4,33). */
  const visitsPerMonth = useMemo(() => {
    const times = Math.max(1, num(frequency) || 1);
    return frequencyUnit === "week" ? times * WEEKS_PER_MONTH : times;
  }, [frequency, frequencyUnit]);

  const base = useMemo(() => {
    const core =
      mode === "area" ? num(area) * num(pricePerSqm) : num(hours) * num(hourlyRate);
    return core * visitsPerMonth;
  }, [mode, area, pricePerSqm, hours, hourlyRate, visitsPerMonth]);

  const extrasTotal = useMemo(
    () => EXTRAS.filter((e) => extras.includes(e.key)).reduce((s, e) => s + e.price, 0),
    [extras],
  );

  const stairsTotal = useMemo(
    () => (stairs ? num(floors) * num(stairRate) * visitsPerMonth : 0),
    [stairs, floors, stairRate, visitsPerMonth],
  );

  const subtotal = base + extrasTotal + stairsTotal + num(travel);
  const pct = Math.min(100, Math.max(0, num(discountPercent)));
  const discountAmount = (subtotal * pct) / 100;
  const suggested = Math.round((subtotal - discountAmount) * 100) / 100;


  // Vorschlag automatisch übernehmen, solange der Endpreis nicht manuell geändert wurde.
  useEffect(() => {
    if (!finalTouched) setFinalPrice(suggested ? suggested.toFixed(2).replace(".", ",") : "0,00");
  }, [suggested, finalTouched]);

  const endNet = num(finalPrice);
  const vat = endNet * 0.19;

  const toQuote = useMutation({
    mutationFn: async () => {
      const quoteId = await createDocument("quote");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const parts: string[] = [selected.label];
      if (mode === "area") {
        parts.push(`${formatNumber(num(area))} m² × ${formatMoney(num(pricePerSqm))}/m²`);
      } else {
        parts.push(`${formatNumber(num(hours))} Std. × ${formatMoney(num(hourlyRate))}/Std.`);
      }
      parts.push(
        `${formatNumber(num(frequency))} Einsätze ${
          frequencyUnit === "week"
            ? `pro Woche (× 4,33 = ${formatNumber(visitsPerMonth)} pro Monat)`
            : "pro Monat"
        }`,
      );
      if (stairs) {
        parts.push(
          `Treppenhausreinigung: ${formatNumber(num(floors))} Etagen × ${formatMoney(num(stairRate))}/Etage`,
        );
      }
      const chosen = EXTRAS.filter((e) => extras.includes(e.key)).map((e) => e.label);
      if (chosen.length > 0) parts.push(`Zusatzleistungen: ${chosen.join(", ")}`);

      if (note.trim()) parts.push(note.trim());

      // Der manuell angepasste Endpreis ist bereits der Netto-Endbetrag nach Rabatt.
      const gross = pct < 100 ? endNet / (1 - pct / 100) : endNet;
      const unitPrice = Math.round(gross * 100) / 100;

      const { error: itemError } = await supabase.from("document_items").insert({
        document_id: quoteId,
        user_id: userId,
        position: 1,
        description: parts.join(" · "),
        quantity: 1,
        unit: "Pauschal",
        unit_price: unitPrice,
      });
      if (itemError) throw itemError;

      const { error: docError } = await supabase
        .from("documents")
        .update({
          service_description: parts.join("\n"),
          discount_percent: pct,
          discount_amount: Math.round((unitPrice - endNet) * 100) / 100,
          discount_reason: discountReason,
          net_total: endNet,
          vat_amount: endNet * 0.19,
          total: endNet * 1.19,
        } as never)
        .eq("id", quoteId);
      if (docError) throw docError;

      return quoteId;
    },
    onSuccess: (quoteId) => {
      toast.success("Angebot aus Kalkulation erstellt");
      navigate({
        to: "/dokumente/$id",
        params: { id: quoteId },
        search: { bearbeiten: true },
      });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Kalkulation</h1>
        <p className="text-sm text-muted-foreground">
          Preise für Reinigungsaufträge vorab berechnen, Endpreis frei anpassen und direkt als
          Angebot übernehmen.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="size-5" /> Leistungsdaten
            </CardTitle>
            <CardDescription>Reinigungstyp, Umfang und Zusatzoptionen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Reinigungstyp</Label>
                <Select
                  value={type}
                  onValueChange={(v) => {
                    setType(v);
                    const t = CLEANING_TYPES.find((x) => x.value === v);
                    if (t) {
                      setPricePerSqm(String(t.area));
                      setHourlyRate(String(t.hourly));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLEANING_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Berechnungsart</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="area">Nach Fläche (m²)</SelectItem>
                    <SelectItem value="hours">Nach Stunden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {mode === "area" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fläche (m²)</Label>
                  <Input
                    inputMode="decimal"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preis pro m² (netto)</Label>
                  <Input
                    inputMode="decimal"
                    value={pricePerSqm}
                    onChange={(e) => setPricePerSqm(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Stunden</Label>
                  <Input
                    inputMode="decimal"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stundensatz (netto)</Label>
                  <Input
                    inputMode="decimal"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Durchgänge / Einsätze</Label>
                <Input
                  inputMode="decimal"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Zeitraum</Label>
                <Select
                  value={frequencyUnit}
                  onValueChange={(v) => setFrequencyUnit(v as "week" | "month")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Pro Woche</SelectItem>
                    <SelectItem value="month">Pro Monat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Anfahrtspauschale (netto)</Label>
                <Input
                  inputMode="decimal"
                  value={travel}
                  onChange={(e) => setTravel(e.target.value)}
                />
              </div>
            </div>

            {frequencyUnit === "week" && (
              <p className="text-xs text-muted-foreground">
                Umrechnung auf den Monat mit 4,33 Wochen: {formatNumber(num(frequency))} × 4,33 ={" "}
                {formatNumber(visitsPerMonth)} Einsätze pro Monat.
              </p>
            )}

            <div className="space-y-2">
              <Label>Zusatzoptionen</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {EXTRAS.map((e) => (
                  <label
                    key={e.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <Checkbox
                      checked={extras.includes(e.key)}
                      onCheckedChange={(checked) =>
                        setExtras((prev) =>
                          checked ? [...prev, e.key] : prev.filter((k) => k !== e.key),
                        )
                      }
                    />
                    <span className="flex-1">{e.label}</span>
                    <span className="text-muted-foreground">{formatMoney(e.price)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={stairs}
                  onCheckedChange={(checked) => setStairs(Boolean(checked))}
                />
                <span>Treppenhausreinigung</span>
              </label>
              {stairs && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Anzahl der Etagen</Label>
                      <Input
                        inputMode="decimal"
                        value={floors}
                        onChange={(e) => setFloors(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Preis pro Etage (netto)</Label>
                      <Input
                        inputMode="decimal"
                        value={stairRate}
                        onChange={(e) => setStairRate(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(num(floors))} Etagen × {formatMoney(num(stairRate))} ×{" "}
                    {formatNumber(visitsPerMonth)} Einsätze = {formatMoney(stairsTotal)}
                  </p>
                </>
              )}
            </div>


            <div className="space-y-2">
              <Label>Bemerkung zur Leistung</Label>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="z. B. Reinigung wöchentlich, Zutritt nach Absprache"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Berechnung</CardTitle>
            <CardDescription>Automatische Vorab-Berechnung und freier Endpreis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grundleistung</span>
                <span>{formatMoney(base)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Zusatzoptionen</span>
                <span>{formatMoney(extrasTotal)}</span>
              </div>
              {stairs && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Treppenhausreinigung</span>
                  <span>{formatMoney(stairsTotal)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground">Anfahrt</span>
                <span>{formatMoney(num(travel))}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-muted-foreground">Zwischensumme (netto)</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Rabatt (%)</Label>
                <Input
                  inputMode="decimal"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Rabattgrund</Label>
                <Input
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="z. B. Treuerabatt"
                />
              </div>
            </div>

            {pct > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Rabatt {formatNumber(pct)} %{discountReason ? ` – ${discountReason}` : ""}
                </span>
                <span>−{formatMoney(discountAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Berechneter Preis (netto)</span>
              <span>{formatMoney(suggested)}</span>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label>Endpreis netto (frei anpassbar)</Label>
              <Input
                inputMode="decimal"
                value={finalPrice}
                onChange={(e) => {
                  setFinalTouched(true);
                  setFinalPrice(e.target.value);
                }}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>zzgl. 19 % MwSt. {formatMoney(vat)}</span>
                <span>Brutto {formatMoney(endNet + vat)}</span>
              </div>
              {finalTouched && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFinalTouched(false)}
                  className="px-0"
                >
                  Berechneten Preis wiederherstellen
                </Button>
              )}
            </div>

            <Button
              className="w-full"
              disabled={toQuote.isPending || endNet <= 0}
              onClick={() => toQuote.mutate()}
            >
              <FileSignature className="size-4" />
              In Angebot übernehmen
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
