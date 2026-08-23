import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

type Factor = { id: string; status: string; friendly_name?: string | undefined };

/**
 * Zwei-Faktor-Authentifizierung (TOTP) für Administrator-Konten:
 * Beim Anmelden wird zusätzlich ein 6-stelliger Code aus einer
 * Authenticator-App (z. B. Google Authenticator) abgefragt.
 */
export function TwoFactorCard() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(false);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  async function refresh() {
    const { data } = await supabase.auth.mfa.listFactors();
    const list = (data?.totp ?? []) as Factor[];
    setFactors(list);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const active = factors.filter((f) => f.status === "verified");

  async function start() {
    setLoading(true);
    // Nicht verifizierte Reste aufräumen, damit die Einrichtung immer klappt.
    for (const f of factors.filter((x) => x.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `GebCalc ${new Date().getTime()}`,
    });
    setLoading(false);
    if (error || !data) {
      toast.error("Einrichtung fehlgeschlagen: " + (error?.message ?? "unbekannter Fehler"));
      return;
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enroll) return;
    setLoading(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enroll.id,
      code: code.trim(),
    });
    setLoading(false);
    if (error) {
      toast.error("Code ungültig: " + error.message);
      return;
    }
    setEnroll(null);
    setCode("");
    await refresh();
    toast.success("Zwei-Faktor-Authentifizierung ist aktiv.");
  }

  async function disable(factorId: string) {
    setLoading(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setLoading(false);
    if (error) {
      toast.error("Deaktivierung fehlgeschlagen: " + error.message);
      return;
    }
    await refresh();
    toast.success("Zwei-Faktor-Authentifizierung deaktiviert.");
  }

  return (
    <div className="surface space-y-4 p-6">
      <div className="flex items-start gap-3">
        {active.length > 0 ? (
          <ShieldCheck className="mt-0.5 size-5 text-primary" />
        ) : (
          <ShieldAlert className="mt-0.5 size-5 text-muted-foreground" />
        )}
        <div>
          <h2 className="font-display text-lg font-semibold">
            Zwei-Faktor-Authentifizierung (2FA)
          </h2>
          <p className="text-sm text-muted-foreground">
            Zusätzliche Sicherheitsstufe: Beim Anmelden wird neben dem Passwort ein 6-stelliger Code
            aus Ihrer Authenticator-App abgefragt. Dringend empfohlen für alle Administrator-Konten.
          </p>
        </div>
      </div>

      {active.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">2FA ist aktiv.</p>
          {active.map((f) => (
            <Button
              key={f.id}
              variant="outline"
              disabled={loading}
              onClick={() => void disable(f.id)}
            >
              Zwei-Faktor-Anmeldung deaktivieren
            </Button>
          ))}
        </div>
      ) : enroll ? (
        <div className="space-y-4">
          <p className="text-sm">
            1. Scannen Sie den QR-Code mit Ihrer Authenticator-App (Google Authenticator, Microsoft
            Authenticator, 1Password …).
          </p>
          <img
            src={enroll.qr}
            alt="QR-Code zur Einrichtung der Zwei-Faktor-Authentifizierung"
            className="size-44 rounded-md border bg-card p-2"
          />
          <p className="text-xs text-muted-foreground">
            Alternativ manuell eintragen: <span dir="ltr">{enroll.secret}</span>
          </p>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="mfa_code">2. Bestätigungscode aus der App</Label>
            <Input
              id="mfa_code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={loading || code.trim().length < 6} onClick={() => void verify()}>
              {loading && <Loader2 className="size-4 animate-spin" />} Aktivieren
            </Button>
            <Button variant="ghost" onClick={() => setEnroll(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <Button disabled={loading} onClick={() => void start()}>
          {loading && <Loader2 className="size-4 animate-spin" />} 2FA jetzt einrichten
        </Button>
      )}
    </div>
  );
}
