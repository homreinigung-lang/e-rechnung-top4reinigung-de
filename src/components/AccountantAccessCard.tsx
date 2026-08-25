import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  createAccountantAccess,
  sendAccountantInvite,
  setAccountantPassword,
} from "@/lib/accountant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { Copy, KeyRound, Mail, Save, Trash2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";

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
  const [password, setPassword] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const createAccess = useServerFn(createAccountantAccess);
  const savePassword = useServerFn(setAccountantPassword);
  const sendInviteFn = useServerFn(sendAccountantInvite);

  const sendInvite = useMutation({
    mutationFn: async (vars: { id: string; email: string }) =>
      sendInviteFn({ data: { ...vars, origin: window.location.origin } }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      toast.success(`Einladung erfolgreich an ${res.to} gesendet.`, {
        description: "Der Steuerberater erhält den sicheren Zugangs-Link und das Passwort.",
        duration: 8000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
    mutationFn: async () => createAccess({ data: { email, password } }),
    onSuccess: async ({ token }) => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      setPassword("");
      try {
        await navigator.clipboard.writeText(linkFor(token));
        toast.success("Zugangs-Link erstellt und kopiert.");
      } catch {
        toast.success("Zugangs-Link erstellt.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePassword = useMutation({
    mutationFn: async (vars: { id: string; password: string }) => savePassword({ data: vars }),
    onSuccess: async (_d, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      setEdits((prev) => ({ ...prev, [vars.id]: "" }));
      toast.success("Passwort dauerhaft gespeichert.");
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
    const to = (email || access.email).trim();
    if (!to) {
      toast.error("Bitte E-Mail-Adresse des Steuerberaters eintragen.");
      return;
    }
    sendInvite.mutate({ id: access.id, email: to });
  }

  return (
    <div className="surface space-y-4 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Steuerberater-Zugang einrichten</h2>
        <p className="text-sm text-muted-foreground">
          Erstellen Sie einen sicheren Nur-Lese-Zugang mit dauerhaftem Passwort (ohne Ablaufdatum):
          Ihr Steuerberater sieht Rechnungen und Ausgaben und kann DATEV-, Excel- und PDF-Exporte
          selbst herunterladen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="stb_email">E-Mail des Steuerberaters</Label>
          <Input
            id="stb_email"
            type="email"
            placeholder="kanzlei@steuerberater.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stb_password">Passwort (optional, dauerhaft)</Label>
          <Input
            id="stb_password"
            placeholder="Leer lassen für automatisches Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <KeyRound className="size-4" /> Zugang erstellen
        </Button>
        {accesses[0] && (
          <>
            <Button
              variant="outline"
              disabled={sendInvite.isPending}
              onClick={() => invite(accesses[0]!)}
            >
              <Mail className="size-4" /> Einladung senden
            </Button>
            <Button
              variant="outline"
              onClick={() => copy(linkFor(accesses[0]!.token), "Link in die Zwischenablage kopiert.")}
            >
              <Copy className="size-4" /> Link in die Zwischenablage kopieren
            </Button>
          </>
        )}
      </div>

      {accesses.length > 0 && (
        <div className="space-y-2">
          {accesses.map((a) => (
            <div key={a.id} className="space-y-3 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{a.email || "Ohne E-Mail"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    Passwort: {a.access_code} · unbegrenzt gültig
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sendInvite.isPending}
                    onClick={() => invite(a)}
                  >
                    <Mail className="size-4" /> Einladung senden
                  </Button>
                  <ConfirmDeleteButton
                    size="sm"
                    iconClassName="size-4"
                    ariaLabel="Zugang löschen"
                    title="Zugang wirklich löschen?"
                    description={`Der Steuerberater-Zugang „${a.email || "ohne E-Mail"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                    onConfirm={() => revoke.mutate(a.id)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1 space-y-1">
                  <Label htmlFor={`pw_${a.id}`} className="text-xs">
                    Passwort ändern
                  </Label>
                  <Input
                    id={`pw_${a.id}`}
                    value={edits[a.id] ?? ""}
                    placeholder="Neues dauerhaftes Passwort"
                    onChange={(e) => setEdits((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={changePassword.isPending || !(edits[a.id] ?? "").trim()}
                  onClick={() => changePassword.mutate({ id: a.id, password: edits[a.id] ?? "" })}
                >
                  <Save className="size-4" /> Speichern
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
