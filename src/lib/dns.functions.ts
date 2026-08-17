import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  domain: z.string().trim().min(3).max(253),
  expected: z.string().trim().max(512).optional(),
});

type DohAnswer = { name: string; type: number; TTL?: number; data: string };

function clean(value: string) {
  return value.replace(/^"|"$/g, "").replace(/"\s*"/g, "").trim();
}

async function resolve(name: string, type: "TXT" | "A", resolver: "google" | "cloudflare") {
  const url =
    resolver === "google"
      ? `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`
      : `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) throw new Error(`DNS-Abfrage fehlgeschlagen (${resolver}, ${res.status})`);
  const json = (await res.json()) as { Answer?: DohAnswer[] };
  return (json.Answer ?? [])
    .filter((a) => (type === "TXT" ? a.type === 16 : a.type === 1))
    .map((a) => clean(a.data));
}

export const checkDomainDns = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const domain = data.domain
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    const parts = domain.split(".");
    const apex = parts.slice(-2).join(".");
    const txtNames = Array.from(new Set([`_lovable.${domain}`, `_lovable.${apex}`]));

    const txtRecords: { name: string; values: string[]; error?: string }[] = [];
    for (const name of txtNames) {
      try {
        const [g, c] = await Promise.all([
          resolve(name, "TXT", "google"),
          resolve(name, "TXT", "cloudflare").catch(() => [] as string[]),
        ]);
        txtRecords.push({ name, values: Array.from(new Set([...g, ...c])) });
      } catch (e) {
        txtRecords.push({ name, values: [], error: e instanceof Error ? e.message : String(e) });
      }
    }

    let aRecords: string[] = [];
    let aError: string | undefined;
    try {
      aRecords = await resolve(domain, "A", "google");
    } catch (e) {
      aError = e instanceof Error ? e.message : String(e);
    }

    const expected = data.expected ? clean(data.expected) : "";
    const allTxt = txtRecords.flatMap((r) => r.values);
    const issues: string[] = [];

    const aOk = aRecords.includes("185.158.133.1");
    if (!aRecords.length) issues.push(`Kein A-Record für ${domain} gefunden.`);
    else if (!aOk)
      issues.push(`A-Record zeigt auf ${aRecords.join(", ")} statt auf 185.158.133.1.`);

    let txtOk = false;
    if (!allTxt.length) {
      issues.push(`Kein TXT-Record _lovable gefunden (geprüft: ${txtNames.join(", ")}).`);
    } else if (expected) {
      txtOk = allTxt.some((v) => v === expected);
      if (!txtOk) {
        const near = allTxt.some((v) => v.toLowerCase() === expected.toLowerCase());
        issues.push(
          near
            ? `TXT-Wert stimmt nur bis auf Groß-/Kleinschreibung überein: „${allTxt.join(" | ")}“.`
            : `TXT-Wert weicht ab. Gefunden: „${allTxt.join(" | ")}“ – erwartet: „${expected}“.`,
        );
      }
    } else {
      txtOk = allTxt.some((v) => /^lovable_verify=\S{8,}$/.test(v));
      if (!txtOk)
        issues.push(
          `TXT-Wert sieht nicht wie ein gültiges Verify-Token aus: „${allTxt.join(" | ")}“. Erwartet wird „lovable_verify=<Code>“.`,
        );
    }

    let httpStatus: number | null = null;
    try {
      const res = await fetch(`https://${domain}/`, { method: "GET", redirect: "manual" });
      httpStatus = res.status;
    } catch {
      httpStatus = null;
    }
    const httpsOk = httpStatus !== null && httpStatus < 400;
    if (!httpsOk)
      issues.push(
        httpStatus === 409
          ? "HTTPS antwortet mit 409 – die Domain ist bei Lovable noch nicht verifiziert."
          : "HTTPS liefert noch kein gültiges Zertifikat/Antwort.",
      );

    return {
      domain,
      checkedAt: new Date().toISOString(),
      aRecords,
      aError,
      aOk,
      txtRecords,
      txtOk,
      expected,
      httpStatus,
      httpsOk,
      issues,
      verified: aOk && txtOk && httpsOk,
    };
  });
