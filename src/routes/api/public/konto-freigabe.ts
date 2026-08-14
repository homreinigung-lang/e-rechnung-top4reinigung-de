import { createFileRoute } from "@tanstack/react-router";

/**
 * Freigabe oder Ablehnung einer neuen Registrierung über den Link aus der
 * Inhaber-E-Mail. Der Zugriff wird ausschließlich über das lange Einmal-Token
 * abgesichert; ein verbrauchtes Token funktioniert nicht mehr.
 */
function page(title: string, message: string) {
  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="background:#fff;padding:32px;border-radius:14px;box-shadow:0 8px 24px rgba(15,23,42,.08);max-width:480px">
<h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="margin:0;color:#475569">${message}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/konto-freigabe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const aktion = url.searchParams.get("aktion") ?? "";
        if (token.length < 32 || !["freigeben", "ablehnen"].includes(aktion)) {
          return page("Ungültiger Link", "Dieser Freigabe-Link ist nicht gültig.");
        }

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
      },
    },
  },
});
