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
  access_code?: string;
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
  const [oneTimeCredential, setOneTimeCredential] = useState<{ accessId: string; accessCode: string; link: string } | null>(null);
  const createAccess = useServerFn(createAccountantAccess);
  const savePassword = useServerFn(setAccountantPassword);
  const sendInviteFn = useServerFn(sendAccountantInvite);

  const sendInvite = useMutation({
    mutationFn: async (vars: { id: string; email: string; password?: string }) =>
      sendInviteFn({ data: { ...vars, origin: window.location.origin } }),
    onSuccess: async (res, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      setPassword("");
      setOneTimeCredential({ accessId: vars.id, accessCode: res.accessCode, link: res.link });
      toast.info(`Versandauftrag für ${res.to} angenommen.`, {
        description: `Resend-ID: ${res.messageId}. Die Annahme bestätigt noch nicht die Zustellung; bitte auch den Spam-Ordner prüfen.`,
        duration: 12000,
      });
    },
    onError: (e: Error) => {
      const message = e.message.startsWith("E-Mail konnte nicht gesendet werden")
        ? e.message
        : `E-Mail konnte nicht gesendet werden: ${e.message}`;
      toast.error(message, { duration: 10000 });
    },
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
    onSuccess: async ({ id, token, accessCode }) => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      setPassword("");
      setOneTimeCredential({ accessId: id, accessCode, link: linkFor(token) });
      try {
        await navigator.clipboard.writeText(linkFor(token));
      } catch {
        /* Zwischenablage nicht verfügbar */
      }
      toast.success("Zugangs-Link erstellt.", {
        description: `Passwort: ${accessCode} – bitte jetzt notieren, es wird verschlüsselt gespeichert und später nicht mehr angezeigt.`,
        duration: 20000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePassword = useMutation({
    mutationFn: async (vars: { id: string; password: string }) => savePassword({ data: vars }),
    onSuccess: async (_d, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      setEdits((prev) => ({ ...prev, [vars.id]: "" }));
      toast.success("Passwort gespeichert (verschlüsselt).");
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
    const to = (email.trim() || access.email).trim();
    if (!to) {
      toast.error("Bitte E-Mail-Adresse des Steuerberaters eintragen.");
      return;
    }
    sendInvite.mutate({ id: access.id, email: to, password: password.trim() });
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
          <Label htmlFor="stb_password">Passwort (optional, min. 8 Zeichen)</Label>
          <Input
            id="stb_password"
            placeholder="Leer lassen für automatisches Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      {oneTimeCredential && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
          <div className="font-medium">Passwort nur jetzt sichtbar</div>
          <div className="mt-1 break-all font-mono text-lg">{oneTimeCredential.accessCode}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(oneTimeCredential.accessCode, "Passwort kopiert.")}
            >
              <Copy className="size-4" /> Passwort kopieren
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(oneTimeCredential.link, "Link kopiert.")}
            >
              <Copy className="size-4" /> Link kopieren
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOneTimeCredential(null)}>
              Ausblenden
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Nach dem Ausblenden kann dieses Passwort nicht erneut aus der Datenbank gelesen werden.
          </p>
        </div>
      )}

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
              onClick={() =>
                copy(linkFor(accesses[0]!.token), "Link in die Zwischenablage kopiert.")
              }
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
                    Passwort: verschlüsselt gespeichert (nicht mehr lesbar) ·{" "}
                    {new Date(a.expires_at).getFullYear() > 2100
                      ? "unbegrenzt gültig"
                      : `gültig bis ${formatDate(a.expires_at)}`}
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
                    placeholder="Neues Passwort (min. 8 Zeichen)"
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
