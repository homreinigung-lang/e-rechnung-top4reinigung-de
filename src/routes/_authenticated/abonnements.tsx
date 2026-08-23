import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Building2 } from "lucide-react";
import {
  PLANS,
  STATUS,
  planLabel,
  statusLabel,
  useAllSubscriptions,
  useIsAdmin,
  type Subscription,
} from "@/lib/subscriptions";

export const Route = createFileRoute("/_authenticated/abonnements")({
  head: () => ({
    meta: [
      { title: "Abonnements verwalten – GebCalc" },
      {
        name: "description",
        content:
          "Administrationsbereich für Firmen-Abonnements: Status, Paket und Anzeige auf der Startseite verwalten.",
      },
      { property: "og:title", content: "Abonnements verwalten – GebCalc" },
      {
        property: "og:description",
        content: "Firmen-Abonnements, Status und Partneranzeige zentral steuern.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AbonnementsPage,
});

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "active") return "default";
  if (status === "trial") return "secondary";
  return "outline";
}

function AbonnementsPage() {
  const queryClient = useQueryClient();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const { data: rows = [], isLoading } = useAllSubscriptions(isAdmin === true);

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Subscription> }) => {
      const { error } = await supabase.from("subscriptions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions_admin"] });
      void queryClient.invalidateQueries({ queryKey: ["public_partners"] });
      toast.success("Abonnement aktualisiert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (roleLoading) return <p className="text-muted-foreground">Wird geladen …</p>;

  if (!isAdmin) {
    return (
      <div className="surface p-6">
        <ShieldCheck className="size-6 text-primary" />
        <h1 className="mt-3 text-xl font-bold">Kein Zugriff</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dieser Bereich ist ausschließlich für Administratoren freigegeben.
        </p>
      </div>
    );
  }

  const activeCount = rows.filter((r) => r.status === "active").length;
  const publicCount = rows.filter((r) => r.visible_on_landing && r.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Abonnements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} Firmen · {activeCount} aktiv · {publicCount} auf der Startseite sichtbar
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Wird geladen …</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Abonnements vorhanden.</p>
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <div key={row.id} className="surface space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">{row.company_name || "Ohne Namen"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[row.city, row.contact_email].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <Badge variant={statusVariant(row.status)}>
                  {statusLabel[row.status] ?? row.status}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`name-${row.id}`}>Anzeigename</Label>
                  <Input
                    id={`name-${row.id}`}
                    defaultValue={row.company_name}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== row.company_name)
                        update.mutate({ id: row.id, patch: { company_name: v } });
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`city-${row.id}`}>Ort</Label>
                  <Input
                    id={`city-${row.id}`}
                    defaultValue={row.city}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== row.city) update.mutate({ id: row.id, patch: { city: v } });
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={row.status}
                    onValueChange={(v) => update.mutate({ id: row.id, patch: { status: v } })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Paket</Label>
                  <Select
                    value={row.plan}
                    onValueChange={(v) => update.mutate({ id: row.id, patch: { plan: v } })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLANS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {planLabel[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    id={`vis-${row.id}`}
                    checked={row.visible_on_landing}
                    onCheckedChange={(checked) =>
                      update.mutate({ id: row.id, patch: { visible_on_landing: checked } })
                    }
                  />
                  <Label htmlFor={`vis-${row.id}`} className="cursor-pointer">
                    Auf der Startseite anzeigen
                  </Label>
                </div>

                <div className="w-28 space-y-1.5">
                  <Label htmlFor={`sort-${row.id}`}>Reihenfolge</Label>
                  <Input
                    id={`sort-${row.id}`}
                    type="number"
                    defaultValue={row.sort_order}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== row.sort_order)
                        update.mutate({ id: row.id, patch: { sort_order: v } });
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Hinweis: Auf der öffentlichen Startseite erscheinen ausschließlich Firmen mit dem Status
        „Aktiv“ und aktivierter Anzeige.
      </p>
    </div>
  );
}
