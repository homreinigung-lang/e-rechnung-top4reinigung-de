import { createFileRoute } from "@tanstack/react-router";

/**
 * Freigabe oder Ablehnung einer neuen Registrierung über den Link aus der
 * Inhaber-E-Mail. Der Zugriff wird ausschließlich über das lange Einmal-Token
 * abgesichert; ein verbrauchtes Token funktioniert nicht mehr.
 *
 * Wichtig: Der Aufruf per Link (GET) zeigt nur eine Bestätigungsseite an.
 * Die eigentliche Aktion läuft über das Absenden des Formulars (POST), damit
 * E-Mail-Scanner und Linkvorschauen keine Konten freischalten oder löschen.
 */
function page(title: string, message: string, form?: { token: string; aktion: string }) {
  const button =
    form &&
    `<form method="post" action="/api/public/konto-freigabe" style="margin-top:20px">
<input type="hidden" name="token" value="${form.token}">
<input type="hidden" name="aktion" value="${form.aktion}">
<button type="submit" style="background:${form.aktion === "freigeben" ? "#0369a1" : "#b91c1c"};color:#fff;border:0;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:bold;cursor:pointer">
${form.aktion === "freigeben" ? "Jetzt freigeben" : "Jetzt ablehnen"}</button></form>`;

  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="background:#fff;padding:32px;border-radius:14px;box-shadow:0 8px 24px rgba(15,23,42,.08);max-width:480px">
<h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="margin:0;color:#475569">${message}</p>${button ?? ""}</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function escapeAttr(value: string): string {
  return value.replace(/[<>"'&]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function validParams(token: string, aktion: string): boolean {
  return (
    token.length >= 32 && /^[A-Za-z0-9_-]+$/.test(token) && ["freigeben", "ablehnen"].includes(aktion)
  );
}

async function performAction(token: string, aktion: string): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const mail = await import("@/lib/approval-mail.server");

  const { data: row } = await supabaseAdmin
    .from("account_approvals")
    .select("id, auth_user_id, email, full_name, status")
    .eq("token", token)
    .maybeSingle();

  if (!row) return page("Ungültiger Link", "Dieser Freigabe-Link ist nicht mehr gültig.");
  if (row.status !== "pending") {
    return page(
      "Bereits bearbeitet",
      `Diese Registrierung wurde bereits ${row.status === "approved" ? "freigegeben" : "abgelehnt"}.`,
    );
  }

  const base = mail.siteUrl();

  if (aktion === "freigeben") {
    await supabaseAdmin
      .from("account_approvals")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", row.id);

    try {
      const body = mail.welcomeMail(`${base}/auth`);
      await mail.sendMail({
        to: row.email,
        subject: "Ihr Zugang wurde freigeschaltet",
        text: body.text,
        html: body.html,
        // Reine Info-Mail ohne Zugangs-Link: Bestätigungskopie an die Firmen-Adresse.
        companyEmail: mail.OWNER_EMAIL,
      });
    } catch (e) {
      console.error("Willkommens-E-Mail fehlgeschlagen:", e);
    }

    return page(
      "Konto freigegeben",
      `${mail.escapeHtml(row.email)} kann sich ab sofort anmelden. Eine Willkommens-E-Mail wurde versendet.`,
    );
  }

  try {
    const body = mail.rejectionMail();
    await mail.sendMail({
      to: row.email,
      subject: "Ihre Registrierung wurde abgelehnt",
      text: body.text,
      html: body.html,
      // Reine Info-Mail: Bestätigungskopie an die Firmen-Adresse.
      companyEmail: mail.OWNER_EMAIL,
    });
  } catch (e) {
    console.error("Ablehnungs-E-Mail fehlgeschlagen:", e);
  }

  await supabaseAdmin.auth.admin.deleteUser(row.auth_user_id).catch(() => undefined);
  await supabaseAdmin.from("account_approvals").delete().eq("id", row.id);

  return page(
    "Registrierung abgelehnt",
    `Der Zugang von ${mail.escapeHtml(row.email)} wurde entfernt und die Person informiert.`,
  );
}

export const Route = createFileRoute("/api/public/konto-freigabe")({
  server: {
    handlers: {
      // Nur Anzeige der Bestätigungsseite – verändert nichts.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const aktion = url.searchParams.get("aktion") ?? "";
        if (!validParams(token, aktion)) {
          return page("Ungültiger Link", "Dieser Freigabe-Link ist nicht gültig.");
        }
        return page(
          aktion === "freigeben" ? "Registrierung freigeben?" : "Registrierung ablehnen?",
          aktion === "freigeben"
            ? "Bitte bestätigen Sie die Freigabe. Die Person erhält anschließend eine Willkommens-E-Mail."
            : "Bitte bestätigen Sie die Ablehnung. Der Zugang wird dauerhaft entfernt.",
          { token: escapeAttr(token), aktion },
        );
      },

      // Führt die Entscheidung aus.
      POST: async ({ request }) => {
        const form = await request.formData();
        const token = String(form.get("token") ?? "");
        const aktion = String(form.get("aktion") ?? "");
        if (!validParams(token, aktion)) {
          return page("Ungültiger Link", "Dieser Freigabe-Link ist nicht gültig.");
        }
        return performAction(token, aktion);
      },
    },
  },
});
