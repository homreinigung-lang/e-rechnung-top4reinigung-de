import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * Anmeldemethoden verwalten: Passwort festlegen/ändern, damit ein bisher per
 * Google angemeldetes Konto zusätzlich mit E-Mail und Passwort nutzbar ist.
 * Es wird derselbe Benutzer-Account verwendet – alle Daten bleiben erhalten.
 */
export function LoginMethodsCard() {
  const [email, setEmail] = useState("");
  const [providers, setProviders] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setEmail(user.email ?? "");
      const list = (user.identities ?? []).map((i) => i.provider);
      setProviders(list.length ? list : [user.app_metadata?.provider ?? "email"]);
    });
  }, []);

  const hasPassword = providers.includes("email");

  async function save() {
    if (password.length < 6) {
      toast.error("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    if (password !== confirm) {
      toast.error("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("Passwort konnte nicht gespeichert werden: " + error.message);
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success(
      hasPassword
        ? "Passwort geändert."
        : "Passwort festgelegt. Sie können sich jetzt auch mit E-Mail und Passwort anmelden.",
    );
    const { data } = await supabase.auth.getUser();
    const list = (data.user?.identities ?? []).map((i) => i.provider);
    if (list.length) setProviders(list);
  }

  const labels: Record<string, string> = {
    google: "Google",
    email: "E-Mail & Passwort",
    apple: "Apple",
  };

  return (
    <div className="surface space-y-4 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Anmeldung & Passwort</h2>
        <p className="text-sm text-muted-foreground">
          Ihr Konto bleibt dasselbe – alle Daten, Zeiten und Einstellungen bleiben vollständig
          erhalten. Sie können sich anschließend wahlweise mit Google oder mit E-Mail und Passwort
          anmelden.
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">E-Mail: </span>
          <span dir="ltr">{email || "—"}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Aktive Anmeldemethoden: </span>
          {providers.map((p) => labels[p] ?? p).join(", ") || "—"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new_pw">
            {hasPassword ? "Neues Passwort" : "Passwort festlegen"} (min. 6 Zeichen)
          </Label>
          <Input
            id="new_pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new_pw2">Passwort wiederholen</Label>
          <Input
            id="new_pw2"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>

      <Button onClick={() => void save()} disabled={loading}>
        {hasPassword ? "Passwort ändern" : "Passwort festlegen"}
      </Button>
    </div>
  );
}
