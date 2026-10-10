import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { PasswordInput } from "@/components/PasswordInput";

import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_LABEL } from "@/lib/password-policy";

import type { AuthPageState } from "./useAuthPageState";
export function AuthPageBestätigungscode({ state }: { state: AuthPageState }) {
  const {
    canSubmit,
    companyName,
    confirmPassword,
    email,
    employeeCount,
    employeeLinkRequired,
    employeeOnly,
    forgotPassword,
    fullName,
    google,
    inviteCode,
    invitedTab,
    isEmployeeSignup,
    legalForm,
    linkExistingEmployee,
    loading,
    mfaCode,
    mfaRequired,
    password,
    passwordsMatch,
    resendConfirmation,
    setCompanyName,
    setConfirmPassword,
    setEmail,
    setEmployeeCount,
    setEmployeeLinkRequired,
    setFullName,
    setInviteCode,
    setLegalForm,
    setMfaCode,
    setMfaRequired,
    setPassword,
    signIn,
    signUp,
    verifyMfa,
  } = state;
  return (
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
              Geben Sie einmalig den Unternehmens-Code Ihres Arbeitgebers ein. Ihr Arbeitgeber muss
              Sie zuvor mit der E-Mail-Adresse dieses Kontos im Personalbereich angelegt haben.
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
                  Schon registriert? Melden Sie sich mit Ihrem bestehenden Konto an. Ein verknüpfter
                  Mitarbeiterzugang öffnet direkt Ihren Bereich; andernfalls verknüpfen Sie das
                  Konto einmalig mit dem Unternehmens-Code.
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
  );
}
