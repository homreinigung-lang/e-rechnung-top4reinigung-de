import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { analyzeProject, type ScannedProject } from "@/lib/project-scan.functions";
import { ProjectScanReview, type ReviewResult } from "@/components/ProjectScanReview";
import { fileUrl, uploadUserFile } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, FolderKanban, Loader2, Plus, Upload, X } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projekte/")({
  head: () => ({
    meta: [
      { title: "Projekte – Raumbuch & Ausschreibungen" },
      {
        name: "description",
        content:
          "Projekte mit Grundriss-Raumbuch oder Ausschreibungs-Leistungsverzeichnis verwalten und Mitarbeiter zuweisen.",
      },
      { property: "og:title", content: "Projektverwaltung" },
      {
        property: "og:description",
        content: "Raumbuch, Leistungsverzeichnis und Personaleinsatz in einer Übersicht.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjekteIndex,
});

export const MODES = [
  { value: "floorplan", label: "Grundriss-Analyse (Raumbuch)" },
  { value: "tender", label: "Ausschreibungs-Analyse (Leistungsverzeichnis)" },
] as const;

export function modeLabel(value: string | null | undefined) {
  return MODES.find((m) => m.value === value)?.label ?? MODES[0].label;
}

function ProjekteIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runAnalyze = useServerFn(analyzeProject);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<string>("floorplan");
  const [customerId, setCustomerId] = useState<string>("none");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState("");
  const [scanResult, setScanResult] = useState<ScannedProject | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const customer = customers.find((c) => c.id === customerId);
      setStep("Projekt wird angelegt …");
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: userId,
          name: name.trim(),
          mode,
          customer_id: customer?.id ?? null,
          customer_name: customer ? customer.company || customer.name : "",
          contact_email: customer?.email ?? "",
          contact_phone: customer?.phone ?? "",
          address_line: customer?.address_line ?? "",
          postal_code: customer?.postal_code ?? "",
          city: customer?.city ?? "",
        })
        .select("id")
        .single();
      if (error) throw error;
      const projectId = data.id as string;

      let scan: ScannedProject | null = null;

      if (file) {
        setStep("Datei wird hochgeladen …");
        const path = await uploadUserFile(file, "projekte");
        await supabase
          .from("projects")
          .update({ source_file_path: path, source_file_name: file.name })
          .eq("id", projectId);

        setStep(
          mode === "tender" ? "Ausschreibung wird analysiert …" : "Grundriss wird analysiert …",
        );
        try {
          const url = await fileUrl(path);
          scan = await runAnalyze({
            data: { fileUrl: url, mimeType: file.type || "application/pdf", mode },
          });
          if (!name.trim() && scan.project_name) {
            await supabase.from("projects").update({ name: scan.project_name }).eq("id", projectId);
          }
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Analyse fehlgeschlagen – Datei wurde gespeichert.",
          );
        }
      }
      return { projectId, scan };
    },
    onSuccess: ({ projectId, scan }) => {
      setStep("");
      setOpen(false);
      setName("");
      setCustomerId("none");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (scan) {
        setPendingId(projectId);
        setScanResult(scan);
        return;
      }
      navigate({ to: "/projekte/$id", params: { id: projectId } });
    },
    onError: (e: Error) => {
      setStep("");
      toast.error(e.message);
    },
  });

  const applyScan = useMutation({
    mutationFn: async (review: ReviewResult) => {
      const projectId = pendingId;
      if (!projectId) throw new Error("Kein Projekt");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      await supabase
        .from("projects")
        .update({
          expected_room_count: review.expected_room_count,
          executive_summary: review.executive_summary,
        })
        .eq("id", projectId);

      if (review.rooms.length > 0) {
        const { error } = await supabase.from("project_rooms").insert(
          review.rooms.map((r, index) => ({
            project_id: projectId,
            user_id: userId,
            position: index + 1,
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
            project_id: projectId,
            user_id: userId,
            position: index + 1,
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
      return projectId;
    },
    onSuccess: (projectId) => {
      setScanResult(null);
      setPendingId(null);
      toast.success("Daten übernommen");
      navigate({ to: "/projekte/$id", params: { id: projectId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function skipScan() {
    const projectId = pendingId;
    setScanResult(null);
    setPendingId(null);
    if (projectId) navigate({ to: "/projekte/$id", params: { id: projectId } });
  }

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projekt gelöscht");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Projekte</h1>
          <p className="mt-1 text-muted-foreground">
            Grundrisse als Raumbuch oder Ausschreibungen als Leistungsverzeichnis strukturieren.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Neues Projekt
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neues Projekt</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="p-name">Projektname</Label>
                <Input
                  id="p-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Bürogebäude Saarbrücken"
                />
              </div>
              <div className="space-y-2">
                <Label>Modus</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kunde (optional)</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kunde wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Kunde</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {mode === "tender" ? "Ausschreibung (PDF)" : "Grundriss (PDF oder Foto)"}
                </Label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) setFile(dropped);
                  }}
                  onClick={() => inputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${
                    dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                  }`}
                >
                  {file ? (
                    <>
                      <FileText className="size-5 text-muted-foreground" />
                      <span className="font-medium">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                      >
                        <X className="size-4" /> Entfernen
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="size-5 text-muted-foreground" />
                      <span>Datei hierher ziehen oder klicken zum Auswählen</span>
                      <span className="text-xs text-muted-foreground">
                        PDF, JPG oder PNG – die Analyse startet automatisch nach dem Anlegen.
                      </span>
                    </>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) setFile(selected);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <DialogFooter className="items-center gap-3 sm:justify-between">
              {step ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> {step}
                </span>
              ) : (
                <span />
              )}
              <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
                Projekt anlegen{file ? " & analysieren" : ""}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface overflow-hidden">
        {projects.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine Projekte angelegt.
          </p>
        ) : (
          <ul className="divide-y">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <FolderKanban className="size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/projekte/$id"
                    params={{ id: p.id }}
                    className="font-medium hover:underline"
                  >
                    {p.name || "Ohne Namen"}
                  </Link>
                  <div className="truncate text-sm text-muted-foreground">
                    {[modeLabel(p.mode), p.customer_name, p.city].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(p.created_at.slice(0, 10))}
                </span>
                <ConfirmDeleteButton
                  title="Projekt wirklich löschen?"
                  description={`Das Projekt „${p.name || "Ohne Namen"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                  onConfirm={() => remove.mutate(p.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProjectScanReview
        open={Boolean(scanResult)}
        mode={mode === "tender" ? "tender" : "floorplan"}
        result={scanResult}
        saving={applyScan.isPending}
        onCancel={skipScan}
        onConfirm={(review) => applyScan.mutate(review)}
      />
    </div>
  );
}
