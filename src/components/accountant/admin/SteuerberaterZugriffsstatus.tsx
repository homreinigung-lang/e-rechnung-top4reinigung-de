import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { formatDate } from "@/lib/format";

import { Check, Lock, ShieldCheck, ShieldOff } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";

import { STEUERBERATER_RECHTE } from "./shared";

export function SteuerberaterZugriffsstatus() {
  const queryClient = useQueryClient();
  const { data: accesses = [] } = useQuery({
    queryKey: ["accountant_access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accountant_access")
        .select("id, email, active, created_at, last_used_at, invited_at, activated_at")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        email: string;
        active: boolean;
        created_at: string;
        last_used_at: string | null;
        invited_at: string | null;
        activated_at: string | null;
      }[];
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accountant_access").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      toast.success("Steuerberater-Zugang wurde widerrufen.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const zugang = accesses[0];
  const istAktiv = Boolean(zugang && (zugang.activated_at || zugang.last_used_at));
  const istEingeladen = Boolean(zugang && !istAktiv && zugang.invited_at);
  const aktiv = zugang;
  const statusLabel = istAktiv
    ? "🟢 Aktiv"
    : istEingeladen
      ? "🟡 Einladung gesendet"
      : zugang
        ? "⚪ Zugang erstellt – noch nicht eingeladen"
        : "Noch kein Steuerberater verbunden";
  const statusClass = istAktiv
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : istEingeladen
      ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "border-muted bg-muted/50 text-muted-foreground";

  return (
    <section className="no-print rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShieldCheck className="size-5 text-primary" /> Berechtigungen des Steuerberaters
          </h2>
          <p className="text-sm text-muted-foreground">
            Übersicht über die eingeräumten Lese-Rechte und den aktuellen Zugangsstatus.
          </p>
        </div>
        <div
          className={
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium " +
            statusClass
          }
        >
          {statusLabel}
        </div>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {STEUERBERATER_RECHTE.map((recht) => (
          <li key={recht.label} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            {recht.erlaubt ? (
              <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Lock className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={recht.erlaubt ? "" : "text-muted-foreground line-through"}>
              {recht.label}
            </span>
          </li>
        ))}
      </ul>

      {aktiv && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
          <div className="min-w-0 text-sm">
            <div className="font-medium">{aktiv.email || "Steuerberater ohne E-Mail"}</div>
            <div className="text-xs text-muted-foreground">
              {istAktiv
                ? `Aktiv seit ${formatDate(aktiv.activated_at ?? aktiv.last_used_at ?? aktiv.created_at)}`
                : istEingeladen
                  ? `Einladung gesendet am ${formatDate(aktiv.invited_at!)} · noch keine Anmeldung`
                  : `Zugang erstellt am ${formatDate(aktiv.created_at)} · Einladung noch nicht versendet`}
              {aktiv.last_used_at ? ` · zuletzt genutzt ${formatDate(aktiv.last_used_at)}` : ""}
            </div>
          </div>
          <ConfirmDeleteButton
            size="sm"
            variant="destructive"
            ariaLabel="Zugang widerrufen"
            title="Zugang wirklich widerrufen?"
            description={`Der Steuerberater-Zugang „${aktiv.email || "ohne E-Mail"}" wird unwiderruflich widerrufen. Der Steuerberater kann danach nicht mehr auf Ihre Daten zugreifen. Diese Aktion kann nicht rückgängig gemacht werden.`}
            confirmLabel="Zugang widerrufen"
            onConfirm={() => revoke.mutate(aktiv.id)}
          >
            <ShieldOff className="size-4" /> Widerrufen
          </ConfirmDeleteButton>
        </div>
      )}
    </section>
  );
}
