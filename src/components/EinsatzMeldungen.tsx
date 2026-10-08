import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FileUploadButton } from "@/components/FileUploadButton";
import { LoadError } from "@/components/LoadError";
import { useFileUrl } from "@/hooks/useFileUrl";
import { FILES_BUCKET, openStoredFile } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { AlertTriangle, Camera, X } from "lucide-react";

const db = supabase as SupabaseClient;
type Status = "offen" | "in_bearbeitung" | "erledigt";
const labels: Record<Status, string> = {
  offen: "Offen",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
};
type Report = {
  id: string;
  employee_id: string;
  project_id: string;
  assignment_id: string | null;
  work_date: string;
  kind: string;
  material_name: string;
  quantity: number | null;
  unit: string;
  description: string;
  photo_paths: string[];
  status: Status;
  admin_reply: string;
  created_at: string;
  updated_at: string;
};
export type ReportTask = { assignmentId: string; projectId: string; date: string; name: string };

export function EinsatzMeldungen({
  employee,
  task,
}: {
  employee?: { id: string; user_id: string; name: string };
  task?: ReportTask;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("offen");
  const {
    data: reports = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: [
      "task_reports",
      employee?.id ?? "admin",
      task?.assignmentId ?? "all",
      task?.date ?? "",
    ],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Report[]> => {
      let q = db
        .from("employee_task_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (employee) q = q.eq("employee_id", employee.id);
      if (task) q = q.eq("assignment_id", task.assignmentId).eq("work_date", task.date);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: names, error: namesError } = useQuery({
    queryKey: ["task_report_names", employee?.id ?? "admin"],
    queryFn: async () => {
      const [emps, projects] = await Promise.all([
        employee
          ? Promise.resolve({ data: [], error: null })
          : supabase.from("employees").select("id,name"),
        supabase.from("projects").select("id,name"),
      ]);
      if (emps.error) throw emps.error;
      if (projects.error) throw projects.error;
      return { employees: emps.data, projects: projects.data };
    },
  });
  const visible = employee
    ? reports
    : reports.filter(
        (r) =>
          filter === "alle" || (filter === "offen" ? r.status !== "erledigt" : r.status === filter),
      );
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="size-5" />
          {task
            ? "Meldungen zum Einsatz"
            : employee
              ? "Meine Meldungen"
              : "Material- und Problemmeldungen"}
        </h2>
        {employee && task ? (
          <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
            Material fehlt / Problem melden
          </Button>
        ) : null}
        {!employee ? (
          <select
            aria-label="Meldungen filtern"
            className="rounded-md border bg-background p-2 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="offen">Offen / In Bearbeitung</option>
            <option value="erledigt">Erledigt</option>
            <option value="alle">Alle Meldungen</option>
          </select>
        ) : null}
      </div>
      <LoadError error={namesError} title="Namen konnten nicht geladen werden" />
      <LoadError error={error} title="Meldungen konnten nicht geladen werden" />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Meldungen werden geladen …</p>
      ) : !error && visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Meldungen in dieser Ansicht.</p>
      ) : null}
      {visible.map((r) => (
        <ReportCard
          key={`${r.id}-${r.updated_at}`}
          report={r}
          admin={!employee}
          heading={
            employee
              ? (names?.projects.find((p) => p.id === r.project_id)?.name ?? "Objekt")
              : `${names?.employees.find((e) => e.id === r.employee_id)?.name ?? "Mitarbeiter"} · ${names?.projects.find((p) => p.id === r.project_id)?.name ?? "Objekt"}`
          }
        />
      ))}
      {employee && task ? (
        <ReportForm
          key={`${task.assignmentId}-${task.date}`}
          open={open}
          onClose={() => setOpen(false)}
          employee={employee}
          task={task}
          onSaved={() => void qc.invalidateQueries({ queryKey: ["task_reports"] })}
        />
      ) : null}
    </section>
  );
}

function ReportPhoto({ path }: { path: string }) {
  const url = useFileUrl(path);
  return (
    <button
      type="button"
      aria-label="Meldungsfoto öffnen"
      onClick={() =>
        void openStoredFile(path).catch(() => toast.error("Foto konnte nicht geöffnet werden."))
      }
    >
      {url ? (
        <img src={url} alt="Foto zur Meldung" className="size-20 rounded-md border object-cover" />
      ) : (
        <span className="flex size-20 items-center justify-center rounded-md border">
          <Camera className="size-5" />
        </span>
      )}
    </button>
  );
}

function ReportCard({
  report: r,
  admin,
  heading,
}: {
  report: Report;
  admin: boolean;
  heading?: string | undefined;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState(r.admin_reply);
  const [status, setStatus] = useState<Status>(r.status);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await db
        .from("employee_task_reports")
        .update({ status, admin_reply: reply.trim() })
        .eq("id", r.id)
        .eq("updated_at", r.updated_at)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "Meldung wurde inzwischen geändert oder konnte nicht aktualisiert werden. Bitte neu laden.",
        );
    },
    onSuccess: () => {
      toast.success("Meldung aktualisiert");
      void qc.invalidateQueries({ queryKey: ["task_reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <article className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-medium">
            {r.kind === "material" ? "Material fehlt" : "Problem am Einsatzort"}
          </p>
          {heading ? <p className="text-sm text-muted-foreground">{heading}</p> : null}
          <p className="text-xs text-muted-foreground">
            Einsatz: {formatDate(r.work_date)} · Gemeldet: {formatDate(r.created_at)}
          </p>
        </div>
        <span className="h-fit rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {labels[r.status]}
        </span>
      </div>
      {r.material_name ? (
        <p className="text-sm font-medium">
          {r.material_name}
          {r.quantity ? ` · ${r.quantity} ${r.unit}` : ""}
        </p>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-sm">{r.description}</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/nachrichten" search={{ mitarbeiter: r.employee_id, meldung: r.id }}>
          Im Chat besprechen
        </Link>
      </Button>
      <div className="flex flex-wrap gap-2">
        {r.photo_paths.map((path) => (
          <ReportPhoto key={path} path={path} />
        ))}
      </div>
      {r.admin_reply ? (
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">Antwort der Verwaltung</p>
          <p className="whitespace-pre-wrap break-words">{r.admin_reply}</p>
        </div>
      ) : null}
      {admin ? (
        <div className="space-y-2 border-t pt-3">
          <Label>Bearbeitungsstatus</Label>
          <select
            aria-label="Bearbeitungsstatus"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="block w-full rounded-md border bg-background p-2 text-sm"
          >
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Label>Antwort an den Mitarbeiter</Label>
          <Textarea
            aria-label="Antwort an den Mitarbeiter"
            maxLength={2000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Antwort / Status speichern
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function ReportForm({
  open,
  onClose,
  employee,
  task,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  employee: { id: string; user_id: string; name: string };
  task: ReportTask;
  onSaved: () => void;
}) {
  const [id, setId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState("material");
  const [material, setMaterial] = useState("");
  const [materialChoice, setMaterialChoice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("Stk.");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const {
    data: materials = [],
    isLoading: materialsLoading,
    error: materialsError,
    refetch: reloadMaterials,
  } = useQuery({
    queryKey: ["report_materials", task.projectId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from("project_materials")
        .select("materials(id,name,unit)")
        .eq("project_id", task.projectId);
      if (error) throw error;
      return (data ?? []).flatMap((row) =>
        row.materials
          ? [row.materials as unknown as { id: string; name: string; unit: string }]
          : [],
      );
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const details =
        description.trim() ||
        (kind === "material" && material.trim() ? `Material fehlt: ${material.trim()}` : "");
      if (!details) throw new Error("Bitte die Meldung kurz beschreiben.");
      if (kind === "material" && !material.trim())
        throw new Error("Bitte das fehlende Material angeben.");
      const amount = quantity.trim() ? Number(quantity.replace(",", ".")) : null;
      if (kind === "material" && amount !== null && (!Number.isFinite(amount) || amount <= 0))
        throw new Error("Bitte eine gültige Menge größer als null angeben.");
      const { error } = await db.from("employee_task_reports").insert({
        id,
        user_id: employee.user_id,
        employee_id: employee.id,
        project_id: task.projectId,
        assignment_id: task.assignmentId,
        work_date: task.date,
        kind,
        material_name: kind === "material" ? material.trim() : "",
        quantity: kind === "material" ? amount : null,
        unit: kind === "material" ? unit.trim() : "",
        description: details,
        photo_paths: photos,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meldung an die Verwaltung übermittelt");
      onSaved();
      onClose();
      setId(crypto.randomUUID());
      setPhotos([]);
      setDescription("");
      setMaterial("");
      setMaterialChoice("");
      setUnit("Stk.");
      setQuantity("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  async function removePhoto(path: string) {
    const { error } = await supabase.storage.from(FILES_BUCKET).remove([path]);
    if (error) {
      toast.error("Foto konnte nicht entfernt werden.");
      return;
    }
    setPhotos((p) => p.filter((x) => x !== path));
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !save.isPending && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Material fehlt / Problem melden</DialogTitle>
          <DialogDescription>
            {task.name} · {formatDate(task.date)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label htmlFor="report-kind">Art der Meldung</Label>
          <select
            id="report-kind"
            className="w-full rounded-md border bg-background p-2"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="material">Material fehlt</option>
            <option value="problem">Problem / Gerätefehler</option>
          </select>
          {kind === "material" ? (
            <>
              <Label htmlFor="report-material">Material</Label>
              <LoadError
                error={materialsError}
                title="Materialliste konnte nicht geladen werden"
                onRetry={() => void reloadMaterials()}
              />
              <select
                id="report-material"
                className="min-h-11 w-full rounded-md border bg-background p-2 text-sm"
                value={materialChoice}
                disabled={materialsLoading}
                onChange={(e) => {
                  const choice = e.target.value;
                  setMaterialChoice(choice);
                  const found = materials.find((m) => m.id === choice);
                  setMaterial(found?.name ?? "");
                  setUnit(found?.unit || "Stk.");
                }}
              >
                <option value="">
                  {materialsLoading
                    ? "Materialien werden geladen …"
                    : "Fehlendes Material auswählen …"}
                </option>
                {[...materials]
                  .sort((a, b) => a.name.localeCompare(b.name, "de"))
                  .map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name} · {m.unit}
                    </option>
                  ))}
                <option value="other">Anderes Material / nicht in der Liste</option>
              </select>
              {!materialsLoading && !materialsError && materials.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Für dieses Objekt sind noch keine Materialien hinterlegt. Wählen Sie „Anderes
                  Material“ und geben Sie den Namen ein. Die Verwaltung kann die Objektmaterialien
                  ergänzen.
                </p>
              )}
              {materialChoice === "other" && (
                <div className="space-y-2">
                  <Label htmlFor="report-material-other">Materialname</Label>
                  <Input
                    id="report-material-other"
                    value={material}
                    maxLength={180}
                    placeholder="z. B. Müllbeutel, Bodenreiniger"
                    onChange={(e) => setMaterial(e.target.value)}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="report-quantity">Benötigte Menge (optional)</Label>
                  <Input
                    id="report-quantity"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="report-unit">Einheit</Label>
                  <Input
                    id="report-unit"
                    maxLength={30}
                    readOnly={materialChoice !== "other"}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : null}
          <Label htmlFor="report-description">
            {kind === "material" ? "Zusätzliche Angaben (optional)" : "Beschreibung"}
          </Label>
          <Textarea
            id="report-description"
            maxLength={2000}
            placeholder="Was fehlt oder was ist passiert?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            {photos.map((path) => (
              <div key={path} className="relative">
                <ReportPhoto path={path} />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -right-2 -top-2 size-6"
                  aria-label="Meldungsfoto entfernen"
                  disabled={save.isPending}
                  onClick={() => void removePhoto(path)}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </div>
          <FileUploadButton
            folder={`einsatzmeldungen/${id}`}
            accept="image/jpeg,image/png,image/webp"
            label="Foto hinzufügen (max. 3)"
            disabled={photos.length >= 3 || save.isPending}
            onBusyChange={setBusy}
            validateFile={(file) => {
              if (
                !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
                file.size > 10 * 1024 * 1024
              )
                throw new Error("Bitte JPG, PNG oder WebP bis 10 MB auswählen.");
            }}
            onUploaded={(path) => setPhotos((p) => [...p, path])}
          />
          <Button
            className="w-full min-h-11"
            disabled={
              busy ||
              save.isPending ||
              (kind === "problem" && !description.trim()) ||
              (kind === "material" && !material.trim())
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Wird gesendet …" : "Meldung senden"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
