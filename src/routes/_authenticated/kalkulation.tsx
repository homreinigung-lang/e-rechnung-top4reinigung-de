import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calculator,
  FileDown,
  FileSignature,
  FileText,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeCalculation } from "@/lib/item-ai.functions";
import { analyzeProject } from "@/lib/project-scan.functions";

import { supabase } from "@/integrations/supabase/client";
import { createDocument } from "@/lib/create-document";
import { formatMoney, formatNumber } from "@/lib/format";
import { fileUrl, openStoredFile } from "@/lib/storage";
import { buildLvPdf } from "@/lib/lv-pdf";
import { saveFile } from "@/lib/download";
import { useRaumbuch } from "@/lib/raumbuch";
import {
  buildConsolidatedPositions,
  checkPlausibility,
  detectStairs,
  normalizeItems,
  positionsTotal,
  reconcilePositionsTotal,
  round2,
  toCents,
  MIN_STAIR_RATE,
} from "@/lib/kalkulation-engine";

import { FileUploadButton } from "@/components/FileUploadButton";
import { ProjektAnalyse, type KalkulationSnapshot } from "@/components/ProjektAnalyse";
import { ProjektKennzahlen } from "@/components/ProjektKennzahlen";
import { KalkulationAnalytics } from "@/components/KalkulationAnalytics";
import { SpeechToTextButton } from "@/components/SpeechToTextButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Kurze, verständliche Einleitung am Kopf jedes Bereichs. */
function SectionIntro({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  {
    value: "grund",
    label: "Grundreinigung (Tiefenreinigung)",
    area: 1.9,
    hourly: 43,
    range: [42, 45],
  },
  {
    value: "bau",
    label: "Bauendreinigung (Tiefenreinigung)",
    area: 2.6,
    hourly: 44,
    range: [42, 45],
  },
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

const AUTO_BALANCE_DESCRIPTIONS = new Set([
  "Manuelle Endpreisanpassung",
  "Manueller Preisnachlass",
]);

function KalkulationPage() {
  const navigate = useNavigate();

  const search = Route.useSearch();
  const [type, setType] = useState(CLEANING_TYPES[0]!.value);
  const [mode, setMode] = useState<Mode>("area");
  const [area, setArea] = useState(search.area ? String(search.area).replace(".", ",") : "100");
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
  const [projectId, setProjectId] = useState<string | null>(null);

  const [note, setNote] = useState(() => {
    const parts: string[] = [];
    if (search.objekt) parts.push(`Objekt: ${search.objekt}`);
    if (search.belag) parts.push(`Bodenbelag: ${search.belag}`);
    return parts.join(" · ");
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tenderDocs, setTenderDocs] = useState<Attachment[]>([]);
  const [floorplanSummary, setFloorplanSummary] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalText, setProposalText] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const selected = CLEANING_TYPES.find((t) => t.value === type) ?? CLEANING_TYPES[0]!;

  /**
   * Raumbuch des verknüpften Projekts. Liegen erfasste Räume vor, kommen
   * Fläche und Stundenbedarf daraus statt aus der KI-Schätzung.
   */
  const { data: raumbuch } = useRaumbuch(projectId);
  const [raumbuchApplied, setRaumbuchApplied] = useState(false);

  useEffect(() => {
    if (!raumbuch) {
      setRaumbuchApplied(false);
      return;
    }
    setArea(String(raumbuch.totalArea).replace(".", ","));
    if (raumbuch.hoursPerVisit > 0) setHours(String(raumbuch.hoursPerVisit).replace(".", ","));
    setRaumbuchApplied(true);
  }, [raumbuch]);

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
      // Fläche/Stunden kommen aus dem Raumbuch, sobald ein Projekt mit erfassten
      // Räumen verknüpft ist – sonst weiterhin aus der KI-Schätzung.
      if (raumbuch) {
        setArea(String(raumbuch.totalArea).replace(".", ","));
        if (raumbuch.hoursPerVisit > 0) setHours(String(raumbuch.hoursPerVisit).replace(".", ","));
      } else {
        if (res.area_sqm > 0) setArea(dec(res.area_sqm));
        if (res.hours > 0) setHours(dec(res.hours));
      }

      if (res.frequency > 0) setFrequency(dec(res.frequency));
      setFrequencyUnit(res.frequency_unit);
      if (res.travel > 0) setTravel(dec(res.travel));
      // Treppen aus Antwort ODER Freitext erkennen – nie mit 0,00 € anlegen.
      const fromText = detectStairs(aiPrompt);
      const stairsDetected = res.stairs || fromText.stairs;
      const detectedFloors = Math.max(res.floors, fromText.floors, stairsDetected ? 1 : 0);
      if (stairsDetected) {
        setStairs(true);
        if (detectedFloors > 0) setFloors(dec(detectedFloors));
      }
      if (res.note.trim()) setNote((prev) => (prev.trim() ? `${prev}\n${res.note}` : res.note));
      setFinalTouched(false);

      const rate = num(hourlyRate) || res.hourly_rate;
      const cleaned = normalizeItems(res.items, {
        hourlyRate: rate,
        stairRate: num(stairRate),
        floors: detectedFloors,
      });

      // Fehlt trotz erkannter Treppen eine Treppenhaus-Position, wird sie ergänzt.
      if (stairsDetected && !cleaned.some((i) => /treppe/i.test(i.description))) {
        const visits =
          (res.frequency_unit === "week" ? res.frequency * WEEKS_PER_MONTH : res.frequency) || 1;
        const stairPrice = num(stairRate) > 0 ? num(stairRate) : MIN_STAIR_RATE;
        cleaned.push({
          description: `Treppenhausreinigung – ${detectedFloors} Etagen`,
          quantity: round2(detectedFloors * visits),
          unit: "Etage",
          unit_price: round2(stairPrice),
        });
      }

      const list = cleaned.map((i, n) => ({
        id: `${Date.now()}-${n}`,
        description: i.description,
        quantity: String(i.quantity).replace(".", ","),
        unit: i.unit,
        unit_price: String(i.unit_price).replace(".", ","),
      }));
      setAiItems(list);
      toast.success(`Kalkulation übernommen – ${list.length} Positionen erstellt (frei anpassbar)`);
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const patchAiItem = (id: string, patch: Partial<AiItem>) =>
    setAiItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  // ---- Projekt-Analyse direkt aus den hochgeladenen Unterlagen -------------
  const runProjectScan = useServerFn(analyzeProject);
  const [scanningPath, setScanningPath] = useState<string | null>(null);
  const scanFile = useMutation({
    mutationFn: async (a: Attachment) => {
      setScanningPath(a.path);
      const url = a.url || (await fileUrl(a.path));
      const scan = await runProjectScan({
        data: {
          fileUrl: url,
          mimeType: a.isImage ? "image/jpeg" : "application/pdf",
          mode: a.isImage ? "floorplan" : "tender",
        },
      });
      return { a, scan };
    },
    onSuccess: ({ a, scan }) => {
      const sqm = scan.rooms.reduce((s, r) => s + Number(r.area_sqm || 0), 0);
      const floorSet = new Set(scan.rooms.map((r) => r.floor).filter(Boolean));
      updateAttachment(a.path, {
        sqm: sqm > 0 ? String(Math.round(sqm * 100) / 100).replace(".", ",") : a.sqm,
        rooms: scan.rooms.length > 0 ? String(scan.rooms.length) : a.rooms,
        floors: floorSet.size > 0 ? String(floorSet.size) : a.floors,
        note: [a.note.trim(), scan.executive_summary.trim(), ...scan.highlights]
          .filter(Boolean)
          .join(" · "),
      });

      if (sqm > 0 && !raumbuch) {
        setMode("area");
        setArea(String(Math.round(sqm * 100) / 100).replace(".", ","));
      }

      if (floorSet.size > 1) {
        setStairs(true);
        setFloors(String(floorSet.size));
      }
      if (scan.requirements.length > 0) {
        const line = `Kundenanforderungen: ${scan.requirements.join("; ")}`;
        setNote((prev) => (prev.trim() ? `${prev}\n${line}` : line));
      }

      const posFromItems = scan.items.map((it, n) => ({
        id: `scan-${Date.now()}-${n}`,
        description: [it.section, it.title, it.description]
          .filter(Boolean)
          .join(" – ")
          .slice(0, 200),
        quantity: String(it.quantity > 0 ? it.quantity : 1).replace(".", ","),
        unit: it.unit || "Pauschal",
        unit_price: hourlyRate,
      }));
      if (posFromItems.length > 0) setAiItems((prev) => [...prev, ...posFromItems]);

      toast.success(
        `Analyse übernommen – ${scan.rooms.length} Räume, ${posFromItems.length} Positionen`,
      );
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
    onSettled: () => setScanningPath(null),
  });

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

  const extrasTotal = useMemo(
    () => round2(EXTRAS.filter((e) => extras.includes(e.key)).reduce((s, e) => s + e.price, 0)),
    [extras],
  );

  const stairsTotal = useMemo(
    () =>
      round2(
        stairs
          ? round2(num(floors) * visitsPerMonth) * round2(num(stairRate)) +
              (hasLift ? round2(visitsPerMonth) * round2(num(liftRate)) : 0)
          : 0,
      ),
    [stairs, floors, stairRate, hasLift, liftRate, visitsPerMonth],
  );

  const pct = Math.min(100, Math.max(0, num(discountPercent)));

  /**
   * Exakt derselbe deterministische Positionssatz speist Vorschau und Transfer.
   * Dadurch kann die Grundkalkulation nicht von ihrem späteren LV abweichen.
   */
  const stagedPositionsBeforeDiscount = useMemo(
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
        hasLift,
        liftRate: num(liftRate),
        extras: EXTRAS.filter((e) => extras.includes(e.key)).map((e) => ({
          label: e.label,
          price: e.price,
        })),
        travel: num(travel),
        discountPercent: 0,
        discountReason: "",
      }),
    [
      selected.value,
      selected.label,
      mode,
      area,
      pricePerSqm,
      hours,
      hourlyRate,
      visitsPerMonth,
      stairs,
      floors,
      stairRate,
      hasLift,
      liftRate,
      extras,
      travel,
    ],
  );
  const subtotal = useMemo(
    () => positionsTotal(stagedPositionsBeforeDiscount),
    [stagedPositionsBeforeDiscount],
  );
  const discountAmount = round2((subtotal * pct) / 100);
  const stagedPositions = useMemo(() => {
    if (pct <= 0 || stagedPositionsBeforeDiscount.length === 0) {
      return stagedPositionsBeforeDiscount;
    }
    return [
      ...stagedPositionsBeforeDiscount,
      {
        description: `Rabatt ${round2(pct)} %${discountReason ? ` – ${discountReason}` : ""}`,
        quantity: 1,
        unit: "Pauschal",
        unit_price: -discountAmount,
      },
    ];
  }, [stagedPositionsBeforeDiscount, pct, discountReason, discountAmount]);
  const base = round2(subtotal - extrasTotal - stairsTotal - round2(num(travel)));
  const suggested = useMemo(() => positionsTotal(stagedPositions), [stagedPositions]);

  // Vorschlag automatisch übernehmen, solange der Endpreis nicht manuell geändert wurde.
  useEffect(() => {
    if (!finalTouched) setFinalPrice(suggested ? suggested.toFixed(2).replace(".", ",") : "0,00");
  }, [suggested, finalTouched]);

  /**
   * Verbindlicher SSOT: Der Endpreis der Grundkalkulation ist das Ziel für das
   * Leistungsverzeichnis. Alle Ausgaben verwenden ausschließlich diesen
   * centgenau abgeglichenen Positionssatz. Manuelle LV-Änderungen verändern
   * daher automatisch nur die sichtbare Ausgleichsposition, nie den Endpreis.
   */
  const targetNetTotal = round2(num(finalPrice));
  const lvBasePositions = useMemo(
    () =>
      aiItems
        .map((item) => ({
          description: item.description.trim(),
          quantity: round2(num(item.quantity)),
          unit: item.unit.trim() || "Pauschal",
          unit_price: round2(num(item.unit_price)),
        }))
        .filter(
          (item) =>
            item.description.length > 0 &&
            !AUTO_BALANCE_DESCRIPTIONS.has(item.description) &&
            Math.abs(item.quantity * item.unit_price) >= 0.01,
        ),
    [aiItems],
  );
  const synchronizedLvPositions = useMemo(
    () => reconcilePositionsTotal(lvBasePositions, targetNetTotal),
    [lvBasePositions, targetNetTotal],
  );
  const balancingPosition =
    synchronizedLvPositions.length > lvBasePositions.length
      ? synchronizedLvPositions[synchronizedLvPositions.length - 1]
      : undefined;
  const aiTotal = targetNetTotal;
  const vatAmount = round2(aiTotal * 0.19);
  const grossTotal = round2(aiTotal + vatAmount);

  // Jede preis- oder angebotsrelevante Änderung hebt die finale Bestätigung
  // wieder auf – insbesondere direkte Änderungen am Leistungsverzeichnis.
  useEffect(() => {
    setConfirmed(false);
  }, [suggested, finalPrice, note, discountReason, selected.value, aiItems]);

  // Live-Kennzahlen für die integrierte Projekt-Analyse
  const monthlyHours = useMemo(() => {
    if (mode === "hours") return num(hours) * visitsPerMonth;
    const rate = num(hourlyRate);
    if (rate <= 0) return 0;
    return (num(area) * num(pricePerSqm) * visitsPerMonth) / rate;
  }, [mode, hours, area, pricePerSqm, hourlyRate, visitsPerMonth]);

  /** Plausibilitätsprüfung der Eingaben (Fläche vs. Räume/Etagen/Sanitär). */
  const warnings = useMemo(
    () =>
      checkPlausibility({
        areaSqm: mode === "area" ? num(area) : analysisTotals.sqm,
        rooms: analysisTotals.rooms,
        floors: Math.max(analysisTotals.floors, stairs ? num(floors) : 0),
      }),
    [mode, area, analysisTotals, stairs, floors],
  );

  /**
   * Übernimmt die Grundkalkulation: bestehende Positionen werden zuerst
   * vollständig geleert, danach wird der konsolidierte Satz eingefügt.
   */
  function applyCalculation() {
    if (warnings.length > 0) {
      toast.error("Bitte zuerst die markierten Plausibilitätshinweise prüfen.");
      return;
    }
    const targetTotal = round2(num(finalPrice));
    if (targetTotal <= 0) {
      toast.error("Bitte einen gültigen Netto-Endpreis größer als 0 eingeben.");
      return;
    }
    const calculatedPositions = stagedPositions;
    if (calculatedPositions.length === 0) {
      toast.error("Die Grundkalkulation ergibt noch keine gültigen Positionen.");
      return;
    }
    const positions = reconcilePositionsTotal(calculatedPositions, targetTotal);
    const transferredTotal = positionsTotal(positions);
    if (toCents(transferredTotal) !== toCents(targetTotal)) {
      toast.error(
        "Der Endpreis konnte nicht centgenau in das Leistungsverzeichnis übernommen werden.",
      );
      return;
    }
    // Nur die fachlichen Grundpositionen speichern. Die ggf. erforderliche
    // Ausgleichsposition wird zentral und reaktiv aus dem Endpreis abgeleitet.
    setAiItems(
      calculatedPositions.map((p, n) => ({
        id: `calc-${Date.now()}-${n}`,
        description: p.description,
        quantity: String(p.quantity).replace(".", ","),
        unit: p.unit,
        unit_price: String(p.unit_price).replace(".", ","),
      })),
    );
    toast.success(
      `Kalkulation übernommen – Gesamt netto ${formatMoney(transferredTotal)} exakt übertragen`,
    );
  }

  const analyseSnapshot: KalkulationSnapshot = {
    typeLabel: selected.label,
    areaSqm: mode === "area" ? num(area) : analysisTotals.sqm,
    monthlyHours,
    visitsPerMonth,
    positions: synchronizedLvPositions.length,
    attachments: attachments.length,
    netTotal: aiTotal,
    confirmed,
  };

  /** Leistungsverzeichnis als abgabefertiges PDF exportieren. */
  const exportLv = useMutation({
    mutationFn: async () => {
      const positions = synchronizedLvPositions.map((i, n) => ({
        oz: `${n + 1}.10`,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unit_price,
      }));
      if (positions.length === 0) {
        throw new Error("Bitte zuerst LV-Positionen erfassen oder die Kalkulation übernehmen.");
      }

      const { data: settings } = await supabase
        .from("company_settings")
        .select(
          "company_name, owner_name, address_line, postal_code, city, email, phone, vat_id, tax_number, iban, bic, bank_name",
        )
        .maybeSingle();

      const bytes = await buildLvPdf({
        title: proposalTitle.trim() || `Leistungsverzeichnis ${selected.label}`,
        reference: proposalTitle.trim(),
        proposalText: proposalText.trim(),
        objectDescription: floorplanSummary.trim(),
        company: {
          name: settings?.company_name || "Unternehmen",
          ownerName: settings?.owner_name ?? "",
          addressLine: settings?.address_line ?? "",
          postalCode: settings?.postal_code ?? "",
          city: settings?.city ?? "",
          email: settings?.email ?? "",
          phone: settings?.phone ?? "",
          vatId: settings?.vat_id ?? "",
          taxNumber: settings?.tax_number ?? "",
          iban: settings?.iban ?? "",
          bic: settings?.bic ?? "",
          bankName: settings?.bank_name ?? "",
        },
        meta: [
          { label: "Leistungsart", value: selected.label },
          {
            label: "Fläche",
            value: `${formatNumber(mode === "area" ? num(area) : analysisTotals.sqm)} m²`,
          },
          { label: "Einsätze/Monat", value: formatNumber(visitsPerMonth) },
          { label: "Stundenbedarf", value: `${formatNumber(monthlyHours)} Std./Monat` },
        ],
        positions,
        vatRate: 19,
      });
      await saveFile(
        new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
        "Leistungsverzeichnis.pdf",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toQuote = useMutation({
    mutationFn: async () => {
      // Nur geprüfte, rechnerisch gültige Daten dürfen ins Angebot.
      if (warnings.length > 0) {
        throw new Error("Bitte zuerst die Plausibilitätshinweise klären.");
      }
      const positions = synchronizedLvPositions;
      if (positions.length === 0) {
        throw new Error(
          "Es liegen keine gültigen Positionen vor. Bitte zuerst die Kalkulation übernehmen.",
        );
      }

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
      if (discountReason.trim() && pct > 0) {
        parts.push(`Rabatt ${formatNumber(pct)} % – ${discountReason.trim()}`);
      }
      if (note.trim()) parts.push(note.trim());

      const { error: itemError } = await supabase.from("document_items").insert(
        positions.map((i, n) => ({
          document_id: quoteId,
          user_id: userId,
          position: n + 1,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
        })),
      );
      if (itemError) throw itemError;

      const description = [
        proposalTitle.trim() ? `Ausschreibung: ${proposalTitle.trim()}` : "",
        floorplanSummary.trim(),
        parts.join("\n"),
      ]
        .filter(Boolean)
        .join("\n");

      const net = positionsTotal(positions);
      const { error: docError } = await supabase
        .from("documents")
        .update({
          service_description: description,
          ...(proposalText.trim() ? { intro_text: proposalText.trim() } : {}),
          // Rabatt steckt bereits als eigene Position im LV – kein zweiter Abzug.
          discount_percent: 0,
          discount_amount: 0,
          discount_reason: discountReason,
          net_total: net,
          vat_amount: round2(net * 0.19),
          total: round2(net * 1.19),
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
          Zentraler Bereich für Analyse, Grundriss-Kalkulation und Ausschreibungen. Alles bleibt
          manuell änderbar und geht mit einem Klick ins Angebot.
        </p>
      </div>

      <Tabs defaultValue="grundriss" className="space-y-6">
        <TabsList>
          <TabsTrigger value="analyse">Analyse & Kennzahlen</TabsTrigger>
          <TabsTrigger value="grundriss">Grundriss (Planung)</TabsTrigger>
          <TabsTrigger value="ausschreibung">Ausschreibung (Angebot & Vergabe)</TabsTrigger>
        </TabsList>

        <TabsContent value="analyse" className="space-y-6">
          <SectionIntro
            title="Analyse & Kennzahlen"
            text="Zentrale Auswertung aller Projekte: Wirtschaftlichkeit, Umsatzentwicklung, Personalkosten und Effizienz von Soll- zu Ist-Stunden. Die Werte entstehen live aus Grundriss-Kalkulation, Einsatzplanung und erfassten Arbeitszeiten."
          />
          <ProjektAnalyse
            projectId={projectId}
            onProjectChange={setProjectId}
            snapshot={analyseSnapshot}
          />
          <ProjektKennzahlen projectId={projectId} />
          <KalkulationAnalytics activeProjectId={projectId} />
        </TabsContent>

        <TabsContent value="grundriss" className="space-y-6">
          <SectionIntro
            title="Grundriss (Planung)"
            text="Grundlage der Kalkulation: Grundrisse und Objektfotos hochladen, Flächen, Räume und Etagen dokumentieren und den Reinigungsaufwand berechnen. Die hier ermittelten Werte fließen automatisch in die Ausschreibung und in die Kennzahlen."
          />

          {warnings.length > 0 && (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Angaben bitte prüfen</p>
                {warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Objektbeschreibung</CardTitle>
              <CardDescription>
                Bauliche Besonderheiten und Reinigungsanforderungen zum Objekt – ergänzend zu den
                Notizen an den einzelnen Grundrissen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2">
                <Textarea
                  rows={4}
                  className="flex-1"
                  value={floorplanSummary}
                  onChange={(e) => setFloorplanSummary(e.target.value)}
                  placeholder="z. B. 3 Etagen ohne Aufzug, Treppenhaus mit Naturstein, Großraumbüros mit Teppich, Serverraum von der Reinigung ausgenommen"
                />
                <SpeechToTextButton
                  value={floorplanSummary}
                  onChange={setFloorplanSummary}
                  label="Objektbeschreibung diktieren"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5" /> KI-Assistent
              </CardTitle>
              <CardDescription>
                Auftrag kurz beschreiben – Reinigungstyp, Fläche, Turnus, Etagen und die
                Leistungspositionen werden automatisch übernommen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2">
                <Textarea
                  rows={3}
                  className="flex-1"
                  placeholder="z. B. Bürogebäude 450 m², 3 Etagen, 2× wöchentlich Unterhaltsreinigung, Sanitär täglich, Fensterreinigung 2× jährlich"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                />
                <SpeechToTextButton
                  value={aiPrompt}
                  onChange={setAiPrompt}
                  label="Auftragsbeschreibung diktieren"
                />
              </div>
              <Button
                type="button"
                disabled={aiSuggest.isPending || aiPrompt.trim().length < 5}
                onClick={() => aiSuggest.mutate()}
              >
                <Sparkles className="size-4" />
                {aiSuggest.isPending ? "Wird kalkuliert…" : "Kalkulation erstellen"}
              </Button>
            </CardContent>
          </Card>

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
                    {raumbuchApplied && raumbuch ? (
                      <p className="text-xs text-sky-700 dark:text-sky-400">
                        Aus Raumbuch übernommen – {raumbuch.roomCount} Räume aus dem Grundriss-Scan
                        (manuell überschreibbar).
                      </p>
                    ) : null}
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
                    {raumbuchApplied && raumbuch ? (
                      <p className="text-xs text-sky-700 dark:text-sky-400">
                        Aus Raumbuch berechnet – Leistungswerte für {raumbuch.matched} Räume
                        {raumbuch.unmatched > 0 ? `, ${raumbuch.unmatched} pauschal` : ""} (manuell
                        überschreibbar).
                      </p>
                    ) : null}
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
                      {[
                        selected.range[0],
                        Math.round((selected.range[0] + selected.range[1]) / 2),
                        selected.range[1],
                      ].map((r) => (
                        <Button
                          key={r}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setHourlyRate(String(r))}
                        >
                          {formatMoney(r)}
                        </Button>
                      ))}
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
                                onChange={(e) =>
                                  updateAttachment(a.path, { rooms: e.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Etagen</Label>
                              <Input
                                inputMode="decimal"
                                value={a.floors}
                                onChange={(e) =>
                                  updateAttachment(a.path, { floors: e.target.value })
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Beschreibung & Reinigungsanforderungen
                            </Label>
                            <Textarea
                              rows={3}
                              value={a.note}
                              onChange={(e) => updateAttachment(a.path, { note: e.target.value })}
                              placeholder="z. B. Bodenbelag Linoleum, 4 Sanitärräume, Glasfassade EG, Zutritt nur werktags 6–8 Uhr"
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={scanningPath === a.path || scanFile.isPending}
                              onClick={() => scanFile.mutate(a)}
                            >
                              <Sparkles className="size-4" />
                              {scanningPath === a.path ? "Wird analysiert …" : "Datei analysieren"}
                            </Button>

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
        </TabsContent>

        <TabsContent value="ausschreibung" className="space-y-6">
          <SectionIntro
            title="Ausschreibung (Angebot & Vergabe)"
            text="Hier entsteht das offizielle Angebot: Ausschreibungstext verfassen, Vergabeunterlagen (z. B. Vergabe Saarland) hinterlegen, Leistungspositionen kalkulieren und den geprüften Preis direkt als Angebot übernehmen. Flächen und Stunden stammen aus dem Grundriss-Tab."
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="size-5" /> Angebots- & Ausschreibungstext
              </CardTitle>
              <CardDescription>
                Offizieller Text für die Vergabestelle. Er wird beim Übernehmen als Einleitungstext
                in das Angebot geschrieben und bleibt dort änderbar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Bezeichnung der Ausschreibung / Vergabe</Label>
                <Input
                  value={proposalTitle}
                  onChange={(e) => setProposalTitle(e.target.value)}
                  placeholder="z. B. Unterhaltsreinigung Verwaltungsgebäude – Vergabe Saarland, Los 2"
                />
              </div>
              <div className="space-y-2">
                <Label>Angebotstext</Label>
                <Textarea
                  rows={7}
                  value={proposalText}
                  onChange={(e) => setProposalText(e.target.value)}
                  placeholder="Leistungsumfang, Qualitätssicherung, Personaleinsatz, Nachweise, Referenzen …"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const line = [
                        selected.label,
                        mode === "area"
                          ? `Fläche ${formatNumber(num(area))} m²`
                          : `${formatNumber(num(hours))} Std. je Einsatz`,
                        `${formatNumber(visitsPerMonth)} Einsätze pro Monat`,
                        `kalkulierter Stundenbedarf ${formatNumber(monthlyHours)} Std./Monat`,
                      ].join(" · ");
                      setProposalText((prev) => (prev.trim() ? `${prev}\n${line}` : line));
                      toast.success("Eckdaten in den Angebotstext übernommen");
                    }}
                  >
                    Eckdaten aus Grundriss einfügen
                  </Button>
                  {floorplanSummary.trim() ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setProposalText((prev) =>
                          prev.trim()
                            ? `${prev}\n${floorplanSummary.trim()}`
                            : floorplanSummary.trim(),
                        );
                        toast.success("Objektbeschreibung übernommen");
                      }}
                    >
                      Objektbeschreibung einfügen
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <Label>Vergabeunterlagen</Label>
                  <p className="text-xs text-muted-foreground">
                    Ausschreibungsunterlagen (PDF, Leistungsverzeichnis, Formblätter) hochladen und
                    mit dieser Kalkulation verknüpfen. Über „Datei analysieren“ werden Positionen
                    automatisch vorgeschlagen.
                  </p>
                </div>
                <FileUploadButton
                  folder="ausschreibung"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  label="Vergabeunterlage hochladen"
                  onUploaded={(path, file) => {
                    void (async () => {
                      const url = await fileUrl(path);
                      setTenderDocs((prev) => [
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
                {tenderDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Noch keine Vergabeunterlagen hinterlegt.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {tenderDocs.map((d) => (
                      <li key={d.path} className="space-y-2 rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-muted-foreground" />
                          <button
                            type="button"
                            className="flex-1 truncate text-left text-sm underline-offset-2 hover:underline"
                            onClick={() =>
                              void openStoredFile(d.path, d.name).catch(() =>
                                toast.error("Datei konnte nicht geöffnet werden."),
                              )
                            }
                          >
                            {d.name}
                          </button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={scanningPath === d.path || scanFile.isPending}
                            onClick={() => scanFile.mutate(d)}
                          >
                            <Sparkles className="size-4" />
                            {scanningPath === d.path ? "Wird analysiert …" : "Datei analysieren"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Entfernen"
                            onClick={() =>
                              setTenderDocs((prev) => prev.filter((x) => x.path !== d.path))
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <Textarea
                          rows={2}
                          value={d.note}
                          onChange={(e) =>
                            setTenderDocs((prev) =>
                              prev.map((x) =>
                                x.path === d.path ? { ...x, note: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder="Notiz zur Unterlage (z. B. Los, Abgabefrist, Eignungsnachweise)"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-5" /> Leistungspositionen
                </CardTitle>
                <CardDescription>
                  Positionen der Ausschreibung bzw. des Angebots – vom Assistenten erzeugt oder
                  manuell ergänzt. Jede Zeile bleibt frei änderbar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={applyCalculation}>
                    <Calculator className="size-4" /> Kalkulation übernehmen
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={exportLv.isPending}
                    onClick={() => exportLv.mutate()}
                  >
                    <FileDown className="size-4" />
                    {exportLv.isPending ? "PDF wird erstellt …" : "LV als PDF exportieren"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAiItems((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}`,
                          description: "",
                          quantity: "1",
                          unit: "Std.",
                          unit_price: "35",
                        },
                      ])
                    }
                  >
                    <Plus className="size-4" /> Position
                  </Button>
                </div>

                {synchronizedLvPositions.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Noch keine Positionen. Beschreiben Sie die Arbeit im KI-Assistenten (Tab
                    „Grundriss") oder fügen Sie eine Position manuell hinzu.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_5rem_6rem_7rem_7rem_2.5rem]">
                      <span>Leistung</span>
                      <span>Menge</span>
                      <span>Einheit</span>
                      <span>Einzelpreis</span>
                      <span className="text-right">Gesamt</span>
                      <span />
                    </div>
                    {aiItems.map((i) => (
                      <div
                        key={i.id}
                        className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem_7rem_7rem_2.5rem] sm:items-center"
                      >
                        <Input
                          value={i.description}
                          placeholder="Leistung"
                          onChange={(e) => patchAiItem(i.id, { description: e.target.value })}
                        />
                        <Input
                          inputMode="decimal"
                          value={i.quantity}
                          onChange={(e) => patchAiItem(i.id, { quantity: e.target.value })}
                        />
                        <Input
                          value={i.unit}
                          onChange={(e) => patchAiItem(i.id, { unit: e.target.value })}
                        />
                        <Input
                          inputMode="decimal"
                          value={i.unit_price}
                          onChange={(e) => patchAiItem(i.id, { unit_price: e.target.value })}
                        />
                        <span className="text-sm sm:text-right">
                          {formatMoney(num(i.quantity) * num(i.unit_price))}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Position entfernen"
                          onClick={() => setAiItems((prev) => prev.filter((x) => x.id !== i.id))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    {balancingPosition && (
                      <div className="grid gap-2 rounded-md border border-dashed bg-muted/40 px-2 py-2 sm:grid-cols-[1fr_5rem_6rem_7rem_7rem_2.5rem] sm:items-center">
                        <span className="text-sm font-medium">{balancingPosition.description}</span>
                        <span className="text-sm">{formatNumber(balancingPosition.quantity)}</span>
                        <span className="text-sm">{balancingPosition.unit}</span>
                        <span className="text-sm">{formatMoney(balancingPosition.unit_price)}</span>
                        <span className="text-sm font-medium sm:text-right">
                          {formatMoney(balancingPosition.quantity * balancingPosition.unit_price)}
                        </span>
                        <span />
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
                      <span>Gesamt netto</span>
                      <span>{formatMoney(aiTotal)}</span>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {synchronizedLvPositions.length} Position(en) – verbindlich an den Endpreis
                      gekoppelt
                    </p>
                  </div>
                )}
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
                  <div className="flex justify-between border-t pt-1 font-medium">
                    <span>Zwischensumme (netto)</span>
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

                <div className="space-y-2 rounded-md border p-3">
                  <Label>Endpreis Grundkalkulation netto (frei anpassbar)</Label>
                  <Input
                    inputMode="decimal"
                    value={finalPrice}
                    onChange={(e) => {
                      setFinalTouched(true);
                      setFinalPrice(e.target.value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Berechneter Vorschlag: {formatMoney(suggested)}. „Kalkulation übernehmen“
                    überträgt diesen Endpreis einschließlich manueller Anpassungen centgenau in die
                    Positionen des Leistungsverzeichnisses.
                  </p>
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

                <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Positionen im Leistungsverzeichnis</span>
                    <span>{synchronizedLvPositions.length}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-medium">
                    <span>Gesamt netto</span>
                    <span>{formatMoney(aiTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>zzgl. 19 % MwSt.</span>
                    <span>{formatMoney(vatAmount)}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold">
                    <span>Gesamt brutto</span>
                    <span>{formatMoney(grossTotal)}</span>
                  </div>
                  <p className="pt-1 text-xs text-muted-foreground">
                    Der Endpreis der Grundkalkulation ist verbindlich. Die Positionen werden bei
                    jeder Änderung automatisch centgenau abgeglichen.
                  </p>
                </div>

                {warnings.length > 0 && (
                  <div className="flex gap-2 rounded-md border border-amber-500/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">Bitte Angaben prüfen</p>
                      {warnings.map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                    </div>
                  </div>
                )}

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
                  disabled={toQuote.isPending || aiTotal <= 0 || !confirmed || warnings.length > 0}
                  onClick={() => toQuote.mutate()}
                >
                  <FileSignature className="size-4" />
                  In Angebot übernehmen
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
