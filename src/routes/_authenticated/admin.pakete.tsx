import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Package, Plus, Trash2 } from "lucide-react";
import { euro, useCreatePlan, useDeletePlan, usePlans, useUpdatePlan } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/pakete")({
  component: PaketePage,
});

function PaketePage() {
  const { data: plans = [], isLoading } = usePlans();
  const update = useUpdatePlan();
  const create = useCreatePlan();
  const remove = useDeletePlan();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  return (
    <div className="space-y-6">
      <div className="surface space-y-3 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plus className="size-4 text-primary" /> Neues Paket
        </h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="new-code">Kürzel</Label>
            <Input
              id="new-code"
              value={code}
              placeholder="z. B. premium"
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              value={name}
              placeholder="z. B. Premium"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            disabled={!code.trim() || !name.trim() || create.isPending}
            onClick={() => {
              create.mutate(
                { code: code.trim().toLowerCase(), name: name.trim() },
                {
                  onSuccess: () => {
                    setCode("");
                    setName("");
                  },
                },
              );
            }}
          >
            Anlegen
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Wird geladen …</p>
      ) : (
        <div className="grid gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className="surface space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Package className="size-5 text-primary" />
                  <span className="font-semibold">{plan.name}</span>
                  <span className="text-xs text-muted-foreground">({plan.code})</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`active-${plan.id}`}
                      checked={plan.active}
                      onCheckedChange={(checked) =>
                        update.mutate({ id: plan.id, patch: { active: checked } })
                      }
                    />
                    <Label htmlFor={`active-${plan.id}`} className="cursor-pointer text-sm">
                      Aktiv
                    </Label>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Paket löschen"
                    onClick={() => remove.mutate(plan.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`name-${plan.id}`}>Name</Label>
                  <Input
                    id={`name-${plan.id}`}
                    defaultValue={plan.name}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== plan.name) update.mutate({ id: plan.id, patch: { name: v } });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`m-${plan.id}`}>Preis / Monat (EUR)</Label>
                  <Input
                    id={`m-${plan.id}`}
                    type="number"
                    step="0.01"
                    defaultValue={(plan.price_monthly_cents / 100).toFixed(2)}
                    onBlur={(e) => {
                      const cents = Math.round((Number(e.target.value) || 0) * 100);
                      if (cents !== plan.price_monthly_cents)
                        update.mutate({ id: plan.id, patch: { price_monthly_cents: cents } });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`y-${plan.id}`}>Preis / Jahr (EUR)</Label>
                  <Input
                    id={`y-${plan.id}`}
                    type="number"
                    step="0.01"
                    defaultValue={(plan.price_yearly_cents / 100).toFixed(2)}
                    onBlur={(e) => {
                      const cents = Math.round((Number(e.target.value) || 0) * 100);
                      if (cents !== plan.price_yearly_cents)
                        update.mutate({ id: plan.id, patch: { price_yearly_cents: cents } });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`s-${plan.id}`}>Reihenfolge</Label>
                  <Input
                    id={`s-${plan.id}`}
                    type="number"
                    defaultValue={plan.sort_order}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== plan.sort_order)
                        update.mutate({ id: plan.id, patch: { sort_order: v } });
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`d-${plan.id}`}>Beschreibung</Label>
                  <Textarea
                    id={`d-${plan.id}`}
                    rows={3}
                    defaultValue={plan.description}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== plan.description)
                        update.mutate({ id: plan.id, patch: { description: v } });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`f-${plan.id}`}>Leistungen (eine pro Zeile)</Label>
                  <Textarea
                    id={`f-${plan.id}`}
                    rows={3}
                    defaultValue={plan.features.join("\n")}
                    onBlur={(e) => {
                      const list = e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      if (list.join("\n") !== plan.features.join("\n"))
                        update.mutate({ id: plan.id, patch: { features: list } });
                    }}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {euro(plan.price_monthly_cents)} pro Monat · {euro(plan.price_yearly_cents)} pro
                Jahr
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
