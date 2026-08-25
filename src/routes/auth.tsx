import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PasswordInput } from "@/components/PasswordInput";
import {
  requestAccountApproval,
  getApprovalStatus,
  recoverIncompleteAccount,
} from "@/lib/approval.functions";
import { sendAuthConfirmationEmail } from "@/lib/auth-mail.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Anmelden – Rechnungen & Angebote" },
      {
        name: "description",
        content: "Melden Sie sich an, um Angebote und Rechnungen zu verwalten und zu versenden.",
      },
      { property: "og:title", content: "Anmelden – Rechnungen & Angebote" },
      {
        property: "og:description",
        content: "Zugang zum Rechnungsprogramm für Reinigungsdienste.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [employeeCount, setEmployeeCount] = useState("1");
  const [legalForm, setLegalForm] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const canSubmit = password.length >= 6 && passwordsMatch;
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function ensureApproved(): Promise<boolean> {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return false;
    const { status } = await getApprovalStatus({ data: { authUserId: uid } });
    // Konten sind sofort aktiv; nur gesperrte Firmen werden abgewiesen.
    if (status === "blocked" || status === "rejected") {
      await supabase.auth.signOut();
      toast.error("Dieser Zugang wurde gesperrt. Bitte wenden Sie sich an den Anbieter.");
      return false;
    }
    return true;
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      toast.error("Anmeldung fehlgeschlagen: " + error.message);
      return;
    }
    // Zwei-Faktor-Authentifizierung: falls aktiv, Bestätigungscode abfragen.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      setLoading(false);
      setMfaRequired(true);
      return;
    }
    const ok = await ensureApproved();
    setLoading(false);
    if (!ok) return;
    navigate({ to: "/dashboard", replace: true });
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = (factors?.totp ?? [])[0];
    if (!factor) {
      setLoading(false);
      toast.error("Kein Sicherheitsgerät gefunden.");
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: mfaCode.trim(),
    });
    setLoading(false);
    if (error) {
      setLoading(false);
      toast.error("Code ungültig: " + error.message);
      return;
    }
    const ok = await ensureApproved();
    setLoading(false);
    if (!ok) return;
    navigate({ to: "/dashboard", replace: true });
  }

  async function forgotPassword() {
    if (!email) {
      toast.error("Bitte zuerst Ihre E-Mail-Adresse eingeben.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("E-Mail konnte nicht gesendet werden: " + error.message);
      return;
    }
    toast.success("Wir haben Ihnen einen Link zum Zurücksetzen des Passworts geschickt.");
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordsMatch) {
      toast.error("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim(), company_name: companyName.trim() },
      },
    });
    let userId = data.user?.id ?? null;

    if (error) {
      const alreadyRegistered =
        /already registered|already been registered|user already/i.test(error.message);
      if (!alreadyRegistered) {
        setLoading(false);
        toast.error("Registrierung fehlgeschlagen: " + error.message);
        return;
      }

      // E-Mail existiert bereits: unvollständige Konten werden zurückgesetzt.
      let recovery: { recovered: boolean; reason?: string } = { recovered: false };
      try {
        recovery = await recoverIncompleteAccount({
          data: {
            email: email.trim().toLowerCase(),
            password,
            fullName: fullName.trim(),
            companyName: companyName.trim(),
          },
        });
      } catch (err) {
        console.warn("Konto-Reparatur fehlgeschlagen:", err);
      }

      if (!recovery.recovered) {
        setLoading(false);
        toast.error(
          recovery.reason === "in_use"
            ? "Diese E-Mail-Adresse wird bereits aktiv genutzt. Bitte melden Sie sich an oder setzen Sie Ihr Passwort zurück."
            : "Registrierung fehlgeschlagen: " + error.message,
        );
        return;
      }
    }

    // Keine E-Mail-Bestätigung: falls noch keine Sitzung besteht, direkt anmelden.
    if (!data?.session) {
      const signedIn = await supabase.auth.signInWithPassword({ email, password });
      if (signedIn.error) {
        setLoading(false);
        toast.error("Anmeldung fehlgeschlagen: " + signedIn.error.message);
        return;
      }
      userId = signedIn.data.user?.id ?? userId;
    }

    // Konto ist sofort aktiv – inklusive 60 Tage kostenloser Testphase.
    if (userId) {
      try {
        await requestAccountApproval({
          data: {
            authUserId: userId,
            email: email.trim().toLowerCase(),
            fullName: fullName.trim(),
            companyName: companyName.trim(),
            employeeCount: Number(employeeCount) || 0,
            legalForm: legalForm.trim(),
          },
        });
      } catch (err) {
        console.warn("Firmendaten konnten nicht gespeichert werden:", err);
      }
    }

    setLoading(false);
    toast.success("Willkommen! Ihre kostenlose Testphase über 60 Tage läuft ab heute.");
    navigate({ to: "/dashboard", replace: true });
  }

  async function resendConfirmation() {
    if (!email) {
      toast.error("Bitte zuerst Ihre E-Mail-Adresse eingeben.");
      return;
    }
    setLoading(true);
    try {
      const res = await sendAuthConfirmationEmail({
        data: { email: email.trim().toLowerCase() },
      });
      if (res.sent) {
        toast.success("Bestätigungslink wurde erneut gesendet. Bitte prüfen Sie Ihr Postfach.");
      } else {
        toast.error("Zu dieser E-Mail-Adresse konnte kein Link gesendet werden.");
      }
    } catch (err) {
      toast.error(
        "Versand fehlgeschlagen: " + (err instanceof Error ? err.message : "Unbekannter Fehler"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google-Anmeldung fehlgeschlagen.");
      return;
    }
    if (result.redirected) return;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await requestAccountApproval({
        data: {
          authUserId: data.user.id,
          fullName: (data.user.user_metadata?.["full_name"] as string | undefined) ?? "",
          companyName: companyName.trim(),
        },
      }).catch(() => null);
    }
    navigate({ to: "/dashboard", replace: true });
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <img
            src="/app-icon-192.png?v=3"
            alt="GebCalc Logo"
            width={36}
            height={36}
            className="size-9 rounded-lg"
          />
          <span className="flex flex-col leading-tight text-left">
            <span className="font-display text-lg font-semibold">GebCalc</span>
            <span className="text-xs text-muted-foreground">Rechnungssystem</span>
          </span>
        </Link>

        <div className="surface p-6">
          {mfaRequired ? (
            <form onSubmit={verifyMfa} className="space-y-4">
              <div>
                <h1 className="font-display text-lg font-semibold">Bestätigungscode</h1>
                <p className="text-sm text-muted-foreground">
                  Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mfa">Code</Label>
                <Input
                  id="mfa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  dir="ltr"
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
                Bestätigen
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMfaRequired(false);
                  setMfaCode("");
                  void supabase.auth.signOut();
                }}
                className="w-full text-center text-sm text-muted-foreground underline"
              >
                Abbrechen
              </button>
            </form>
          ) : (
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Anmelden</TabsTrigger>
                <TabsTrigger value="register">Registrieren</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={signIn} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-Mail</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Passwort</Label>
                    <PasswordInput
                      id="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
                    Anmelden
                  </Button>
                  <button
                    type="button"
                    onClick={() => void forgotPassword()}
                    className="w-full text-center text-sm text-muted-foreground underline"
                  >
                    Passwort vergessen?
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={signUp} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name2">Name</Label>
                    <Input
                      id="name2"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">E-Mail</Label>
                    <Input
                      id="email2"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">Passwort (min. 6 Zeichen)</Label>
                    <PasswordInput
                      id="password2"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password3">Passwort wiederholen</Label>
                    <PasswordInput
                      id="password3"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p className="text-sm text-destructive">Die Passwörter stimmen nicht überein.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company2">Unternehmensname</Label>
                    <Input
                      id="company2"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="empcount2">Mitarbeitende</Label>
                      <Input
                        id="empcount2"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        dir="ltr"
                        required
                        value={employeeCount}
                        onChange={(e) => setEmployeeCount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="legal2">Rechtsform</Label>
                      <select
                        id="legal2"
                        required
                        value={legalForm}
                        onChange={(e) => setLegalForm(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Bitte wählen</option>
                        <option value="Einzelunternehmen">Einzelunternehmen</option>
                        <option value="GbR">GbR</option>
                        <option value="UG (haftungsbeschränkt)">UG (haftungsbeschränkt)</option>
                        <option value="GmbH">GmbH</option>
                        <option value="GmbH & Co. KG">GmbH &amp; Co. KG</option>
                        <option value="OHG">OHG</option>
                        <option value="KG">KG</option>
                        <option value="AG">AG</option>
                        <option value="Sonstige">Sonstige</option>
                      </select>
                    </div>
                  </div>
                  <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                    Sofort startklar: 60 Tage kostenlos testen – ohne Wartezeit und ohne
                    Zahlungsdaten.
                  </p>
                  <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
                    Konto erstellen &amp; 60 Tage testen
                  </Button>
                </form>

                <div className="mt-4 rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Keine Bestätigungs-E-Mail erhalten? Der Versand kann sich in seltenen Fällen
                    verzögern.
                  </p>
                  <button
                    type="button"
                    onClick={() => void resendConfirmation()}
                    disabled={loading}
                    className="mt-2 w-full text-center text-sm font-medium text-primary underline disabled:opacity-50"
                  >
                    Bestätigungslink erneut senden
                  </button>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {!mfaRequired && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                oder
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" className="w-full" onClick={google}>
                Mit Google fortfahren
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
