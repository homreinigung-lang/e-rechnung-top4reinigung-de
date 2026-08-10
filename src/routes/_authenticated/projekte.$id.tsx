import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useServerFn } from "@tanstack/react-start";
import { analyzeProject, type ScannedProject } from "@/lib/project-scan.functions";
import { fileUrl } from "@/lib/storage";
import { FileUploadButton } from "@/components/FileUploadButton";
import { ProjectScanReview, type ReviewResult } from "@/components/ProjectScanReview";
import { useFileUrl } from "@/hooks/useFileUrl";
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
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
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

  const planUrl = useFileUrl(project?.source_file_path);

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
      const { error } = await supabase
        .from("project_assignments")
        .delete()
        .eq("id", assignmentId);
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
  const rate = Number(project.hourly_rate || 0);
  const perf = Number(project.sqm_per_hour || 0);
  const hours = perf > 0 ? totalSqm / perf : 0;
  const lvTotal = items.reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
  const openCritical = items.filter((i) => i.critical && !i.done);

  return (
    <div className="space-y-6">
      <Link to="/projekte" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
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
            Datei: {planUrl ? (
              <a href={planUrl} target="_blank" rel="noreferrer" className="underline">
                {project.source_file_name}
              </a>
            ) : (
              project.source_file_name
            )}
          </p>
        )}
      </section>

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
                {openCritical.map((i) => i.title).filter(Boolean).join(", ")}
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
                      <td className="py-2 pr-3">
                        <Checkbox
                          checked={r.confirmed}
                          onCheckedChange={(v) =>
                            patchRoom.mutate({ roomId: r.id, values: { confirmed: Boolean(v) } })
                          }
                        />
                      </td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => removeRoom.mutate(r.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Leistungsverzeichnis</h2>
              <p className="text-sm text-muted-foreground">
                {items.filter((i) => i.done).length} von {items.length} Punkten erledigt
              </p>
            </div>
            <Button variant="outline" onClick={() => addItem.mutate()}>
              <Plus className="size-4" /> Position ergänzen
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Noch keine Positionen. Ausschreibung hochladen oder Positionen manuell ergänzen.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-start gap-3 py-3">
                  <Checkbox
                    className="mt-2"
                    checked={it.done}
                    onCheckedChange={(v) =>
                      patchItem.mutate({ itemId: it.id, values: { done: Boolean(v) } })
                    }
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        defaultValue={it.section}
                        placeholder="Leistungsbereich"
                        onBlur={(e) =>
                          patchItem.mutate({ itemId: it.id, values: { section: e.target.value } })
                        }
                      />
                      <Input
                        defaultValue={it.title}
                        placeholder="Position"
                        onBlur={(e) =>
                          patchItem.mutate({ itemId: it.id, values: { title: e.target.value } })
                        }
                      />
                    </div>
                    <Textarea
                      rows={2}
                      defaultValue={it.description}
                      placeholder="Beschreibung"
                      onBlur={(e) =>
                        patchItem.mutate({ itemId: it.id, values: { description: e.target.value } })
                      }
                    />
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Input
                        type="number"
                        defaultValue={it.quantity}
                        placeholder="Menge"
                        onBlur={(e) =>
                          patchItem.mutate({
                            itemId: it.id,
                            values: { quantity: Number(e.target.value) || 0 },
                          })
                        }
                      />
                      <Input
                        defaultValue={it.unit}
                        placeholder="Einheit"
                        onBlur={(e) =>
                          patchItem.mutate({ itemId: it.id, values: { unit: e.target.value } })
                        }
                      />
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={it.unit_price}
                        placeholder="Einzelpreis netto"
                        onBlur={(e) =>
                          patchItem.mutate({
                            itemId: it.id,
                            values: { unit_price: Number(e.target.value) || 0 },
                          })
                        }
                      />
                      <Input
                        type="date"
                        defaultValue={it.deadline ?? ""}
                        onBlur={(e) =>
                          patchItem.mutate({
                            itemId: it.id,
                            values: { deadline: e.target.value || null },
                          })
                        }
                      />
                    </div>
                    <Input
                      defaultValue={it.evidence}
                      placeholder="Geforderter Nachweis"
                      onBlur={(e) =>
                        patchItem.mutate({ itemId: it.id, values: { evidence: e.target.value } })
                      }
                    />
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={it.critical}
                        onCheckedChange={(v) =>
                          patchItem.mutate({ itemId: it.id, values: { critical: Boolean(v) } })
                        }
                      />
                      Kritischer Punkt / Frist
                      {it.deadline && <span> – fällig am {formatDate(it.deadline)}</span>}
                    </label>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeItem.mutate(it.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Integrierte Kalkulationsübersicht */}
      <section className="surface space-y-4 p-5">
        <h2 className="text-lg font-semibold">Kalkulationsübersicht</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="rate">Stundensatz netto (€)</Label>
            <Input
              id="rate"
              type="number"
              step="0.01"
              defaultValue={rate}
              onBlur={(e) => patchProject.mutate({ hourly_rate: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="perf">Leistung (m² pro Stunde)</Label>
            <Input
              id="perf"
              type="number"
              step="1"
              defaultValue={perf}
              onBlur={(e) => patchProject.mutate({ sqm_per_hour: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="rounded-md bg-muted p-3">
            <div className="text-xs text-muted-foreground">Gesamtfläche</div>
            <div className="text-lg font-semibold">{formatNumber(totalSqm)} m²</div>
          </div>
          <div className="rounded-md bg-muted p-3">
            <div className="text-xs text-muted-foreground">Zeitbedarf</div>
            <div className="text-lg font-semibold">{formatNumber(hours)} Std.</div>
          </div>
          <div className="rounded-md bg-muted p-3">
            <div className="text-xs text-muted-foreground">Kosten aus Fläche</div>
            <div className="text-lg font-semibold">{formatMoney(hours * rate)}</div>
          </div>
          <div className="rounded-md bg-muted p-3">
            <div className="text-xs text-muted-foreground">Summe Leistungsverzeichnis</div>
            <div className="text-lg font-semibold">{formatMoney(lvTotal)}</div>
          </div>
          <div className="rounded-md bg-secondary p-3 text-secondary-foreground">
            <div className="text-xs opacity-80">Kalkulationsbasis netto</div>
            <div className="text-lg font-semibold">{formatMoney(hours * rate + lvTotal)}</div>
          </div>
          <div className="flex items-end">
            <Button variant="outline" asChild>
              <Link to="/kalkulation">Zur Angebotskalkulation</Link>
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Hinweis: Diese Übersicht dient der Vorbereitung. Angebote und Rechnungen werden
          unverändert im bestehenden Belegbereich erstellt.
        </p>
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
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch niemand zugewiesen.
          </p>
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
                  <Button variant="ghost" size="icon" onClick={() => unassign.mutate(a.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
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
    </div>
  );
}
