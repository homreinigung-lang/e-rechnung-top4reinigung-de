import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useServerFn } from "@tanstack/react-start";
import { analyzeProject, type ScannedProject } from "@/lib/project-scan.functions";
import { fileUrl, openStoredFile } from "@/lib/storage";
import { FileUploadButton } from "@/components/FileUploadButton";
import { ProjectScanReview, type ReviewResult } from "@/components/ProjectScanReview";
import { LvPositionen } from "@/components/LvPositionen";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate, formatNumber } from "@/lib/format";
import { modeLabel } from "./projekte.index";

export const Route = createFileRoute("/_authenticated/projekte/$id")({
  head: () => ({
    meta: [
      { title: "Projektdetails – Raumbuch & Leistungsverzeichnis" },
      {
        name: "description",
        content:
          "Projektkopf, Raumbuch, Leistungsverzeichnis, Kalkulationsübersicht und Mitarbeiter-Zuweisung.",
      },
      { property: "og:title", content: "Projektdetails" },
      {
        property: "og:description",
        content: "Räume und Leistungspositionen prüfen, korrigieren und Team zuordnen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjektDetail,
});

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

type Room = {
  id: string;
  position: number;
  name: string;
  floor: string;
  usage_type: string;
  area_sqm: number;
  floor_covering: string;
  frequency: string;
  note: string;
  confirmed: boolean;
};

type LvItem = {
  id: string;
  position: number;
  section: string;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  deadline: string | null;
  evidence: string;
  critical: boolean;
  done: boolean;
};

function ProjektDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const runAnalyze = useServerFn(analyzeProject);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<ScannedProject | null>(null);
  const [roomDialog, setRoomDialog] = useState<Room | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmployee, setAssignEmployee] = useState("");
  const [assignRole, setAssignRole] = useState("Reinigungskraft");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["project", id] });
    queryClient.invalidateQueries({ queryKey: ["project_rooms", id] });
    queryClient.invalidateQueries({ queryKey: ["project_lv", id] });
    queryClient.invalidateQueries({ queryKey: ["project_assignments", id] });
  };

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["project_rooms", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_rooms")
        .select("*")
        .eq("project_id", id)
        .order("position");
      if (error) throw error;
      return data as Room[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["project_lv", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_lv_items")
        .select("*")
        .eq("project_id", id)
        .order("position");
      if (error) throw error;
      return data as LvItem[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["project_assignments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select("*")
        .eq("project_id", id);
      if (error) throw error;
      return data;
    },
  });

  // Ist-Stunden und Kosten aus der Zeiterfassung (nur genehmigte/erfasste Arbeitszeiten)
  const { data: timeEntries = [] } = useQuery({
    queryKey: ["project_time_entries", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select(
          "id,hours,work_date,entry_type,approval_status,completed_at,employee_name,start_time,end_time,note",
        )
        .eq("project_id", id);
      if (error) throw error;
      return data;
    },
  });

  const patchProject = useMutation({
    mutationFn: async (values: ProjectUpdate) => {
      const { error } = await supabase.from("projects").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const patchRoom = useMutation({
    mutationFn: async ({ roomId, values }: { roomId: string; values: Partial<Room> }) => {
      const { error } = await supabase.from("project_rooms").update(values).eq("id", roomId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const addRoom = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("project_rooms").insert({
        project_id: id,
        user_id: userId,
        position: rooms.length + 1,
        name: `Raum ${rooms.length + 1}`,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRoom = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase.from("project_rooms").delete().eq("id", roomId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const patchItem = useMutation({
    mutationFn: async ({ itemId, values }: { itemId: string; values: Partial<LvItem> }) => {
      const { error } = await supabase.from("project_lv_items").update(values).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("project_lv_items").insert({
        project_id: id,
        user_id: userId,
        position: items.length + 1,
        title: "Neue Position",
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("project_lv_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("project_assignments").insert({
        project_id: id,
        employee_id: assignEmployee,
        user_id: userId,
        assignment_role: assignRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAssignOpen(false);
      setAssignEmployee("");
      toast.success("Mitarbeiter zugewiesen");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from("project_assignments").delete().eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleUploaded(path: string, file: File) {
    await patchProject.mutateAsync({ source_file_path: path, source_file_name: file.name });
    setAnalyzing(true);
    try {
      const url = await fileUrl(path);
      const result = await runAnalyze({
        data: {
          fileUrl: url,
          mimeType: file.type || "application/pdf",
          mode: project?.mode ?? "floorplan",
        },
      });
      setScanResult(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analyse fehlgeschlagen");
    } finally {
      setAnalyzing(false);
    }
  }

  const applyScan = useMutation({
    mutationFn: async (review: ReviewResult) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      await supabase
        .from("projects")
        .update({
          expected_room_count: Math.max(review.expected_room_count, review.rooms.length),
          executive_summary: review.executive_summary || project?.executive_summary || "",
          analysis_highlights: review.highlights,
          analysis_requirements: review.requirements,
        })
        .eq("id", id);

      if (review.rooms.length > 0) {
        const { error } = await supabase.from("project_rooms").insert(
          review.rooms.map((r, index) => ({
            project_id: id,
            user_id: userId,
            position: rooms.length + index + 1,
            name: r.name,
            floor: r.floor,
            usage_type: r.usage_type,
            area_sqm: r.area_sqm,
            floor_covering: r.floor_covering,
          })),
        );
        if (error) throw error;
      }
      if (review.items.length > 0) {
        const { error } = await supabase.from("project_lv_items").insert(
          review.items.map((it, index) => ({
            project_id: id,
            user_id: userId,
            position: items.length + index + 1,
            section: it.section,
            title: it.title,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            deadline: it.deadline || null,
            evidence: it.evidence,
            critical: it.critical,
          })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setScanResult(null);
      toast.success("Daten übernommen");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!project) return <p className="text-muted-foreground">Projekt wird geladen …</p>;

  const isTender = project.mode === "tender";
  const totalSqm = rooms.reduce((sum, r) => sum + Number(r.area_sqm || 0), 0);
  const confirmedRooms = rooms.filter((r) => r.confirmed).length;
  const expected = Math.max(project.expected_room_count || 0, rooms.length);
  // Chronologie der abgeschlossenen Einsätze (Auswertungen liegen in der Kalkulation)
  const history = timeEntries
    .filter(
      (t) =>
        (t.entry_type ?? "work") === "work" &&
        (t.approval_status ?? "approved") !== "rejected" &&
        Boolean(t.completed_at),
    )
    .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)));

  // Automatisch abgeleitete Eckdaten aus dem Raumbuch (Ergänzung zur KI-Zusammenfassung)
  const coveringTotals = new Map<string, number>();
  const usageTotals = new Map<string, number>();
  for (const r of rooms) {
    const cover = (r.floor_covering || "").trim();
    if (cover)
      coveringTotals.set(cover, (coveringTotals.get(cover) ?? 0) + Number(r.area_sqm || 0));
    const usage = (r.usage_type || "").trim();
    if (usage) usageTotals.set(usage, (usageTotals.get(usage) ?? 0) + Number(r.area_sqm || 0));
  }
  const topList = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const derivedFacts: string[] = [];
  if (totalSqm > 0)
    derivedFacts.push(`Erkannte Fläche: ca. ${formatNumber(totalSqm)} m² (${rooms.length} Räume)`);
  const topUsage = topList(usageTotals);
  if (topUsage.length > 0) {
    derivedFacts.push(
      `Nutzung: ${topUsage.map(([k, v]) => `${k} ${formatNumber(v)} m²`).join(", ")}`,
    );
  }
  const topCover = topList(coveringTotals);
  if (topCover.length > 0) {
    derivedFacts.push(
      `Bodenbelag: ${topCover.map(([k, v]) => `${k} ${formatNumber(v)} m²`).join(", ")}`,
    );
  }
  const aiHighlights = (project.analysis_highlights ?? []) as string[];
  const aiRequirements = (project.analysis_requirements ?? []) as string[];
  const hasAnalysis =
    aiHighlights.length > 0 || aiRequirements.length > 0 || derivedFacts.length > 0;

  const openCritical = items.filter((i) => i.critical && !i.done);

  return (
    <div className="space-y-6">
      <Link
        to="/projekte"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Alle Projekte
      </Link>

      {/* Projekt-Header */}
      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{project.name || "Ohne Namen"}</h1>
            <p className="text-sm text-muted-foreground">{modeLabel(project.mode)}</p>
          </div>
          <div className="flex items-center gap-2">
            <FileUploadButton
              folder="projekte"
              accept="application/pdf,image/*"
              label={isTender ? "Ausschreibung hochladen" : "Grundriss hochladen"}
              onUploaded={(path, file) => void handleUploaded(path, file)}
            />
            {analyzing && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> KI-Analyse läuft …
              </span>
            )}
            {!analyzing && isTender && project.source_file_name && (
              <span className="text-sm text-emerald-700">
                ✓ Datei geladen{items.length > 0 ? ` · ${items.length} Positionen erkannt` : ""}
              </span>
            )}

          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["name", "Projektname"],
            ["customer_name", "Kunde"],
            ["contact_email", "E-Mail"],
            ["contact_phone", "Telefon"],
            ["address_line", "Straße und Hausnummer"],
            ["postal_code", "PLZ"],
            ["city", "Ort"],
          ].map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`h-${key}`}>{label}</Label>
              <Input
                id={`h-${key}`}
                defaultValue={String((project as Record<string, unknown>)[key!] ?? "")}
                onBlur={(e) => patchProject.mutate({ [key!]: e.target.value })}
              />
            </div>
          ))}
        </div>

        {project.source_file_name && (
          <p className="text-sm text-muted-foreground">
            Datei:{" "}
            {project.source_file_path ? (
              <button
                type="button"
                className="underline"
                onClick={() =>
                  void openStoredFile(project.source_file_path, project.source_file_name)
                }
              >
                {project.source_file_name}
              </button>
            ) : (
              project.source_file_name
            )}
          </p>
        )}
      </section>

      {/* KI-Analyse: Eckdaten & Anforderungen */}
      {hasAnalysis && (
        <section className="surface space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Analyse-Ergebnis</h2>
            </div>
            <Button asChild variant="outline">
              <Link
                to="/kalkulation"
                search={{
                  area: Math.round(totalSqm * 100) / 100,
                  objekt: project.name || "",
                  belag: topCover[0]?.[0] ?? "",
                  projekt: project.id,
                }}
              >

                <Calculator className="size-4" /> In Kalkulation übernehmen
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Erkannte Eckdaten</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {[...aiHighlights, ...derivedFacts].map((line, i) => (
                  <li key={`${i}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Kundenanforderungen</h3>
              {aiRequirements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine ausdrücklichen Anforderungen erkannt.
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {aiRequirements.map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Executive Summary */}
      {(isTender || project.executive_summary) && (
        <section className="surface space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Executive Summary</h2>
          </div>
          <Textarea
            rows={4}
            defaultValue={project.executive_summary}
            placeholder="Kritische Punkte und Fristen …"
            onBlur={(e) => patchProject.mutate({ executive_summary: e.target.value })}
          />
          {openCritical.length > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                {openCritical.length} kritische bzw. fristgebundene Punkte sind noch offen:{" "}
                {openCritical
                  .map((i) => i.title)
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Modus: Raumbuch */}
      {!isTender && (
        <section className="surface space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Raumbuch</h2>
              <p className="text-sm text-muted-foreground">
                {rooms.length} von {expected} Räumen erkannt · {confirmedRooms} geprüft
              </p>
            </div>
            <Button variant="outline" onClick={() => addRoom.mutate()}>
              <Plus className="size-4" /> Raum ergänzen
            </Button>
          </div>

          {rooms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Noch keine Räume erfasst. Grundriss hochladen oder Räume manuell ergänzen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Nr.</th>
                    <th className="py-2 pr-3">Raum</th>
                    <th className="py-2 pr-3">Etage</th>
                    <th className="py-2 pr-3">Nutzung</th>
                    <th className="py-2 pr-3 text-right">m²</th>
                    <th className="py-2 pr-3">Bodenbelag</th>
                    <th className="py-2 pr-3">Geprüft</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r, index) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{index + 1}</td>
                      <td className="py-2 pr-3">
                        <button
                          className="font-medium hover:underline"
                          onClick={() => setRoomDialog(r)}
                        >
                          {r.name || "Ohne Bezeichnung"}
                        </button>
                      </td>
                      <td className="py-2 pr-3">{r.floor}</td>
                      <td className="py-2 pr-3">{r.usage_type}</td>
                      <td className="py-2 pr-3 text-right">{formatNumber(Number(r.area_sqm))}</td>
                      <td className="py-2 pr-3">{r.floor_covering}</td>
                      <td className="py-2 pr-3">
                        <Checkbox
                          checked={r.confirmed}
                          onCheckedChange={(v) =>
                            patchRoom.mutate({ roomId: r.id, values: { confirmed: Boolean(v) } })
                          }
                        />
                      </td>
                      <td className="py-2 text-right">
                        <ConfirmDeleteButton
                          title="Raum wirklich löschen?"
                          description={`Der Raum „${r.name || "ohne Namen"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                          onConfirm={() => removeRoom.mutate(r.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Modus: Leistungsverzeichnis */}
      {isTender && (
        <section className="surface space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">Leistungsverzeichnis</h2>
            <p className="text-sm text-muted-foreground">
              Positionen prüfen, fehlende Preise ergänzen – Gesamtpreise werden automatisch
              berechnet.
            </p>
          </div>
          <LvPositionen
            items={items}
            onPatch={(itemId, values) => patchItem.mutate({ itemId, values })}
            onAdd={() => addItem.mutate()}
            onRemove={(itemId) => removeItem.mutate(itemId)}
          />
        </section>
      )}


      {/* Objekt-Mappe: operative Vertrags- und Einsatzdaten */}
      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Objekt-Mappe</h2>
          <p className="text-sm text-muted-foreground">
            Vertragsdaten, Turnus und Vereinbarungen zu diesem Objekt. Preise und Auswertungen
            werden ausschließlich im Bereich „Kalkulation" gepflegt.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="contract-start">Vertragsbeginn</Label>
            <Input
              id="contract-start"
              type="date"
              defaultValue={project.contract_start ?? ""}
              onBlur={(e) => patchProject.mutate({ contract_start: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract-end">Vertragsende</Label>
            <Input
              id="contract-end"
              type="date"
              defaultValue={project.contract_end ?? ""}
              onBlur={(e) => patchProject.mutate({ contract_end: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label>Reinigungsturnus</Label>
            <Select
              value={project.cleaning_frequency || ""}
              onValueChange={(v) => patchProject.mutate({ cleaning_frequency: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Turnus wählen" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Täglich",
                  "Mehrmals wöchentlich",
                  "Wöchentlich",
                  "14-tägig",
                  "Monatlich",
                  "Nach Bedarf",
                ].map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md bg-muted p-3">
            <div className="text-xs text-muted-foreground">Vertragslaufzeit</div>
            <div className="text-lg font-semibold">
              {project.contract_start ? formatDate(project.contract_start) : "offen"} –{" "}
              {project.contract_end ? formatDate(project.contract_end) : "unbefristet"}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="agreement">Vereinbarung / Absprachen</Label>
          <Textarea
            id="agreement"
            rows={4}
            defaultValue={project.agreement_terms ?? ""}
            placeholder="z. B. Zutritt über Hausmeister, Schlüsselübergabe, Sonderleistungen, Ansprechpartner …"
            onBlur={(e) => patchProject.mutate({ agreement_terms: e.target.value })}
          />
        </div>
      </section>

      {/* Einsatzhistorie: von Mitarbeitenden abgeschlossene Einsätze */}
      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Einsatzhistorie</h2>
          <p className="text-sm text-muted-foreground">
            Chronologie der von Mitarbeitenden als erledigt bestätigten Einsätze in diesem Objekt.
          </p>
        </div>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine abgeschlossenen Einsätze erfasst.
          </p>
        ) : (
          <ul className="divide-y">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                <span className="w-28 shrink-0 font-medium">{formatDate(h.work_date)}</span>
                <span className="w-40 shrink-0">{h.employee_name || "Mitarbeitende/r"}</span>
                <span className="w-32 shrink-0 text-muted-foreground">
                  {h.start_time || h.end_time
                    ? `${(h.start_time ?? "").slice(0, 5)}–${(h.end_time ?? "").slice(0, 5)}`
                    : "—"}
                </span>
                <span className="w-24 shrink-0 text-muted-foreground">
                  {formatNumber(Number(h.hours || 0))} Std.
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">{h.note}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Team */}
      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Eingesetzte Mitarbeiter</h2>
          </div>
          <Button variant="outline" onClick={() => setAssignOpen(true)}>
            <Plus className="size-4" /> Mitarbeiter zuweisen
          </Button>
        </div>
        {assignments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Noch niemand zugewiesen.</p>
        ) : (
          <ul className="divide-y">
            {assignments.map((a) => {
              const emp = employees.find((e) => e.id === a.employee_id);
              return (
                <li key={a.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{emp?.name ?? "Unbekannt"}</div>
                    <div className="text-sm text-muted-foreground">
                      {a.assignment_role || emp?.role || "—"}
                    </div>
                  </div>
                  <ConfirmDeleteButton
                    title="Zuweisung wirklich entfernen?"
                    description={`Die Zuweisung von „${emp?.name ?? "Unbekannt"}" zu diesem Projekt wird entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
                    confirmLabel="Entfernen"
                    onConfirm={() => unassign.mutate(a.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Raum-Detail */}
      <Dialog open={Boolean(roomDialog)} onOpenChange={(o) => !o && setRoomDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raum bearbeiten</DialogTitle>
          </DialogHeader>
          {roomDialog && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="r-name">Bezeichnung</Label>
                <Input
                  id="r-name"
                  value={roomDialog.name}
                  onChange={(e) => setRoomDialog({ ...roomDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-floor">Etage</Label>
                <Input
                  id="r-floor"
                  value={roomDialog.floor}
                  onChange={(e) => setRoomDialog({ ...roomDialog, floor: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-usage">Nutzung</Label>
                <Input
                  id="r-usage"
                  value={roomDialog.usage_type}
                  onChange={(e) => setRoomDialog({ ...roomDialog, usage_type: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-area">Fläche (m²)</Label>
                <Input
                  id="r-area"
                  type="number"
                  step="0.01"
                  value={roomDialog.area_sqm}
                  onChange={(e) =>
                    setRoomDialog({ ...roomDialog, area_sqm: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-covering">Bodenbelag / Oberfläche</Label>
                <Input
                  id="r-covering"
                  value={roomDialog.floor_covering ?? ""}
                  placeholder="Teppich, Fliesen, PVC …"
                  onChange={(e) => setRoomDialog({ ...roomDialog, floor_covering: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-freq">Turnus</Label>
                <Input
                  id="r-freq"
                  value={roomDialog.frequency}
                  placeholder="z. B. 2x wöchentlich"
                  onChange={(e) => setRoomDialog({ ...roomDialog, frequency: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="r-note">Bemerkung</Label>
                <Textarea
                  id="r-note"
                  value={roomDialog.note}
                  onChange={(e) => setRoomDialog({ ...roomDialog, note: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                if (!roomDialog) return;
                patchRoom.mutate({
                  roomId: roomDialog.id,
                  values: {
                    name: roomDialog.name,
                    floor: roomDialog.floor,
                    usage_type: roomDialog.usage_type,
                    area_sqm: roomDialog.area_sqm,
                    floor_covering: roomDialog.floor_covering ?? "",
                    frequency: roomDialog.frequency,
                    note: roomDialog.note,
                    confirmed: true,
                  },
                });
                setRoomDialog(null);
              }}
            >
              Speichern & als geprüft markieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zuweisung */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mitarbeiter zuweisen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mitarbeiter</Label>
              <Select value={assignEmployee} onValueChange={setAssignEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Funktion im Projekt</Label>
              <Select value={assignRole} onValueChange={setAssignRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Reinigungskraft", "Vorarbeiter", "Objektleiter", "Springer"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => assign.mutate()} disabled={!assignEmployee || assign.isPending}>
              Zuweisen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectScanReview
        open={Boolean(scanResult)}
        mode={isTender ? "tender" : "floorplan"}
        result={scanResult}
        saving={applyScan.isPending}
        onCancel={() => setScanResult(null)}
        onConfirm={(review) => applyScan.mutate(review)}
      />
    </div>
  );
}
