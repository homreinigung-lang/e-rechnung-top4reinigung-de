import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Building2, CalendarPlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { PlatformRechnungDialog } from "@/components/PlatformRechnungDialog";


/** Laufzeitende um n Monate verlängern (ab heute, falls bereits abgelaufen). */
function extendDate(current: string | null, months: number): string {
  const base = current ? new Date(`${current}T00:00:00`) : new Date();
  const start = base.getTime() > Date.now() ? base : new Date();
  start.setMonth(start.getMonth() + months);
  return start.toISOString().slice(0, 10);
}
import {
  PLANS,
  STATUS,
  planLabel,
  statusLabel,
  useAllSubscriptions,
  type Subscription,
} from "@/lib/subscriptions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AbonnementsPage,
});

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "active") return "default";
  if (status === "trial") return "secondary";
  return "outline";
}

function AbonnementsPage() {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useAllSubscriptions(true);

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

  const activeCount = rows.filter((r) => r.status === "active").length;
  const publicCount = rows.filter((r) => r.visible_on_landing && r.status === "active").length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {rows.length} Firmen · {activeCount} aktiv · {publicCount} auf der Startseite sichtbar
      </p>

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

              <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
                <div className="w-44 space-y-1.5">
                  <Label htmlFor={`renew-${row.id}`}>Laufzeit bis</Label>
                  <Input
                    id={`renew-${row.id}`}
                    type="date"
                    defaultValue={row.renews_on ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value || null;
                      if (v !== row.renews_on)
                        update.mutate({ id: row.id, patch: { renews_on: v } });
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    update.mutate({
                      id: row.id,
                      patch: { renews_on: extendDate(row.renews_on, 1), status: "active" },
                    })
                  }
                >
                  <CalendarPlus className="size-4" />
                  +1 Monat (Zahlung erhalten)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    update.mutate({
                      id: row.id,
                      patch: { renews_on: extendDate(row.renews_on, 12), status: "active" },
                    })
                  }
                >
                  <CalendarPlus className="size-4" />
                  +12 Monate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={row.status === "active"}
                  onClick={() => update.mutate({ id: row.id, patch: { status: "active" } })}
                >
                  <CheckCircle2 className="size-4" />
                  Freischalten
                </Button>
                <PlatformRechnungDialog subscription={row} />

              </div>

              {row.status === "trial" ? (
                <p className="text-xs text-muted-foreground">
                  Testphase{row.renews_on ? ` bis ${formatDate(row.renews_on)}` : ""} – nach
                  Zahlungseingang per Überweisung hier verlängern.
                </p>
              ) : null}
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
