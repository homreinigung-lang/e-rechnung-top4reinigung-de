import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";

function randomCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * Unternehmens-Code für die geschützte Mitarbeiter-Registrierung.
 * Nur wer diesen Code (oder den Einladungslink) hat, kann sich als
 * Mitarbeiter/in dieser Firma registrieren.
 */
export function MitarbeiterEinladung() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["company_invite_code"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: row } = await supabase
        .from("company_settings")
        .select("id,invite_code")
        .eq("user_id", uid)
        .maybeSingle();
      if (row) return row as { id: string; invite_code: string };
      const { data: created, error } = await supabase
        .from("company_settings")
        .insert({ user_id: uid, invite_code: randomCode() })
        .select("id,invite_code")
        .single();
      if (error) throw new Error(error.message);
      return created as { id: string; invite_code: string };
    },
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const { error } = await supabase
        .from("company_settings")
        .update({ invite_code: randomCode() })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company_invite_code"] });
      toast.success("Neuer Unternehmens-Code erstellt. Alte Einladungen sind ungültig.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const code = data?.invite_code ?? "";
  const link =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/auth?code=${encodeURIComponent(code)}`
      : "";

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label + " kopiert.");
    } catch {
      toast.error("Kopieren nicht möglich.");
    }
  }

  return (
    <div className="surface space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">Mitarbeiter einladen</h2>
        <p className="text-sm text-muted-foreground">
          Mitarbeitende können sich nur mit diesem Unternehmens-Code registrieren. Geben Sie den
          Code oder den Einladungslink ausschließlich an Ihr eigenes Personal weiter.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invite-code">Unternehmens-Code</Label>
          <div className="flex gap-2">
            <Input
              id="invite-code"
              readOnly
              dir="ltr"
              value={isLoading ? "…" : code}
              className="font-mono tracking-widest"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!code}
              onClick={() => void copy(code, "Code")}
              aria-label="Code kopieren"
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invite-link">Einladungslink</Label>
          <div className="flex gap-2">
            <Input id="invite-link" readOnly dir="ltr" value={link} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!link}
              onClick={() => void copy(link, "Einladungslink")}
              aria-label="Link kopieren"
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={!data || regenerate.isPending}
        onClick={() => regenerate.mutate()}
      >
        <RefreshCw className="size-4" /> Neuen Code erzeugen
      </Button>
    </div>
  );
}
