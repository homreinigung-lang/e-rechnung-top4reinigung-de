import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";

import {
  requestAccountApproval,
  getApprovalStatus,
  sendAccountRecoveryLink,
} from "@/lib/approval.functions";
import { sendAuthConfirmationEmail } from "@/lib/auth-mail.functions";
import { redeemInviteCode } from "@/lib/employee-invite.functions";
import { resolveStartRoute, resolveLoginEntry } from "@/lib/employee";
import { checkPasswordPolicy, PASSWORD_POLICY_LABEL } from "@/lib/password-policy";

export function useAuthPageState({ employeeOnly = false }: { employeeOnly?: boolean }) {
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
  const [companySignupId, setCompanySignupId] = useState<string | null>(null);
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
    if (!fullName.trim() || !companyName.trim()) {
      toast.error("Bitte Ihren vollständigen Namen und den Firmennamen eingeben.");
      return;
    }
    setLoading(true);
    if (companySignupId) {
      await finishCompanyRegistration(companySignupId);
      return;
    }
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

    if (!userId) {
      setLoading(false);
      toast.error("Bitte Ihre E-Mail bestätigen und erneut anmelden.");
      return;
    }
    setCompanySignupId(userId);
    await finishCompanyRegistration(userId);
  }

  async function finishCompanyRegistration(userId: string) {
    try {
      const registration = await requestAccountApproval({
        data: {
          authUserId: userId,
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
          companyName: companyName.trim(),
          employeeCount: Number(employeeCount) || 0,
          legalForm: legalForm.trim(),
        },
      });
      if (registration.status !== "approved") {
        await supabase.auth.signOut();
        setLoading(false);
        toast.error("Dieses Firmenkonto ist gesperrt. Bitte kontaktieren Sie die Verwaltung.");
        return;
      }
    } catch (err) {
      console.warn("Firmendaten konnten nicht gespeichert werden:", err);
      setLoading(false);
      toast.error("Registrierung konnte nicht abgeschlossen werden. Bitte erneut versuchen.");
      return;
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

  return {
    ready: true as const,
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
  };
}
export type AuthPageState = Extract<ReturnType<typeof useAuthPageState>, { ready: true }>;
