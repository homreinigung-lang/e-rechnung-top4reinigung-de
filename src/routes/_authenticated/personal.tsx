import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Pencil, Plus, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/personal")({
  head: () => ({
    meta: [
      { title: "Personal – Mitarbeiter & Projekteinsätze" },
      {
        name: "description",
        content:
          "Mitarbeiter mit Rolle und Kontaktdaten verwalten und den Projekteinsatz im Blick behalten.",
      },
      { property: "og:title", content: "Mitarbeiterverwaltung" },
      {
        property: "og:description",
        content: "Team, Rollen und Projektzuordnungen zentral steuern.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Personal,
});

const ROLES = ["Reinigungskraft", "Vorarbeiter", "Objektleiter", "Springer", "Verwaltung"];

type EmployeeForm = {
  id?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  personnel_number: string;
  hourly_rate: number;
};

const empty: EmployeeForm = {
  name: "",
  role: "Reinigungskraft",
  email: "",
  phone: "",
  personnel_number: "",
  hourly_rate: 0,
};

function Personal() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(empty);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["project_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_assignments").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: EmployeeForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { id, ...rest } = values;
      if (id) {
        const { error } = await supabase.from("employees").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({ ...rest, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mitarbeiter gespeichert");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mitarbeiter gelöscht");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Personal</h1>
          <p className="mt-1 text-muted-foreground">
            Mitarbeiterstamm mit Rolle, Kontaktdaten und Projekteinsatz.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setForm(empty);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Neuer Mitarbeiter
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="e-name">Name</Label>
                <Input
                  id="e-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Rolle / Position</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-nr">Personalnummer</Label>
                <Input
                  id="e-nr"
                  value={form.personnel_number}
                  onChange={(e) => setForm({ ...form, personnel_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-mail">E-Mail</Label>
                <Input
                  id="e-mail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-phone">Telefon</Label>
                <Input
                  id="e-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-rate">Stundenlohn (€)</Label>
                <Input
                  id="e-rate"
                  type="number"
                  step="0.01"
                  value={form.hourly_rate}
                  onChange={(e) =>
                    setForm({ ...form, hourly_rate: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => save.mutate(form)}
                disabled={!form.name.trim() || save.isPending}
              >
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface overflow-x-auto">
        {employees.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine Mitarbeiter angelegt.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-5 py-3">Name</th>
                <th className="px-3 py-3">Rolle</th>
                <th className="px-3 py-3">Kontakt</th>
                <th className="px-3 py-3 text-right">Stundenlohn</th>
                <th className="px-3 py-3">Projekte</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const mine = assignments.filter((a) => a.employee_id === e.id);
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-5 py-3 font-medium">
                      {e.name}
                      {e.personnel_number && (
                        <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                          {e.personnel_number}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">{e.role || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {[e.email, e.phone].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">{formatMoney(Number(e.hourly_rate))}</td>
                    <td className="px-3 py-3">
                      {mine.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {mine.map((a) => {
                            const p = projects.find((x) => x.id === a.project_id);
                            return (
                              <Link
                                key={a.id}
                                to="/projekte/$id"
                                params={{ id: a.project_id }}
                                className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:underline"
                              >
                                {p?.name ?? "Projekt"}
                                {a.assignment_role ? ` · ${a.assignment_role}` : ""}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setForm({
                            id: e.id,
                            name: e.name,
                            role: e.role,
                            email: e.email,
                            phone: e.phone ?? "",
                            personnel_number: e.personnel_number ?? "",
                            hourly_rate: Number(e.hourly_rate),
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(e.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg font-semibold">Einsatzübersicht</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Projekte vorhanden.</p>
        ) : (
          <ul className="divide-y">
            {projects.map((p) => {
              const team = assignments.filter((a) => a.project_id === p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Link
                    to="/projekte/$id"
                    params={{ id: p.id }}
                    className="min-w-0 flex-1 font-medium hover:underline"
                  >
                    {p.name || "Ohne Namen"}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {team.length === 0
                      ? "Kein Team zugewiesen"
                      : team
                          .map(
                            (a) =>
                              employees.find((e) => e.id === a.employee_id)?.name ?? "Unbekannt",
                          )
                          .join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
