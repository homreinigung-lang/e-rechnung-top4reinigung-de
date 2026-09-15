import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PasswordInput } from "@/components/PasswordInput";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Neues Passwort festlegen – GebCalc" },
      {
        name: "description",
        content: "Legen Sie ein neues Passwort für Ihren Zugang zu GebCalc fest.",
      },
      { property: "og:title", content: "Neues Passwort festlegen" },
      { property: "og:description", content: "Passwort sicher zurücksetzen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkState, setLinkState] = useState<"checking" | "ready" | "invalid">("checking");

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) setLinkState("ready");
    });

    void (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const errorInUrl = url.searchParams.get("error") ?? hash.get("error");

      if (!errorInUrl && code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // A final session check below decides whether the link is usable.
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setLinkState(data.session ? "ready" : "invalid");
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("Passwort konnte nicht geändert werden: " + error.message);
      return;
    }
    toast.success("Passwort wurde geändert. Bitte melden Sie sich an.");
    navigate({ to: "/auth", replace: true });
  }

  if (linkState !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="surface w-full max-w-md space-y-4 p-6 text-center">
          <h1 className="font-display text-2xl font-semibold">Neues Passwort festlegen</h1>
          {linkState === "checking" ? (
            <p className="text-sm text-muted-foreground">Link wird geprüft …</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Dieser Link ist nicht mehr gültig – er wurde bereits verwendet oder ist abgelaufen.
                Bitte fordern Sie über „Passwort vergessen“ einen neuen Link an und öffnen Sie ihn
                direkt aus der E-Mail.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth", replace: true })}>
                Zur Anmeldung
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center font-display text-2xl font-semibold">
          Neues Passwort festlegen
        </h1>
        <form onSubmit={submit} className="surface space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="pw1">Neues Passwort (min. 6 Zeichen)</Label>
            <PasswordInput
              id="pw1"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw2">Passwort wiederholen</Label>
            <PasswordInput
              id="pw2"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            Passwort speichern
          </Button>
          <Link to="/auth" className="block text-center text-sm text-muted-foreground underline">
            Zurück zur Anmeldung
          </Link>
        </form>
      </div>
    </div>
  );
}
