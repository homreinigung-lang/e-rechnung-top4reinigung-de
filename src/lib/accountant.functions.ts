import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export type AccountantReport = {
  companyName: string;
  documents: Row[];
  expenses: Row[];
  timeEntries: Row[];
  adjustments: Row[];
};

/** Kein Ablaufdatum: Zugang gilt dauerhaft. */
const NO_EXPIRY = "2999-12-31T00:00:00.000Z";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

/** Ablaufdatum aus einer optionalen Gültigkeitsdauer in Tagen. */
function expiryFrom(validDays?: number | null) {
  const days = Number(validDays ?? 0);
  if (!Number.isFinite(days) || days <= 0) return NO_EXPIRY;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Zufälliger Zugangscode (12 Zeichen, gut lesbar). */
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

/** Erstellt einen neuen Nur-Lese-Zugang für den Steuerberater. */
export const createAccountantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email?: string; password?: string; validDays?: number }) => ({
    email: (data.email ?? "").trim(),
    password: (data.password ?? "").trim(),
    validDays: Number(data.validDays ?? 0),
  }))
  .handler(async ({ data, context }) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    const accessCode = data.password ? normalizeCode(data.password) : randomCode();

    if (data.password && accessCode.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }

    const { hashAccessCode } = await import("./accountant-access.server");

    const { error } = await context.supabase.from("accountant_access").insert({
      user_id: context.userId,
      email: data.email,
      token,
      // Klartext wird nicht gespeichert – nur die Prüfsumme.
      access_code: "",
      access_code_hash: await hashAccessCode(token, accessCode),
      expires_at: expiryFrom(data.validDays),
    });
    if (error) throw new Error(error.message);

    return { token, accessCode };
  });

/** Setzt ein selbst gewähltes Passwort für einen bestehenden Zugang. */
export const setAccountantPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; password: string; validDays?: number }) => ({
    id: data.id,
    password: normalizeCode(data.password ?? ""),
    validDays: Number(data.validDays ?? 0),
  }))
  .handler(async ({ data, context }) => {
    if (data.password.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }
    const { data: access, error: loadError } = await context.supabase
      .from("accountant_access")
      .select("id, token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!access) throw new Error("Zugang nicht gefunden.");

    const { hashAccessCode } = await import("./accountant-access.server");

    const { error } = await context.supabase
      .from("accountant_access")
      .update({
        access_code: "",
        access_code_hash: await hashAccessCode(access.token as string, data.password),
        expires_at: expiryFrom(data.validDays),
        active: true,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, accessCode: data.password };
  });


/** Prüft Token + Passwort und liefert die Auswertung des Zeitraums (nur Lesen). */
export const getAccountantReport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<AccountantReport> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("./accountant-access.server");

    const access = await verifyAccountantAccess(data.token, data.code ?? "");

    const [documents, expenses, timeEntries, employees, adjustments, settings] = await Promise.all([
      supabaseAdmin
        .from("documents")
        .select("*")
        .eq("user_id", access.user_id)
        .eq("type", "invoice")
        // Wie in der Belegliste: keine Papierkorb-Belege, keine Stornorechnungen,
        // keine stornierten Originale.
        .is("deleted_at", null)
        .eq("is_storno", false)
        .neq("status", "cancelled")
        .gte("issue_date", data.from)
        .lte("issue_date", data.to)
        .order("issue_date"),
      supabaseAdmin
        .from("expenses")
        .select("*")
        .eq("user_id", access.user_id)
        .gte("expense_date", data.from)
        .lte("expense_date", data.to)
        .order("expense_date"),
      supabaseAdmin
        .from("time_entries")
        // Fotos (photo_paths) sind rein interne Nachweise – nie an den Steuerberater.
        .select(
          "id, user_id, employee_id, employee_name, customer_id, project_id, work_date, start_time, end_time, break_minutes, hours, hourly_rate, location, note, billed, entry_type, absence_reason, approval_status, decided_at, decided_by, decision_note, completed_at, created_at, updated_at",
        )
        .eq("user_id", access.user_id)
        .gte("work_date", data.from)
        .lte("work_date", data.to)
        .order("work_date"),
      supabaseAdmin
        .from("employees")
        .select("id, name, personnel_number, hourly_rate, weekly_hours, contract_type")
        .eq("user_id", access.user_id),
      supabaseAdmin
        .from("time_account_adjustments")
        .select("*")
        .eq("user_id", access.user_id)
        .gte("entry_date", data.from)
        .lte("entry_date", data.to)
        .order("entry_date"),
      supabaseAdmin
        .from("company_settings")
        .select("company_name")
        .eq("user_id", access.user_id)
        .maybeSingle(),
    ]);

    const empById = new Map(
      (employees.data ?? []).map((e) => [e.id as string, e as Record<string, unknown>]),
    );

    /** Kürzel für die Lohnabrechnung: A = Arbeit, U = Urlaub, K = Krank, F = Feiertag, S = Sonstige. */
    function absenceCode(entryType: string, reason: string) {
      if (entryType === "work") return "A";
      const r = (reason || "").toLowerCase();
      if (r.includes("krank") || r.includes("sick")) return "K";
      if (r.includes("urlaub") || r.includes("vacation")) return "U";
      if (r.includes("feiertag") || r.includes("holiday")) return "F";
      if (entryType === "vacation") return "U";
      if (entryType === "sick") return "K";
      if (entryType === "holiday") return "F";
      return "S";
    }

    const enrichedTime = (timeEntries.data ?? [])
      // Abgelehnte Anträge fließen nicht in die Lohnabrechnung ein.
      .filter((t) => String(t.approval_status ?? "") !== "rejected")
      .map((t) => {
        const emp = t.employee_id ? empById.get(t.employee_id as string) : undefined;
        const entryType = String(t.entry_type ?? "work");
        const code = absenceCode(entryType, String(t.absence_reason ?? ""));
        // Nur bestätigte (erledigte) Schichten zählen als Ist-Arbeitszeit.
        const confirmed =
          entryType !== "work" || Boolean(t.completed_at) || Number(t.hours ?? 0) > 0;
        return {
          ...t,
          employee_name: String(t.employee_name || emp?.["name"] || ""),
          personnel_number: String(emp?.["personnel_number"] ?? ""),
          contract_type: String(emp?.["contract_type"] ?? ""),
          weekly_hours: Number(emp?.["weekly_hours"] ?? 0),
          hourly_rate: Number(t.hourly_rate ?? emp?.["hourly_rate"] ?? 0),
          lohnart: code,
          is_absence: entryType !== "work",
          confirmed,
        };
      });

    return {
      companyName: settings.data?.company_name ?? "",
      documents: (documents.data ?? []) as unknown as Row[],
      expenses: (expenses.data ?? []) as unknown as Row[],
      timeEntries: enrichedTime as unknown as Row[],
      adjustments: (adjustments.data ?? []) as unknown as Row[],
    };
  });

/** Liefert eine zeitlich begrenzte Download-Adresse für den Beleg einer Ausgabe. */
export const getAccountantReceiptUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; expenseId: string }) => data)
  .handler(async ({ data }): Promise<string> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("./accountant-access.server");

    const access = await verifyAccountantAccess(data.token, data.code ?? "");

    const { data: expense } = await supabaseAdmin
      .from("expenses")
      .select("receipt_url")
      .eq("id", data.expenseId)
      .eq("user_id", access.user_id)
      .maybeSingle();

    const path = expense?.receipt_url ?? "";
    if (!path) throw new Error("Zu dieser Ausgabe ist kein Beleg hinterlegt.");
    if (/^https?:/.test(path)) return path;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("firmen-dateien")
      .createSignedUrl(path, 60 * 60);
    if (error || !signed?.signedUrl) throw new Error("Beleg konnte nicht geladen werden.");
    return signed.signedUrl;
  });

/** Liefert alle Belege eines Monats als Liste signierter Download-Adressen (ZIP-Export). */
export const getAccountantMonthReceipts = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; month: string }) => data)
  .handler(async ({ data }): Promise<Array<{ name: string; url: string }>> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("./accountant-access.server");

    const access = await verifyAccountantAccess(data.token, data.code ?? "");

    if (!/^\d{4}-\d{2}$/.test(data.month)) throw new Error("Ungültiger Monat.");
    const start = `${data.month}-01`;
    const [y, m] = data.month.split("-").map(Number);
    const endDate = new Date(Date.UTC(y!, m!, 1));
    const end = endDate.toISOString().slice(0, 10);

    const { data: expenses } = await supabaseAdmin
      .from("expenses")
      .select("id, expense_date, supplier, category, document_number, receipt_url")
      .eq("user_id", access.user_id)
      .gte("expense_date", start)
      .lt("expense_date", end)
      .order("expense_date", { ascending: true });

    const out: Array<{ name: string; url: string }> = [];
    let index = 1;
    for (const e of expenses ?? []) {
      const path = e.receipt_url ?? "";
      if (!path) continue;
      const ext = path.split(".").pop()?.toLowerCase() || "pdf";
      const label = [
        String(index).padStart(2, "0"),
        e.expense_date,
        (e.supplier || "Beleg")
          .replace(/[^\w\s-]+/g, "")
          .trim()
          .replace(/\s+/g, "-"),
        (e.category || "").replace(/[^\w-]+/g, ""),
      ]
        .filter(Boolean)
        .join("_");

      if (/^https?:/.test(path)) {
        out.push({ name: `${label}.${ext}`, url: path });
      } else {
        const { data: signed } = await supabaseAdmin.storage
          .from("firmen-dateien")
          .createSignedUrl(path, 60 * 30);
        if (signed?.signedUrl) out.push({ name: `${label}.${ext}`, url: signed.signedUrl });
      }
      index += 1;
    }

    return out;
  });

/**
 * Versendet den Steuerberater-Einladungslink direkt aus der App (Resend).
 * Es wird kein externes E-Mail-Programm geöffnet.
 */
export const sendAccountantInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; email: string; origin?: string; password?: string }) => ({
    id: String(data.id ?? ""),
    email: String(data.email ?? "").trim(),
    origin: String(data.origin ?? "").trim(),
    password: normalizeCode(String(data.password ?? "")),
  }))
  .handler(async ({ data, context }) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    }
    if (data.password && data.password.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }

    const { data: access, error } = await context.supabase
      .from("accountant_access")
      .select("id, token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!access) throw new Error("Zugang nicht gefunden.");

    // Das Passwort ist nur als Prüfsumme gespeichert und kann nicht mehr
    // ausgelesen werden. Für die Einladung wird deshalb ein neues Passwort
    // gesetzt (entweder das eingegebene oder ein zufälliges).
    const accessCode = data.password || randomCode();
    const { hashAccessCode } = await import("./accountant-access.server");
    const { error: pwError } = await context.supabase
      .from("accountant_access")
      .update({
        access_code: "",
        access_code_hash: await hashAccessCode(access.token as string, accessCode),
        active: true,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", access.id)
      .eq("user_id", context.userId);
    if (pwError) throw new Error(pwError.message);

    const { data: settings } = await context.supabase
      .from("company_settings")
      .select("company_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const companyName = settings?.company_name || "Ihr Mandant";
    const companyEmail = settings?.email || undefined;

    const { sendMail, siteUrl, escapeHtml } = await import("./approval-mail.server");
    const base = /^https?:\/\//.test(data.origin) ? data.origin.replace(/\/$/, "") : siteUrl();
    const link = `${base}/stb/${access.token}`;

    const subject = `Steuerberater-Zugang von ${companyName}`;
    const text = `Guten Tag,

anbei Ihr persönlicher Nur-Lese-Zugang zu den Rechnungen und Ausgaben von ${companyName} (DATEV- und Excel-Export inklusive).

Zugangs-Link: ${link}
Passwort: ${accessCode}

Bitte bewahren Sie das Passwort sicher auf – es kann aus Sicherheitsgründen nicht erneut angezeigt werden.

Mit freundlichen Grüßen
${companyName}`;

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;font-size:15px">
      <h2 style="margin:0 0 12px">Ihr Steuerberater-Zugang</h2>
      <p>Guten Tag,</p>
      <p>anbei Ihr persönlicher Nur-Lese-Zugang zu den Rechnungen und Ausgaben von <strong>${escapeHtml(companyName)}</strong> (DATEV- und Excel-Export inklusive).</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#0369a1;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Zugang öffnen</a></p>
      <p>Passwort: <strong>${escapeHtml(accessCode)}</strong></p>
      <p style="color:#64748b;font-size:13px">Falls der Button nicht funktioniert: ${escapeHtml(link)}</p>
      <p style="margin-top:28px;color:#64748b;font-size:12px">${escapeHtml(companyName)}</p>
    </div>`;


    const delivery = await sendMail({
      to: data.email,
      subject,
      html,
      text,
      companyName,
      ...(companyEmail ? { companyEmail } : {}),
    });

    if (data.email) {
      await context.supabase
        .from("accountant_access")
        .update({ email: data.email, invited_at: new Date().toISOString() })
        .eq("id", access.id)
        .eq("user_id", context.userId);
    }

    return { accepted: true as const, to: data.email, messageId: delivery.id };
  });


/** Authentifizierte, mandantenbezogene DATEV-Vorprüfung. Keine Buchungen werden verändert. */
export const getAccountantDatevReview = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("./accountant-access.server");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.from) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.to) || data.from > data.to) {
      throw new Error("Ungültiger Zeitraum.");
    }
    const access = await verifyAccountantAccess(data.token, data.code ?? "");
    const [settings, invoices, expenses] = await Promise.all([
      supabaseAdmin.from("company_datev_readiness").select("*")
        .eq("user_id", access.user_id).maybeSingle(),
      supabaseAdmin.from("company_datev_invoice_preparation").select("*")
        .eq("user_id", access.user_id).gte("issue_date", data.from)
        .lte("issue_date", data.to).order("issue_date"),
      supabaseAdmin.from("company_datev_expense_preparation").select("*")
        .eq("user_id", access.user_id).gte("expense_date", data.from)
        .lte("expense_date", data.to).order("expense_date"),
    ]);
    for (const result of [settings, invoices, expenses]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      settings: settings.data,
      invoices: invoices.data ?? [],
      expenses: expenses.data ?? [],
    };
  });
