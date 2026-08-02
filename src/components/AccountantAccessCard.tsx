import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createAccountantAccess } from "@/lib/accountant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { Copy, KeyRound, Mail, Trash2 } from "lucide-react";

type Access = {
  id: string;
  email: string;
  token: string;
  access_code: string;
  active: boolean;
  expires_at: string;
  last_used_at: string | null;
};

function linkFor(token: string) {
  return `${window.location.origin}/stb/${token}`;
}

export function AccountantAccessCard() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const createAccess = useServerFn(createAccountantAccess);

  const { data: accesses = [] } = useQuery({
    queryKey: ["accountant_access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accountant_access")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Access[];
    },
  });

  const create = useMutation({
    mutationFn: async () => createAccess({ data: { email } }),
    onSuccess: async ({ token }) => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      try {
        await navigator.clipboard.writeText(linkFor(token));
        toast.success("Zugangs-Link erstellt und kopiert.");
      } catch {
        toast.success("Zugangs-Link erstellt.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accountant_access").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accountant_access"] }),
  });

  function copy(text: string, message: string) {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(message),
      () => toast.error("Kopieren nicht möglich."),
    );
  }

  function invite(access: Access) {
    const to = access.email || email;
    if (!to) {
      toast.error("Bitte E-Mail-Adresse des Steuerberaters eintragen.");
      return;
    }
    const body = [
      "Guten Tag,",
      "",
      "anbei Ihr persönlicher Nur-Lese-Zugang zu unseren Rechnungen und Ausgaben (DATEV- und Excel-Export inklusive).",
      "",
      `Zugangs-Link: ${linkFor(access.token)}`,
      `Temporäres Passwort: ${access.access_code}`,
      "",
      `Gültig bis: ${formatDate(access.expires_at)}`,
      "",
      "Mit freundlichen Grüßen",
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      "Steuerberater-Zugang (Nur-Lese-Zugriff)",
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="surface space-y-4 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Steuerberater-Zugang einrichten</h2>
        <p className="text-sm text-muted-foreground">
          Erstellen Sie einen sicheren Nur-Lese-Zugang: Ihr Steuerberater sieht Rechnungen und
          Ausgaben und kann DATEV-, Excel- und PDF-Exporte selbst herunterladen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="stb_email">E-Mail des Steuerberaters</Label>
          <Input
            id="stb_email"
            type="email"
            placeholder="kanzlei@steuerberater.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <KeyRound className="size-4" /> Zugangs-Link generieren &amp; kopieren
        </Button>
        {accesses[0] && (
          <Button variant="outline" onClick={() => invite(accesses[0]!)}>
            <Mail className="size-4" /> Einladung per E-Mail senden
          </Button>
        )}
      </div>

      {accesses.length > 0 && (
        <div className="space-y-2">
          {accesses.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">{a.email || "Ohne E-Mail"}</div>
                <div className="truncate text-xs text-muted-foreground">
                  Passwort: {a.access_code} · gültig bis {formatDate(a.expires_at)}
                  {a.last_used_at ? ` · zuletzt genutzt ${formatDate(a.last_used_at)}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(linkFor(a.token), "Link kopiert.")}
                >
                  <Copy className="size-4" /> Link
                </Button>
                <Button size="sm" variant="outline" onClick={() => invite(a)}>
                  <Mail className="size-4" /> Einladung
                </Button>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(a.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
