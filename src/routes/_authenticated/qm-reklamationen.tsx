import type { SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileUploadButton } from "@/components/FileUploadButton";
import { openStoredFile } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/qm-reklamationen")({
  head: () => ({ meta: [{ title: "QM / Reklamationen" }] }),
  component: QmReklamationen,
});

type QmCase = {
  id: string;
  customer_id: string | null;
  project_id: string | null;
  assigned_employee_id: string | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  due_date: string | null;
  action_note: string;
  solution: string;
  attachment_paths: string[];
  occurred_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const emptyForm = {
  id: "",
  customer_id: "",
  project_id: "",
  assigned_employee_id: "",
  title: "",
  description: "",
  category: "reinigung",
  priority: "mittel",
  status: "neu",
  due_date: "",
  action_note: "",
  solution: "",
  occurred_at: new Date().toISOString().slice(0, 10),
  attachment_paths: [] as string[],
};

const statusLabel: Record<string, string> = {
  neu: "Neu",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
};
const priorityLabel: Record<string, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
};
const categoryLabel: Record<string, string> = {
  reinigung: "Reinigung",
  personal: "Personal",
  termin: "Termin",
  material: "Material",
  sonstiges: "Sonstiges",
};

function QmReklamationen() {
  const db = supabase as SupabaseClient;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("offen");
  const [projectFilter, setProjectFilter] = useState("alle");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["qm_cases"] });
    queryClient.invalidateQueries({ queryKey: ["qm_case_events"] });
  };

  const { data: cases = [] } = useQuery({
    queryKey: ["qm_cases"],
    queryFn: async () => {
      const { data, error } = await db.from("qm_cases").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QmCase[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "qm"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,company").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "qm"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name,customer_id,city").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "qm"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,name,role").eq("active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["qm_case_events", form.id],
    enabled: Boolean(form.id && open),
    queryFn: async () => {
      const { data, error } = await db.from("qm_case_events").select("*").eq("case_id", form.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Bitte einen Titel angeben.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Nicht angemeldet");
      const payload = {
        user_id: auth.user.id,
        customer_id: form.customer_id || null,
        project_id: form.project_id || null,
        assigned_employee_id: form.assigned_employee_id || null,
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        priority: form.priority,
        status: form.status,
        due_date: form.due_date || null,
        action_note: form.action_note,
        solution: form.solution,
        occurred_at: form.occurred_at,
        attachment_paths: form.attachment_paths,
      };
      if (form.id) {
        const { error } = await db.from("qm_cases").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("qm_cases").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Reklamation aktualisiert" : "Reklamation angelegt");
      setOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("qm_cases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reklamation gelöscht");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function editCase(item: QmCase) {
    setForm({
      id: item.id,
      customer_id: item.customer_id ?? "",
      project_id: item.project_id ?? "",
      assigned_employee_id: item.assigned_employee_id ?? "",
      title: item.title,
      description: item.description,
      category: item.category,
      priority: item.priority,
      status: item.status,
      due_date: item.due_date ?? "",
      action_note: item.action_note,
      solution: item.solution,
      occurred_at: item.occurred_at,
      attachment_paths: item.attachment_paths ?? [],
    });
    setOpen(true);
  }

  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(
    () =>
      cases.filter((item) => {
        if (statusFilter === "offen" && item.status === "erledigt") return false;
        if (statusFilter !== "alle" && statusFilter !== "offen" && item.status !== statusFilter) return false;
        if (projectFilter !== "alle" && item.project_id !== projectFilter) return false;
        return true;
      }),
    [cases, statusFilter, projectFilter],
  );

  const openCount = cases.filter((c) => c.status !== "erledigt").length;
  const overdueCount = cases.filter((c) => c.status !== "erledigt" && c.due_date && c.due_date < today).length;
  const doneCount = cases.filter((c) => c.status === "erledigt").length;

  const customerName = (id: string | null) => {
    const c = customers.find((x) => x.id === id);
    return c ? c.company || c.name : "–";
  };
  const projectName = (id: string | null) => projects.find((x) => x.id === id)?.name || "–";
  const employeeName = (id: string | null) => employees.find((x) => x.id === id)?.name || "Nicht zugeordnet";

  const compatibleProjects = projects.filter(
    (p) => !form.customer_id || p.customer_id === form.customer_id,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">QM / Reklamationen</h1>
          <p className="mt-1 text-muted-foreground">
            Interne Qualitätsfälle, Kundenreklamationen, Maßnahmen und Fristen zentral verfolgen.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Neue Reklamation
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Offen</div>
          <div className="mt-1 text-2xl font-semibold">{openCount}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Überfällig</div>
          <div className="mt-1 text-2xl font-semibold text-destructive">{overdueCount}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Erledigt</div>
          <div className="mt-1 text-2xl font-semibold">{doneCount}</div>
        </div>
      </div>

      <div className="surface flex flex-wrap gap-3 p-4">
        <div className="min-w-[190px] space-y-1">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="offen">Offen</SelectItem>
              <SelectItem value="neu">Neu</SelectItem>
              <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
              <SelectItem value="erledigt">Erledigt</SelectItem>
              <SelectItem value="alle">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[240px] space-y-1">
          <Label>Objekt</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Objekte</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name || "Ohne Namen"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="surface overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Keine Reklamationen im gewählten Filter.</p>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3">Fall</th>
                <th className="p-3">Kunde / Objekt</th>
                <th className="p-3">Kategorie</th>
                <th className="p-3">Priorität</th>
                <th className="p-3">Status</th>
                <th className="p-3">Verantwortlich</th>
                <th className="p-3">Frist</th>
                <th className="p-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((item) => {
                const overdue = item.status !== "erledigt" && Boolean(item.due_date && item.due_date < today);
                return (
                  <tr key={item.id}>
                    <td className="p-3">
                      <button type="button" onClick={() => editCase(item)} className="font-medium hover:underline">
                        {item.title}
                      </button>
                      <div className="text-xs text-muted-foreground">{formatDate(item.occurred_at)}</div>
                    </td>
                    <td className="p-3">
                      <div>{customerName(item.customer_id)}</div>
                      {item.project_id ? (
                        <Link to="/projekte/$id" params={{ id: item.project_id }} className="text-xs text-primary hover:underline">
                          {projectName(item.project_id)}
                        </Link>
                      ) : <div className="text-xs text-muted-foreground">Kein Objekt</div>}
                    </td>
                    <td className="p-3">{categoryLabel[item.category] ?? item.category}</td>
                    <td className="p-3">
                      <span className={item.priority === "hoch" ? "font-semibold text-destructive" : ""}>
                        {priorityLabel[item.priority] ?? item.priority}
                      </span>
                    </td>
                    <td className="p-3">{statusLabel[item.status] ?? item.status}</td>
                    <td className="p-3">{employeeName(item.assigned_employee_id)}</td>
                    <td className={overdue ? "p-3 font-semibold text-destructive" : "p-3"}>
                      {item.due_date ? formatDate(item.due_date) : "–"}
                      {overdue ? " · überfällig" : ""}
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => editCase(item)}>Bearbeiten</Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(item.id)}>Löschen</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Reklamation bearbeiten" : "Neue Reklamation"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Titel</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Kunde</Label>
              <Select
                value={form.customer_id || "__none__"}
                onValueChange={(value) => {
                  const customerId = value === "__none__" ? "" : value;
                  const currentProject = projects.find((p) => p.id === form.project_id);
                  setForm({
                    ...form,
                    customer_id: customerId,
                    project_id: currentProject?.customer_id === customerId ? form.project_id : "",
                  });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Kein Kunde</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Objekt</Label>
              <Select value={form.project_id || "__none__"} onValueChange={(v) => setForm({ ...form, project_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Kein Objekt</SelectItem>
                  {compatibleProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name || "Ohne Namen"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Kategorie</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabel).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Priorität</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityLabel).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabel).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Verantwortlich</Label>
              <Select value={form.assigned_employee_id || "__none__"} onValueChange={(v) => setForm({ ...form, assigned_employee_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nicht zugeordnet</SelectItem>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} · {e.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Vorfalldatum</Label>
              <Input type="date" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Frist</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Beschreibung</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Maßnahme / interne Notiz</Label>
              <Textarea rows={3} value={form.action_note} onChange={(e) => setForm({ ...form, action_note: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Lösung / Abschluss</Label>
              <Textarea rows={3} value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Anhänge / Fotos</Label>
              <div className="flex flex-wrap gap-2">
                <FileUploadButton
                  folder="qm-reklamationen"
                  accept="image/*,application/pdf"
                  label="Datei anhängen"
                  onUploaded={(path) => setForm((current) => ({ ...current, attachment_paths: [...current.attachment_paths, path] }))}
                />
                {form.attachment_paths.map((path, index) => (
                  <Button key={path} type="button" variant="outline" size="sm" onClick={() => void openStoredFile(path)}>
                    <FileText className="size-4" /> Anlage {index + 1}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {form.id && (
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <ClipboardCheck className="size-4" /> Verlauf
              </div>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Verlaufseinträge.</p>
              ) : (
                <div className="space-y-2">
                  {events.slice(0, 12).map((event: any) => (
                    <div key={event.id} className="text-sm">
                      <span className="font-medium">{event.event_type}</span>{" "}
                      <span className="text-muted-foreground">
                        {new Date(event.created_at).toLocaleString("de-DE")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {form.status === "erledigt" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
