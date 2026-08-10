import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { FolderKanban, Plus, Trash2 } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<string>("floorplan");
  const [customerId, setCustomerId] = useState<string>("none");

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
      return data.id;
    },
    onSuccess: (id) => {
      setOpen(false);
      setName("");
      setCustomerId("none");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projekte/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
                Projekt anlegen
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
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
