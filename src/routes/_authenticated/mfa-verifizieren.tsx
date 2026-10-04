import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/mfa-verifizieren")({
  component: MfaVerifyPage,
});

type Factor = { id: string; status: string; friendly_name?: string };

function MfaVerifyPage() {
  const navigate = useNavigate();
  const [factor, setFactor] = useState<Factor | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (aal?.currentLevel === "aal2") {
        await navigate({ to: "/dashboard", replace: true });
        return;
      }

      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (error) {
        toast.error("2FA-Status konnte nicht geladen werden.");
        setLoading(false);
        return;
      }
      const verified = ((data?.totp ?? []) as Factor[]).find((item) => item.status === "verified");
      if (!verified) {
        await navigate({ to: "/sicherheit", replace: true });
        return;
      }
      setFactor(verified);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  async function verify() {
    if (!factor || code.trim().length !== 6) return;
    setVerifying(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: code.trim(),
    });
    setVerifying(false);
    if (error) {
      toast.error("Der Sicherheitscode ist ungültig oder abgelaufen.");
      return;
    }
    toast.success("Sicherheitsstufe bestätigt.");
    await navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5" />
            <span className="text-sm font-medium">Zusätzlicher Zugriffsschutz</span>
          </div>
          <CardTitle>2FA bestätigen</CardTitle>
          <CardDescription>
            Dieser Bereich enthält besonders sensible Daten. Geben Sie den aktuellen 6-stelligen Code aus Ihrer Authenticator-App ein.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Sicherheitsstatus wird geprüft …
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="mfa-verify-code">Sicherheitscode</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    id="mfa-verify-code"
                    className="pl-9"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void verify();
                    }}
                    autoFocus
                  />
                </div>
              </div>
              <Button className="w-full" disabled={verifying || code.length !== 6} onClick={() => void verify()}>
                {verifying && <Loader2 className="mr-2 size-4 animate-spin" />}
                Zugriff bestätigen
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => void navigate({ to: "/dashboard" })}>
                Zurück zum Dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
