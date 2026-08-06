import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PasswordInput } from "@/components/PasswordInput";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Neues Passwort festlegen – Hom R Office" },
      {
        name: "description",
        content: "Legen Sie ein neues Passwort für Ihren Zugang zu Hom R Office fest.",
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
