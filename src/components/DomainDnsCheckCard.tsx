import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkDomainDns } from "@/lib/dns.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Globe, RefreshCw, XCircle } from "lucide-react";

const DOMAIN_KEY = "dns-check-domain";
const EXPECTED_KEY = "dns-check-expected";

function Row({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="break-all text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

const POLL_MS = 30_000;

export function DomainDnsCheckCard() {
  const [domain, setDomain] = useState("e-rechnung.top4reinigung.de");
  const [expected, setExpected] = useState("");
  const [autoCheck, setAutoCheck] = useState(true);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const check = useServerFn(checkDomainDns);

  useEffect(() => {
    const d = localStorage.getItem(DOMAIN_KEY);
    const e = localStorage.getItem(EXPECTED_KEY);
    if (d) setDomain(d);
    if (e) setExpected(e);
  }, []);

  const run = useMutation({
    mutationFn: async ({ silent }: { silent?: boolean } = {}) => {
      localStorage.setItem(DOMAIN_KEY, domain);
      localStorage.setItem(EXPECTED_KEY, expected);
      const r = await check({ data: { domain, expected: expected || undefined } });
      return { ...r, silent: silent ?? false };
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (r) => {
      setLastRun(new Date());
      if (r.verified) toast.success("Domain korrekt konfiguriert.");
      else if (!r.silent) toast.warning(`${r.issues.length} Abweichung(en) gefunden.`);
    },
  });

  const result = run.data;
  const verified = result?.verified ?? false;
  const runRef = useRef(run);
  runRef.current = run;

  // Erste automatische Prüfung, sobald Domain/erwarteter Wert stehen
  useEffect(() => {
    if (!autoCheck || verified) return;
    if (domain.trim().length < 3) return;
    const t = setTimeout(() => {
      if (!runRef.current.isPending) runRef.current.mutate({ silent: true });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck, domain, expected]);

  // Fortlaufende Prüfung bis verifiziert
  useEffect(() => {
    if (!autoCheck || verified) return;
    const id = setInterval(() => {
      if (!runRef.current.isPending) runRef.current.mutate({ silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [autoCheck, verified]);


  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Globe className="size-4 text-primary" />
        <h2 className="font-display text-base font-semibold">Domain- & DNS-Prüfung</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Vergleicht den beim Host hinterlegten TXT-Record <code>_lovable</code> live mit dem Wert aus
        dem Connect-Domain-Dialog und meldet jede Abweichung.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dns-domain">Domain</Label>
          <Input
            id="dns-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e-rechnung.top4reinigung.de"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dns-expected">Erwarteter TXT-Wert (aus dem Dialog)</Label>
          <Input
            id="dns-expected"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="lovable_verify=…"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => run.mutate({})}
          disabled={run.isPending || domain.trim().length < 3}
        >
          <RefreshCw className={run.isPending ? "size-4 animate-spin" : "size-4"} />
          {run.isPending ? "Prüfe…" : "Erneut prüfen (Retry)"}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-current"
            checked={autoCheck}
            onChange={(e) => setAutoCheck(e.target.checked)}
          />
          Automatisch alle 30 Sek. prüfen, bis verifiziert
        </label>
        {lastRun && (
          <span className="text-xs text-muted-foreground">
            Zuletzt geprüft: {lastRun.toLocaleTimeString("de-DE")}
          </span>
        )}
      </div>


      {result && (
        <div className="mt-5 space-y-3">
          <Row
            ok={result.aOk}
            label="A-Record → 185.158.133.1"
            value={result.aRecords.length ? result.aRecords.join(", ") : (result.aError ?? "kein Eintrag gefunden")}
          />
          {result.txtRecords.map((r) => (
            <Row
              key={r.name}
              ok={result.txtOk && r.values.length > 0}
              label={`TXT ${r.name}`}
              value={r.values.length ? r.values.join(" | ") : (r.error ?? "kein Eintrag gefunden")}
            />
          ))}
          {result.expected && (
            <Row ok={result.txtOk} label="Erwarteter Wert" value={result.expected} />
          )}
          <Row
            ok={result.httpsOk}
            label="HTTPS-Antwort"
            value={result.httpStatus === null ? "keine Antwort / kein Zertifikat" : `Status ${result.httpStatus}`}
          />

          {result.issues.length > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="size-4" /> Abweichungen
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {result.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-primary">Alle Einträge korrekt – Domain ist verifiziert.</p>
          )}
        </div>
      )}
    </section>
  );
}
