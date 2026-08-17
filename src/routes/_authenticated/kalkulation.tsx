import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calculator, FileSignature, FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeCalculation } from "@/lib/item-ai.functions";

import { supabase } from "@/integrations/supabase/client";
import { createDocument } from "@/lib/create-document";
import { formatMoney, formatNumber } from "@/lib/format";
import { fileUrl, openStoredFile } from "@/lib/storage";

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

type KalkulationSearch = { area?: number; objekt?: string; belag?: string };

export const Route = createFileRoute("/_authenticated/kalkulation")({
  validateSearch: (search: Record<string, unknown>): KalkulationSearch => {
    const area = Number(search["area"]);
    return {
      ...(Number.isFinite(area) && area > 0 ? { area } : {}),
      ...(search["objekt"] ? { objekt: String(search["objekt"]) } : {}),
      ...(search["belag"] ? { belag: String(search["belag"]) } : {}),
    };
  },
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

const CLEANING_TYPES: {
  value: string;
  label: string;
  area: number;
  hourly: number;
  /** Empfohlener Stundensatz-Korridor (netto). */
  range: [number, number];
}[] = [
  { value: "unterhalt", label: "Unterhaltsreinigung", area: 0.55, hourly: 35, range: [34, 37] },
  { value: "grund", label: "Grundreinigung (Tiefenreinigung)", area: 1.9, hourly: 43, range: [42, 45] },
  { value: "bau", label: "Bauendreinigung (Tiefenreinigung)", area: 2.6, hourly: 44, range: [42, 45] },
  { value: "glas", label: "Glas- und Fensterreinigung", area: 1.4, hourly: 36, range: [34, 37] },
  { value: "treppenhaus", label: "Treppenhausreinigung", area: 0.75, hourly: 35, range: [34, 37] },
  { value: "buero", label: "Büroreinigung", area: 0.65, hourly: 35, range: [34, 37] },
];

const EXTRAS: { key: string; label: string; price: number }[] = [
  { key: "fenster", label: "Fensterreinigung innen/außen", price: 60 },
  { key: "entsorgung", label: "Müllentsorgung", price: 35 },
];

function num(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** 52 Wochen / 12 Monate */
const WEEKS_PER_MONTH = 4.33;
const STAIR_RATE_PER_FLOOR = 12.5;

/** Hochgeladener Grundriss/Foto inkl. abgelesener Eckdaten. */
type Attachment = {
  path: string;
  name: string;
  url: string;
  isImage: boolean;
  sqm: string;
  rooms: string;
  floors: string;
  note: string;
};




type AiItem = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
};

function KalkulationPage() {
  const navigate = useNavigate();

  const search = Route.useSearch();
  const [type, setType] = useState(CLEANING_TYPES[0]!.value);
  const [mode, setMode] = useState<Mode>("area");
  const [area, setArea] = useState(
    search.area ? String(search.area).replace(".", ",") : "100",
  );
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
  const [hasLift, setHasLift] = useState(false);
  const [liftRate, setLiftRate] = useState("5,00");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [finalTouched, setFinalTouched] = useState(false);
  const [note, setNote] = useState(() => {
    const parts: string[] = [];
    if (search.objekt) parts.push(`Objekt: ${search.objekt}`);
    if (search.belag) parts.push(`Bodenbelag: ${search.belag}`);
    return parts.join(" · ");
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const selected = CLEANING_TYPES.find((t) => t.value === type) ?? CLEANING_TYPES[0]!;

  function updateAttachment(path: string, patch: Partial<Attachment>) {
    setAttachments((prev) => prev.map((a) => (a.path === path ? { ...a, ...patch } : a)));
  }




  // ---- KI-Positionsvorschläge (voll manuell überschreibbar) ----------------
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiItems, setAiItems] = useState<AiItem[]>([]);
  const analyze = useServerFn(analyzeCalculation);
  const aiSuggest = useMutation({
    mutationFn: async () => analyze({ data: { prompt: aiPrompt } }),
    onSuccess: (res) => {
      const dec = (v: number) => String(v).replace(".", ",");
      const preset = CLEANING_TYPES.find((t) => t.value === res.cleaning_type);
      if (preset) {
        setType(preset.value);
        setPricePerSqm(dec(res.price_per_sqm > 0 ? res.price_per_sqm : preset.area));
        setHourlyRate(dec(res.hourly_rate > 0 ? res.hourly_rate : preset.hourly));
      }
      setMode(res.mode);
      if (res.area_sqm > 0) setArea(dec(res.area_sqm));
      if (res.hours > 0) setHours(dec(res.hours));
      if (res.frequency > 0) setFrequency(dec(res.frequency));
      setFrequencyUnit(res.frequency_unit);
      if (res.travel > 0) setTravel(dec(res.travel));
      if (res.stairs) {
        setStairs(true);
        if (res.floors > 0) setFloors(dec(res.floors));
      }
      if (res.note.trim()) setNote((prev) => (prev.trim() ? `${prev}\n${res.note}` : res.note));
      setFinalTouched(false);

      const list = res.items.map((i, n) => ({
        id: `${Date.now()}-${n}`,
        description: i.description,
        quantity: String(i.quantity).replace(".", ","),
        unit: i.unit,
        unit_price: String(i.unit_price).replace(".", ","),
      }));
      setAiItems((prev) => [...prev, ...list]);
      toast.success(
        `Kalkulation übernommen – ${list.length} Positionen erstellt (frei anpassbar)`,
      );
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });


  const aiTotal = useMemo(
    () => aiItems.reduce((s, i) => s + num(i.quantity) * num(i.unit_price), 0),
    [aiItems],
  );

  const patchAiItem = (id: string, patch: Partial<AiItem>) =>
    setAiItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  /** Summierte Eckdaten aus allen hochgeladenen Grundrissen/Fotos. */
  const analysisTotals = useMemo(
    () => ({
      sqm: attachments.reduce((s, a) => s + num(a.sqm), 0),
      rooms: attachments.reduce((s, a) => s + num(a.rooms), 0),
      floors: attachments.reduce((s, a) => s + num(a.floors), 0),
    }),
    [attachments],
  );

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
    () =>
      stairs
        ? (num(floors) * num(stairRate) + (hasLift ? num(liftRate) : 0)) * visitsPerMonth
        : 0,
    [stairs, floors, stairRate, hasLift, liftRate, visitsPerMonth],
  );

  const subtotal = base + extrasTotal + stairsTotal + num(travel);
  const pct = Math.min(100, Math.max(0, num(discountPercent)));
  const discountAmount = (subtotal * pct) / 100;
  const suggested = Math.round((subtotal - discountAmount) * 100) / 100;


  // Vorschlag automatisch übernehmen, solange der Endpreis nicht manuell geändert wurde.
  useEffect(() => {
    if (!finalTouched) setFinalPrice(suggested ? suggested.toFixed(2).replace(".", ",") : "0,00");
  }, [suggested, finalTouched]);

  // Jede Änderung hebt die finale Bestätigung wieder auf.
  useEffect(() => {
    setConfirmed(false);
  }, [suggested, finalPrice, note, discountReason, selected.value]);

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
        parts.push(
          hasLift
            ? `Aufzug vorhanden – Aufzugkabine inkl. (${formatMoney(num(liftRate))}/Einsatz)`
            : "Kein Aufzug vorhanden",
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

      if (aiItems.length > 0) {
        const { error: aiError } = await supabase.from("document_items").insert(
          aiItems.map((i, n) => ({
            document_id: quoteId,
            user_id: userId,
            position: n + 2,
            description: i.description,
            quantity: num(i.quantity),
            unit: i.unit,
            unit_price: num(i.unit_price),
          })),
        );
        if (aiError) throw aiError;
      }

      const { error: docError } = await supabase
        .from("documents")
        .update({
          service_description: parts.join("\n"),
          discount_percent: pct,
          discount_amount: Math.round((unitPrice - endNet) * 100) / 100,
          discount_reason: discountReason,
          net_total: endNet + aiTotal,
          vat_amount: (endNet + aiTotal) * 0.19,
          total: (endNet + aiTotal) * 1.19,
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
                  <p className="text-xs text-muted-foreground">
                    Empfehlung {selected.label}: {formatMoney(selected.range[0])} –{" "}
                    {formatMoney(selected.range[1])} pro Stunde. Frei überschreibbar – die Summe
                    aktualisiert sich sofort.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {[selected.range[0], Math.round((selected.range[0] + selected.range[1]) / 2), selected.range[1]].map(
                      (r) => (
                        <Button
                          key={r}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setHourlyRate(String(r))}
                        >
                          {formatMoney(r)}
                        </Button>
                      ),
                    )}
                  </div>
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

            {search.area ? (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Vorschlagswerte aus der Projekt-Analyse übernommen: {formatNumber(search.area)} m²
                {search.belag ? ` · Bodenbelag ${search.belag}` : ""}. Bitte prüfen und bei Bedarf
                anpassen.
              </p>
            ) : null}

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
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Gibt es einen Aufzug?</Label>
                      <Select
                        value={hasLift ? "yes" : "no"}
                        onValueChange={(v) => setHasLift(v === "yes")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">Nein – kein Aufzug</SelectItem>
                          <SelectItem value="yes">Ja – Aufzug vorhanden</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {hasLift && (
                      <div className="space-y-2">
                        <Label>Aufzugkabine pro Einsatz (netto)</Label>
                        <Input
                          inputMode="decimal"
                          value={liftRate}
                          onChange={(e) => setLiftRate(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ({formatNumber(num(floors))} Etagen × {formatMoney(num(stairRate))}
                    {hasLift ? ` + Aufzug ${formatMoney(num(liftRate))}` : ""}) ×{" "}
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

            <div className="space-y-3 rounded-md border p-3">
              <div>
                <Label>Grundrisse & Fotos</Label>
                <p className="text-xs text-muted-foreground">
                  PDF-Grundrisse oder Fotos (JPG, PNG) hochladen – nur zur internen Ablage und für
                  Notizen. m², Räume und Etagen tragen Sie bitte manuell ein.
                </p>
              </div>
              <FileUploadButton
                folder="kalkulation"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                label="Datei oder Foto hochladen"
                onUploaded={(path, file) => {
                  void (async () => {
                    const url = await fileUrl(path);
                    setAttachments((prev) => [
                      ...prev,
                      {
                        path,
                        name: file.name,
                        url,
                        isImage: file.type.startsWith("image/"),
                        sqm: "",
                        rooms: "",
                        floors: "",
                        note: "",
                      },
                    ]);
                  })();
                }}
              />

              {attachments.length > 0 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {attachments.map((a) => (
                      <div key={a.path} className="space-y-2 rounded-md border p-2">
                        {a.isImage && a.url ? (
                          <button
                            type="button"
                            onClick={() =>
                              void openStoredFile(a.path, a.name).catch(() =>
                                toast.error("Datei konnte nicht geöffnet werden."),
                              )
                            }
                          >
                            <img
                              src={a.url}
                              alt={`Vorschau ${a.name}`}
                              className="h-32 w-full rounded object-cover"
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void openStoredFile(a.path, a.name).catch(() =>
                                toast.error("Datei konnte nicht geöffnet werden."),
                              )
                            }
                            className="flex h-32 w-full items-center justify-center rounded bg-muted"
                          >
                            <FileText className="size-8 text-muted-foreground" />
                          </button>
                        )}



                        <div className="flex items-center gap-2">
                          <span className="flex-1 truncate text-xs">{a.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setAttachments((prev) => prev.filter((x) => x.path !== a.path))
                            }
                            aria-label="Entfernen"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">m²</Label>
                            <Input
                              inputMode="decimal"
                              value={a.sqm}
                              onChange={(e) => updateAttachment(a.path, { sqm: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Räume</Label>
                            <Input
                              inputMode="decimal"
                              value={a.rooms}
                              onChange={(e) => updateAttachment(a.path, { rooms: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Etagen</Label>
                            <Input
                              inputMode="decimal"
                              value={a.floors}
                              onChange={(e) => updateAttachment(a.path, { floors: e.target.value })}
                            />
                          </div>
                        </div>
                        <Textarea
                          rows={2}
                          value={a.note}
                          onChange={(e) => updateAttachment(a.path, { note: e.target.value })}
                          placeholder="Notiz zum Grundriss (z. B. Bodenbelag, Sanitärräume)"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={num(a.sqm) <= 0}
                            onClick={() => {
                              setMode("area");
                              setArea(a.sqm);
                              toast.success("Fläche in die Kalkulation übernommen");
                            }}
                          >
                            m² übernehmen
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={num(a.floors) <= 0}
                            onClick={() => {
                              setStairs(true);
                              setFloors(a.floors);
                              toast.success("Etagen in die Treppenhausreinigung übernommen");
                            }}
                          >
                            Etagen übernehmen
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const line = [
                                a.name,
                                num(a.sqm) > 0 ? `${formatNumber(num(a.sqm))} m²` : "",
                                num(a.rooms) > 0 ? `${formatNumber(num(a.rooms))} Räume` : "",
                                num(a.floors) > 0 ? `${formatNumber(num(a.floors))} Etagen` : "",
                                a.note.trim(),
                              ]
                                .filter(Boolean)
                                .join(" · ");
                              setNote((prev) => (prev.trim() ? `${prev}\n${line}` : line));
                              toast.success("Als Notiz übernommen");
                            }}
                          >
                            Als Notiz übernehmen
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <div className="mb-1 font-medium">Übersicht aus Unterlagen</div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                      <span>Gesamtfläche: {formatNumber(analysisTotals.sqm)} m²</span>
                      <span>Räume: {formatNumber(analysisTotals.rooms)}</span>
                      <span>Etagen: {formatNumber(analysisTotals.floors)}</span>
                    </div>
                    {analysisTotals.sqm > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setMode("area");
                          setArea(String(analysisTotals.sqm));
                          toast.success("Gesamtfläche übernommen");
                        }}
                      >
                        Gesamtfläche in Kalkulation übernehmen
                      </Button>
                    )}
                  </div>
                </>
              )}
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

            <div className="space-y-3 rounded-md border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                Diese Kalkulation ist ein interner Entwurf. Bitte alle Angaben prüfen und final
                bestätigen – erst danach kann ein Angebot erstellt werden.
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(Boolean(checked))}
                />
                <span>Kalkulation geprüft und final bestätigt</span>
              </label>
            </div>

            <Button
              className="w-full"
              disabled={toQuote.isPending || endNet <= 0 || !confirmed}
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
