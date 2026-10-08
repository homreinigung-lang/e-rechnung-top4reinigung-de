import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoadError } from "@/components/LoadError";
import { qmFeedbackLabels, useQmLatestFeedback } from "@/lib/qm";
import { formatDate } from "@/lib/format";
import { ClipboardCheck, Camera, X } from "lucide-react";

const db = supabase as SupabaseClient;
const bucket = "qm-dateien";
type Task = {
  case_id: string;
  user_id: string;
  employee_id: string;
  title: string;
  instruction: string;
  project_name: string;
  priority: string;
  due_date: string | null;
  status: string;
};
type Feedback = {
  id: string;
  case_id: string;
  employee_id: string;
  kind: string;
  message: string;
  photo_paths: string[];
  created_at: string;
};

async function openPhoto(path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data) {
    toast.error("Foto konnte nicht geöffnet werden.");
    return;
  }
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}

export function QmFeedbackList({
  caseId,
  employeeId,
  onComplete,
  currentEmployeeId,
  employeeNames,
}: {
  caseId: string;
  employeeId?: string;
  currentEmployeeId?: string;
  employeeNames?: Record<string, string>;
  onComplete?: (message: string) => void;
}) {
  const {
    data: rows = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: ["qm_feedback", caseId, employeeId ?? "owner"],
    refetchInterval: 15_000,
    queryFn: async (): Promise<Feedback[]> => {
      let query = db
        .from("qm_employee_feedback")
        .select("id,case_id,employee_id,kind,message,photo_paths,created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (employeeId) query = query.eq("employee_id", employeeId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-3">
      <LoadError error={error} title="Rückmeldungen konnten nicht geladen werden" />
      {isLoading ? (
        <p>Rückmeldungen werden geladen …</p>
      ) : !error && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rückmeldung.</p>
      ) : null}
      {rows.map((row) => (
        <article key={row.id} className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">
            {qmFeedbackLabels[row.kind]} · {formatDate(row.created_at)}
          </p>
          {employeeNames && (
            <p className="text-xs text-muted-foreground">
              {employeeNames[row.employee_id] ?? "Früherer Mitarbeiter"}
              {row.employee_id !== currentEmployeeId ? " · Frühere Zuordnung" : ""}
            </p>
          )}
          <p className="whitespace-pre-wrap break-words text-sm">{row.message}</p>
          <div className="flex flex-wrap gap-2">
            {row.photo_paths.map((path, i) => (
              <Button key={path} size="sm" variant="outline" onClick={() => void openPhoto(path)}>
                Foto {i + 1}
              </Button>
            ))}
          </div>
          {onComplete && row.employee_id === currentEmployeeId && row.kind === "bearbeitet" && (
            <Button size="sm" variant="outline" onClick={() => onComplete(row.message)}>
              Rückmeldung als Lösung übernehmen
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}

export function QmEmployeeTasks({ employeeId }: { employeeId: string }) {
  const [selected, setSelected] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);
  const {
    data: tasks = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: ["qm_worker_tasks", employeeId],
    refetchInterval: 15_000,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await db
        .from("qm_employee_tasks")
        .select(
          "case_id,user_id,employee_id,title,instruction,project_name,priority,due_date,status",
        )
        .eq("employee_id", employeeId)
        .eq("published", true)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: latest = [], error: feedbackError } = useQmLatestFeedback(employeeId);
  const openTasks = tasks.filter((t) => t.status !== "erledigt");
  const visible = showDone ? tasks : openTasks;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  return (
    <section className="surface space-y-3 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ClipboardCheck className="size-5" />
        Meine Qualitätsaufgaben {openTasks.length ? `(${openTasks.length})` : ""}
      </h2>
      <p className="text-sm text-muted-foreground">
        Ihre zugewiesenen Reklamationen und Nacharbeiten. Den Abschluss bestätigt die Verwaltung.
      </p>
      <LoadError error={error} title="Qualitätsaufgaben konnten nicht geladen werden" />
      <LoadError error={feedbackError} title="Bearbeitungsstand konnte nicht geladen werden" />
      {isLoading ? (
        <p>Aufgaben werden geladen …</p>
      ) : !error && visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Qualitätsaufgaben.</p>
      ) : null}
      {visible.map((task) => (
        <button
          key={task.case_id}
          type="button"
          onClick={() => setSelected(task)}
          className="w-full rounded-xl border p-4 text-left space-y-1 hover:bg-muted/40"
        >
          <p className="font-semibold break-words">{task.title}</p>
          <p className="text-sm">
            {task.project_name || "Ohne Objekt"} ·{" "}
            {task.priority === "hoch"
              ? "Hohe Priorität"
              : task.priority === "niedrig"
                ? "Niedrige Priorität"
                : "Mittlere Priorität"}
          </p>
          <p
            className={
              task.status !== "erledigt" && task.due_date && task.due_date < today
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {task.status === "erledigt"
              ? "Von der Verwaltung abgeschlossen"
              : qmFeedbackLabels[latest.find((f) => f.case_id === task.case_id)?.kind ?? ""] ||
                "Offen"}
            {task.due_date ? ` · Frist: ${formatDate(task.due_date)}` : ""}
            {task.status !== "erledigt" && task.due_date && task.due_date < today
              ? " · Überfällig"
              : ""}
          </p>
        </button>
      ))}
      {tasks.some((t) => t.status === "erledigt") && (
        <Button variant="ghost" onClick={() => setShowDone(!showDone)}>
          {showDone ? "Nur offene Aufgaben" : "Abgeschlossene Aufgaben anzeigen"}
        </Button>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {selected && (
            <TaskFeedback
              key={selected.case_id}
              task={tasks.find((t) => t.case_id === selected.case_id) ?? selected}
              available={tasks.some((t) => t.case_id === selected.case_id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TaskFeedback({ task, available }: { task: Task; available: boolean }) {
  const qc = useQueryClient();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState("bearbeitet");
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const closed = !available || task.status === "erledigt";
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("qm_employee_feedback").insert({
        id,
        case_id: task.case_id,
        user_id: task.user_id,
        employee_id: task.employee_id,
        kind,
        message: message.trim(),
        photo_paths: photos,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Rückmeldung gesendet. Die Verwaltung prüft den Abschluss.");
      void qc.invalidateQueries({ queryKey: ["qm_feedback", task.case_id] });
      void qc.invalidateQueries({ queryKey: ["qm_latest_feedback"] });
    },
    onError: (error: Error) => toast.error("Rückmeldung nicht gesendet: " + error.message),
  });
  async function upload(file: File) {
    if (uploading || save.isPending || closed || submitted || photos.length >= 3) return;
    setUploading(true);
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error("Bitte JPG, PNG oder WebP bis 10 MB auswählen.");
      const auth = await supabase.auth.getUser();
      if (!auth.data.user) throw new Error("Bitte erneut anmelden.");
      const path = `${task.case_id}/${id}/${auth.data.user.id}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
      const result = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (result.error) throw result.error;
      setPhotos((previous) => [...previous, path]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Foto konnte nicht hochgeladen werden.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{task.title}</DialogTitle>
        <DialogDescription>
          {task.project_name || "Qualitätsaufgabe"}
          {task.due_date ? ` · Frist: ${formatDate(task.due_date)}` : ""}
        </DialogDescription>
      </DialogHeader>
      <p className="whitespace-pre-wrap break-words">{task.instruction}</p>
      <QmFeedbackList caseId={task.case_id} employeeId={task.employee_id} />
      {closed ? (
        <p className="text-sm text-muted-foreground">
          {available
            ? "Die Verwaltung hat diese Aufgabe abgeschlossen."
            : "Diese Aufgabe ist Ihnen nicht mehr zugewiesen."}
        </p>
      ) : submitted ? (
        <div className="space-y-2">
          <p className="text-sm">
            Ihre Rückmeldung wurde gespeichert. Der Fall bleibt bis zur Prüfung durch die Verwaltung
            offen.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setId(crypto.randomUUID());
              setSubmitted(false);
              setMessage("");
              setPhotos([]);
            }}
          >
            Weitere Rückmeldung
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Art der Rückmeldung
            <select
              className="mt-1 min-h-11 w-full rounded-md border bg-background p-2"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={save.isPending}
            >
              <option value="bearbeitet">Bearbeitet – zur Prüfung senden</option>
              <option value="in_bearbeitung">In Bearbeitung</option>
              <option value="rueckfrage">Rückfrage an die Verwaltung</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Ihre Rückmeldung
            <Textarea
              className="mt-1"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              placeholder="Was wurde erledigt oder welche Frage haben Sie?"
              disabled={save.isPending}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {photos.map((path, i) => (
              <Button
                key={path}
                variant="outline"
                size="sm"
                disabled={uploading || save.isPending}
                onClick={async () => {
                  setUploading(true);
                  try {
                    const { error } = await supabase.storage.from(bucket).remove([path]);
                    if (error) throw error;
                    setPhotos((previous) => previous.filter((p) => p !== path));
                  } catch {
                    toast.error("Foto konnte nicht entfernt werden.");
                  } finally {
                    setUploading(false);
                  }
                }}
              >
                Foto {i + 1}
                <X className="size-4" />
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={uploading || save.isPending || photos.length >= 3}
            onClick={() => input.current?.click()}
          >
            <Camera className="size-4" />
            {uploading ? "Foto wird hochgeladen …" : "Foto hinzufügen (max. 3)"}
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <Button
            className="w-full min-h-11"
            disabled={uploading || save.isPending || !message.trim()}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Wird gesendet …" : "Rückmeldung senden"}
          </Button>
        </div>
      )}
    </div>
  );
}
