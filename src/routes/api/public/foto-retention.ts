import { createFileRoute } from "@tanstack/react-router";

/**
 * Automatische Aufbewahrungsfrist für Arbeitsnachweis-Fotos.
 *
 * Zugriffsschutz: ausschließlich über den geheimen Header `x-cron-secret`.
 * Der Server vergleicht nur SHA-256-Werte; es gibt keinen Datenbank-Fallback
 * mit einem Klartext-Token.
 */

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 10;
const attemptsByIp = new Map<string, number[]>();

/** Zeitkonstanter Vergleich gleich langer Zeichenketten. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Best-effort Edge-Drosselung pro Cloudflare-IP.
 * Sie begrenzt Brute-Force-Versuche innerhalb einer Worker-Instanz; der geheime
 * Token bleibt zusätzlich der eigentliche Zugriffsschutz.
 */
function allowAttempt(request: Request): boolean {
  const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  const now = Date.now();
  const recent = (attemptsByIp.get(ip) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    attemptsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  attemptsByIp.set(ip, recent);

  if (attemptsByIp.size > 500) {
    for (const [key, values] of attemptsByIp) {
      const alive = values.filter((ts) => now - ts < RATE_WINDOW_MS);
      if (alive.length === 0) attemptsByIp.delete(key);
      else attemptsByIp.set(key, alive);
    }
  }
  return true;
}

async function authorizedCronRequest(request: Request): Promise<boolean> {
  const presented = request.headers.get("x-cron-secret") ?? "";
  if (presented.length < 16) return false;

  const configuredHash = (process.env["CRON_SECRET_SHA256"] ?? "").trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(configuredHash)) {
    return safeEqual(await sha256Hex(presented), configuredHash);
  }

  // Übergangskompatibilität: falls nur CRON_SECRET gesetzt ist, wird auch
  // dieses vor dem Vergleich gehasht. Kein Klartext-Token wird aus der DB gelesen.
  const legacySecret = process.env["CRON_SECRET"] ?? "";
  if (legacySecret.length < 16) return false;
  return safeEqual(await sha256Hex(presented), await sha256Hex(legacySecret));
}

export const Route = createFileRoute("/api/public/foto-retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!allowAttempt(request)) {
          return new Response("Too Many Requests", {
            status: 429,
            headers: { "retry-after": String(RATE_WINDOW_MS / 1000) },
          });
        }

        if (!(await authorizedCronRequest(request))) {
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
