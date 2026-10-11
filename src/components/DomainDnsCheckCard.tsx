import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkDomainDns } from "@/lib/dns.functions";
import { APP_DOMAIN } from "@/lib/dns-hosting";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Globe, RefreshCw, XCircle, CircleHelp } from "lucide-react";

function Row({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  const Icon = ok === null ? CircleHelp : ok ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${ok === null ? "text-muted-foreground" : ok ? "text-primary" : "text-destructive"}`}
      />
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="break-all text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

export function DomainDnsCheckCard() {
  const [autoCheck, setAutoCheck] = useState(true);
  const check = useServerFn(checkDomainDns);
  const run = useMutation({
    mutationFn: async ({ silent = false }: { silent?: boolean } = {}) => ({
      ...(await check()),
      silent,
    }),
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (r) => {
      if (r.silent) return;
      if (r.verified) toast.success("Cloudflare-DNS und HTTPS-Verbindung bestätigt.");
      else toast.warning("Prüfung nicht vollständig bestätigt.");
    },
  });
  const result = run.data;
  const verified = result?.verified ?? false;
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!autoCheck || verified) return;
    const checkNow = () => {
      if (!runRef.current.isPending) runRef.current.mutate({ silent: true });
    };
    const first = setTimeout(checkNow, 400);
    const timer = setInterval(checkNow, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [autoCheck, verified]);
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Globe className="size-4 text-primary" />
        <h2 className="font-display text-base font-semibold">Domain- &amp; DNS-Prüfung</h2>
      </div>
      <p className="mb-2 text-sm text-muted-foreground">
        Prüft die öffentlichen Cloudflare-A-Records und die aktuelle HTTPS-Verbindung dieser
        Website.
      </p>
      <p className="break-all text-sm font-medium">{APP_DOMAIN}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => run.mutate({})} disabled={run.isPending}>
          <RefreshCw className={run.isPending ? "size-4 animate-spin" : "size-4"} />
          {run.isPending ? "Prüfe…" : "Erneut prüfen"}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-current"
            checked={autoCheck}
            onChange={(e) => setAutoCheck(e.target.checked)}
          />
          Automatisch alle 30 Sek. prüfen, bis bestätigt
        </label>
        {result && (
          <span className="text-xs text-muted-foreground">
            Zuletzt geprüft: {new Date(result.checkedAt).toLocaleTimeString("de-DE")}
          </span>
        )}
      </div>
      {result && (
        <div className="mt-5 space-y-3">
          <Row
            ok={result.aError ? null : result.aOk}
            label="A-Records → Cloudflare"
            value={
              result.aRecords.length
                ? result.aRecords.join(", ")
                : (result.aError ?? "Kein Eintrag gefunden")
            }
          />
          <Row
            ok={result.httpsOk ? true : null}
            label="Aktuelle HTTPS-Verbindung"
            value={
              result.httpsOk
                ? "Bestätigt – diese Prüfung wurde über HTTPS auf der angegebenen Domain ausgeführt."
                : "Nicht bestätigt – kein Nachweis für einen Zertifikatsfehler."
            }
          />
          {result.issues.length > 0 ? (
            <div className="rounded-md border p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4" />
                Prüfhinweise
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {result.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-primary">
              Cloudflare-DNS und aktuelle HTTPS-Verbindung bestätigt.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
