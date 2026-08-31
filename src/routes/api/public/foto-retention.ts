import { createFileRoute } from "@tanstack/react-router";

/**
 * Automatische Aufbewahrungsfrist für Arbeitsnachweis-Fotos.
 *
 * Wird täglich per Zeitplan aufgerufen. Fotos, die älter als die in den
 * Firmeneinstellungen hinterlegte Frist sind, werden aus dem privaten Speicher
 * und aus dem Arbeitszeit-Eintrag entfernt. Rechnungen, Angebote, Vorlagen und
 * das GoBD-Archiv bleiben davon vollständig unberührt.
 *
 * Zugriffsschutz: ausschließlich über den geheimen Header `x-cron-secret`.
 * Gültig sind die Umgebungsvariable CRON_SECRET (manueller Aufruf) sowie der
 * in `public.cron_tokens` hinterlegte Auftragsschlüssel (Zeitplan). Der
 * öffentliche Browser-Schlüssel wird bewusst NICHT mehr akzeptiert.
 */

/** Zeitkonstanter Vergleich – verhindert Rückschlüsse über die Antwortzeit. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/foto-retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const presented = request.headers.get("x-cron-secret") ?? "";
        if (presented.length < 16) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const envSecret = process.env["CRON_SECRET"] ?? "";
        let authorized = envSecret.length > 0 && safeEqual(presented, envSecret);

        if (!authorized) {
          const { data: tokenRow } = await supabaseAdmin
            .from("cron_tokens")
            .select("token")
            .eq("name", "foto-retention")
            .maybeSingle();
          const dbToken = (tokenRow as { token?: string } | null)?.token ?? "";
          authorized = dbToken.length > 0 && safeEqual(presented, dbToken);
        }

        if (!authorized) return new Response("Unauthorized", { status: 401 });

        const { data: settings, error: settingsError } = await supabaseAdmin
          .from("company_settings")
          .select("user_id, photo_retention_days");
        if (settingsError) {
          return Response.json({ error: settingsError.message }, { status: 500 });
        }

        let entriesTouched = 0;
        let filesRemoved = 0;

        for (const s of settings ?? []) {
          const days = Number((s as { photo_retention_days?: number }).photo_retention_days ?? 0);
          if (!days || days <= 0) continue;

          const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
          const { data: entries, error } = await supabaseAdmin
            .from("time_entries")
            .select("id, photo_paths")
            .eq("user_id", (s as { user_id: string }).user_id)
            .lt("work_date", cutoff);
          if (error) continue;

          for (const e of entries ?? []) {
            const paths = ((e as { photo_paths?: string[] }).photo_paths ?? []) as string[];
            if (paths.length === 0) continue;
            await supabaseAdmin.storage.from("firmen-dateien").remove(paths);
            await supabaseAdmin
              .from("time_entries")
              .update({ photo_paths: [] } as never)
              .eq("id", (e as { id: string }).id);
            entriesTouched += 1;
            filesRemoved += paths.length;
          }
        }

        return Response.json({ ok: true, entriesTouched, filesRemoved });
      },
    },
  },
});
