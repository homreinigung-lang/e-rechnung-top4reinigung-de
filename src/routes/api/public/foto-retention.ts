import { createFileRoute } from "@tanstack/react-router";

/**
 * Automatische Aufbewahrungsfrist für Arbeitsnachweis-Fotos.
 *
 * Wird täglich per Zeitplan aufgerufen. Fotos, die älter als die in den
 * Firmeneinstellungen hinterlegte Frist sind, werden aus dem privaten Speicher
 * und aus dem Arbeitszeit-Eintrag entfernt. Rechnungen, Angebote, Vorlagen und
 * das GoBD-Archiv bleiben davon vollständig unberührt.
 */
export const Route = createFileRoute("/api/public/foto-retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env["SUPABASE_PUBLISHABLE_KEY"]) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
