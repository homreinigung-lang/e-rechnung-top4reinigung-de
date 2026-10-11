import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_DOMAIN, validHostingAddresses, isCurrentHttpsConnection } from "./dns-hosting";

type DohAnswer = { type: number; data: string };
async function resolveAddresses(provider: "google" | "cloudflare") {
  const url =
    provider === "google"
      ? `https://dns.google/resolve?name=${APP_DOMAIN}&type=A`
      : `https://cloudflare-dns.com/dns-query?name=${APP_DOMAIN}&type=A`;
  const response = await fetch(url, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`DNS-Abfrage fehlgeschlagen (${response.status}).`);
  const data = (await response.json()) as { Status?: number; Answer?: DohAnswer[] };
  if (data.Status !== 0) throw new Error("DNS-Auflösung derzeit nicht möglich.");
  return (data.Answer ?? []).filter((answer) => answer.type === 1).map((answer) => answer.data);
}

/** Check only this deployment; never fetch a user-controlled hostname. */
export const checkDomainDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    let aRecords: string[] = [];
    let aError: string | undefined;
    try {
      aRecords = await resolveAddresses("google").catch(() => resolveAddresses("cloudflare"));
    } catch {
      aError = "DNS-Abfrage derzeit nicht möglich. Bitte erneut prüfen.";
    }
    const aOk = validHostingAddresses(APP_DOMAIN, aRecords);
    // A successful authenticated HTTPS request on the exact public domain proves
    // this connection works. Do not self-fetch the Worker or claim a TLS audit.
    const httpsOk = isCurrentHttpsConnection(APP_DOMAIN, getRequest().url);
    const issues: string[] = [];
    if (aError) issues.push(aError);
    else if (!aRecords.length) issues.push(`Kein A-Record für ${APP_DOMAIN} gefunden.`);
    else if (!aOk)
      issues.push("Die A-Records liegen nicht vollständig in den Cloudflare-Netzbereichen.");
    if (!httpsOk)
      issues.push(
        `HTTPS-Verbindung nicht bestätigt. Öffnen Sie diese Prüfung unter https://${APP_DOMAIN}.`,
      );
    return {
      domain: APP_DOMAIN,
      checkedAt: new Date().toISOString(),
      aRecords,
      aError,
      aOk,
      httpsOk,
      issues,
      verified: aOk && httpsOk,
    };
  });
