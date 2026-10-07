import { useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PasswordInput } from "@/components/PasswordInput";
import {
  requestAccountApproval,
  getApprovalStatus,
  sendAccountRecoveryLink,
} from "@/lib/approval.functions";
import { sendAuthConfirmationEmail } from "@/lib/auth-mail.functions";
import { redeemInviteCode } from "@/lib/employee-invite.functions";
import { resolveStartRoute, resolveLoginEntry } from "@/lib/employee";
import {
  checkPasswordPolicy,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_LABEL,
} from "@/lib/password-policy";

export function AuthPage({ employeeOnly = false }: { employeeOnly?: boolean }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [employeeCount, setEmployeeCount] = useState("1");
  const [legalForm, setLegalForm] = useState("");

  const [inviteCode, setInviteCode] = useState("");
  const [invitedTab, setInvitedTab] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [employeeLinkRequired, setEmployeeLinkRequired] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const passwordPolicy = checkPasswordPolicy(password);
  const isEmployeeSignup = employeeOnly;
  const canSubmit =
    passwordPolicy.valid &&
    passwordsMatch &&
    (!isEmployeeSignup || inviteCode.replace(/[\s-]/g, "").length >= 4);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || cancelled) return;
      const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
        if (!cancelled) setMfaRequired(true);
        return;
      }
      const to = await resolveLoginEntry(employeeOnly);
      if (cancelled) return;
      if (to === "link-employee") {
        setEmployeeLinkRequired(true);
      } else {
        void navigate({ to, replace: true });
      }
    })().catch(() => {
      if (!cancelled) toast.error("Zugang konnte nicht geprüft werden. Bitte erneut anmelden.");
    });
    return () => {
      cancelled = true;
    };
  }, [employeeOnly, navigate]);

  // Einladungslink: /auth?code=XXXXXXXX öffnet direkt die Mitarbeiter-Registrierung.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code && !employeeOnly) {
      void navigate({ to: "/mitarbeiter-anmeldung", search: { code }, replace: true });
      return;
    }
    if (code) {
      setInviteCode(code.toUpperCase());
      setInvitedTab(true);
    }
  }, [employeeOnly, navigate]);

  async function ensureApproved(): Promise<boolean> {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return false;
    const { status } = await getApprovalStatus();
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
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      setLoading(false);
      toast.error("Sicherheitsprüfung fehlgeschlagen. Bitte erneut anmelden.");
      return;
    }
    if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      setLoading(false);
      setMfaRequired(true);
      return;
    }
    const ok = await ensureApproved();
    if (!ok) {
      setLoading(false);
      return;
    }
    const target = await resolveLoginEntry(employeeOnly);
    setLoading(false);
    if (target === "link-employee") {
      setMfaRequired(false);
      setEmployeeLinkRequired(true);
      return;
    }
    navigate({ to: target, replace: true });
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
    if (!ok) {
      setLoading(false);
      return;
    }
    const target = await resolveLoginEntry(employeeOnly);
    setLoading(false);
    if (target === "link-employee") {
      setMfaRequired(false);
      setEmployeeLinkRequired(true);
      return;
    }
    navigate({ to: target, replace: true });
  }

  async function linkExistingEmployee(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!(await ensureApproved())) return;
      const result = await redeemInviteCode({ data: { code: inviteCode.trim() } });
      if (!result.ok) {
        toast.error(
          result.reason === "not_precreated"
            ? "Ihr Arbeitgeber muss Sie zuerst mit der E-Mail-Adresse dieses Kontos im Personalbereich anlegen."
            : result.reason === "other_company"
              ? "Dieses Konto gehört bereits zu einer anderen Firma."
              : result.reason === "own_company"
                ? "Dieser Code gehört zu Ihrem eigenen Firmenkonto. Bitte nutzen Sie den Firmenzugang."
                : "Der Unternehmens-Code ist ungültig. Bitte fragen Sie Ihren Arbeitgeber.",
        );
        return;
      }
      toast.success("Ihr bestehendes Konto ist jetzt mit Ihrem Mitarbeiterzugang verknüpft.");
      navigate({ to: "/mein-bereich", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verknüpfung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
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

  /**
   * Mitarbeiter-Registrierung: kein Firmenkonto, keine Testphase, keine
   * Abrechnung. Das Konto wird ausschließlich mit einem bestehenden
   * Mitarbeiter-Stammsatz der einladenden Firma verknüpft.
   */
  async function signUpEmployee() {
    const code = inviteCode.replace(/[\s-]/g, "").toUpperCase();
    if (code.length < 4) {
      toast.error("Bitte geben Sie den Unternehmens-Code Ihres Arbeitgebers ein.");
      return;
    }
    setLoading(true);
    const mail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signUp({
      email: mail,
      password,
      options: { data: { full_name: fullName.trim(), account_type: "employee" } },
    });
    if (error && !/already registered|already been registered|user already/i.test(error.message)) {
      setLoading(false);
      toast.error("Registrierung fehlgeschlagen: " + error.message);
      return;
    }
    const signedIn = await supabase.auth.signInWithPassword({ email: mail, password });
    if (signedIn.error) {
      setLoading(false);
      toast.error(
        "Anmeldung fehlgeschlagen: " +
          signedIn.error.message +
          " Bitte prüfen Sie Ihr Passwort oder nutzen Sie „Passwort vergessen“.",
      );
      return;
    }

    let result: Awaited<ReturnType<typeof redeemInviteCode>> | null = null;
    try {
      result = await redeemInviteCode({ data: { code, fullName: fullName.trim() } });
    } catch (err) {
      console.warn("Code-Prüfung fehlgeschlagen:", err);
    }

    if (!result?.ok) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error(
        result?.reason === "other_company"
          ? "Dieses Konto gehört bereits zu einer anderen Firma."
          : result?.reason === "own_company"
            ? "Dieser Code gehört zu Ihrem eigenen Firmenkonto."
            : result?.reason === "not_precreated"
              ? "Kein vorbereiteter Mitarbeiterzugang für diese E-Mail-Adresse gefunden. Bitte bitten Sie Ihren Arbeitgeber, Sie zuerst im Personalbereich mit genau dieser E-Mail-Adresse anzulegen."
              : "Der Unternehmens-Code ist ungültig. Bitte fragen Sie Ihren Arbeitgeber nach einem gültigen Einladungscode.",
      );
      return;
    }

    setLoading(false);
    toast.success("Willkommen! Ihr Mitarbeiterzugang ist aktiv.");
    navigate({ to: "/mein-bereich", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordPolicy.valid) {
      toast.error(PASSWORD_POLICY_LABEL);
      return;
    }
    if (!passwordsMatch) {
      toast.error("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (isEmployeeSignup) {
      await signUpEmployee();
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
      const alreadyRegistered = /already registered|already been registered|user already/i.test(
        error.message,
      );
      if (!alreadyRegistered) {
        setLoading(false);
        toast.error("Registrierung fehlgeschlagen: " + error.message);
        return;
      }

      // E-Mail existiert bereits: aus Sicherheitsgründen wird kein Passwort
      // gesetzt, sondern ein Link zum Zurücksetzen an die Adresse geschickt.
      try {
        await sendAccountRecoveryLink({ data: { email: email.trim().toLowerCase() } });
      } catch (err) {
        console.warn("Zurücksetz-Link konnte nicht gesendet werden:", err);
      }
      setLoading(false);
      toast.info(
        "Diese E-Mail-Adresse ist bereits registriert. Wir haben Ihnen einen Link zum Zurücksetzen des Passworts geschickt.",
      );
      return;
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
      await sendAuthConfirmationEmail({
        data: { email: email.trim().toLowerCase() },
      });
      toast.success(
        "Falls ein Konto zu dieser Adresse besteht, haben wir einen Link gesendet. Bitte prüfen Sie Ihr Postfach.",
      );
    } catch (err) {
      toast.error(
        "Versand fehlgeschlagen: " + (err instanceof Error ? err.message : "Unbekannter Fehler"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error("Google-Anmeldung fehlgeschlagen.");
      return;
    }
    if (data.url) return;
    const { data: userData } = await supabase.auth.getUser();
    // Mitarbeiterkonten niemals als Firma anlegen.
    const target = await resolveStartRoute();
    if (userData.user && target === "/dashboard") {
      await requestAccountApproval({
        data: {
          authUserId: userData.user.id,
          fullName: (userData.user.user_metadata?.["full_name"] as string | undefined) ?? "",
          companyName: companyName.trim(),
        },
      }).catch(() => null);
    }
    navigate({ to: target, replace: true });
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
            <span className="text-xs text-muted-foreground">
              {employeeOnly ? "Mitarbeiterportal" : "Rechnungssystem"}
            </span>
          </span>
        </Link>

        <div className="surface p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            {employeeOnly
              ? "Für Mitarbeitende: eigene Einsätze, Zeiten, Meldungen und Chat. Zur Registrierung benötigen Sie den Unternehmens-Code Ihres Arbeitgebers."
              : "Für Unternehmen: Verwaltung, Rechnungen und Personal."}
          </p>
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
              <Button type="submit" className="w-full" disabled={loading}>
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
          ) : employeeLinkRequired ? (
            <form onSubmit={linkExistingEmployee} className="space-y-4">
              <h1 className="font-display text-lg font-semibold">Bestehendes Konto verknüpfen</h1>
              <p className="text-sm text-muted-foreground">
                Sie sind bereits angemeldet. Ihr Konto ist noch keinem Mitarbeiterzugang zugeordnet.
                Geben Sie einmalig den Unternehmens-Code Ihres Arbeitgebers ein. Ihr Arbeitgeber
                muss Sie zuvor mit der E-Mail-Adresse dieses Kontos im Personalbereich angelegt
                haben.
              </p>
              <div className="space-y-2">
                <Label htmlFor="existing-invite">Unternehmens-Code</Label>
                <Input
                  id="existing-invite"
                  required
                  dir="ltr"
                  autoComplete="off"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading || inviteCode.replace(/[\s-]/g, "").length < 4}
              >
                Mitarbeiterzugang aktivieren
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  await supabase.auth.signOut();
                  setEmployeeLinkRequired(false);
                  setPassword("");
                  setConfirmPassword("");
                }}
              >
                Mit anderem Konto anmelden
              </Button>
            </form>
          ) : (
            <Tabs
              key={invitedTab ? "register" : "login"}
              defaultValue={invitedTab ? "register" : "login"}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Anmelden</TabsTrigger>
                <TabsTrigger value="register">Registrieren</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                {employeeOnly && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Schon registriert? Melden Sie sich mit Ihrem bestehenden Konto an. Ein
                    verknüpfter Mitarbeiterzugang öffnet direkt Ihren Bereich; andernfalls
                    verknüpfen Sie das Konto einmalig mit dem Unternehmens-Code.
                  </p>
                )}
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
                  <Button type="submit" className="w-full" disabled={loading}>
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
                {employeeOnly && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Schon registriert? Wechseln Sie oben zu „Anmelden“ und verwenden Sie Ihr
                    vorhandenes Passwort. Sie benötigen kein neues Konto.
                  </p>
                )}
                <div className="mt-6 space-y-2">
                  <h1 className="font-display text-lg font-semibold">
                    {employeeOnly ? "Mitarbeiterzugang erstellen" : "Firma registrieren"}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {isEmployeeSignup
                      ? "Ihr Arbeitgeber muss Sie zuvor mit dieser E-Mail-Adresse im Personalbereich angelegt haben. Kein Zugriff auf Rechnungen oder Firmeneinstellungen."
                      : "Für Inhaber und Verwaltung: volle Rechte für Rechnungen, Kunden und Abrechnung."}
                  </p>
                </div>
                <form onSubmit={signUp} className="mt-4 space-y-4">
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
                    <Label htmlFor="password2">Passwort</Label>
                    <PasswordInput
                      id="password2"
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_LABEL}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password3">Passwort wiederholen</Label>
                    <PasswordInput
                      id="password3"
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p className="text-sm text-destructive">
                        Die Passwörter stimmen nicht überein.
                      </p>
                    )}
                  </div>
                  {isEmployeeSignup && (
                    <div className="space-y-2">
                      <Label htmlFor="invite">Unternehmens-Code</Label>
                      <Input
                        id="invite"
                        required
                        dir="ltr"
                        autoComplete="off"
                        placeholder="z. B. A1B2C3D4"
                        className="font-mono tracking-widest uppercase"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      />
                      <p className="text-xs text-muted-foreground">
                        Diesen Code (oder einen Einladungslink) erhalten Sie von Ihrem Arbeitgeber.
                        Ohne gültigen Code ist keine Registrierung möglich.
                      </p>
                    </div>
                  )}

                  {!isEmployeeSignup && (
                    <>
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
                    </>
                  )}
                  <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
                    {isEmployeeSignup
                      ? "Mitarbeiterzugang erstellen"
                      : "Konto erstellen & 60 Tage testen"}
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

          {!mfaRequired && !employeeOnly && (
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
        <p className="mt-4 text-center text-sm">
          {employeeOnly ? (
            <Link to="/auth" className="text-primary underline">
              Zum Firmenzugang
            </Link>
          ) : (
            <Link to="/mitarbeiter-anmeldung" className="text-primary underline">
              Zum Mitarbeiterzugang
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
