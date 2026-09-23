import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Chart = "SKR03" | "SKR04";
type Account = { account_number: string; account_name: string; category: string };
const mappingLabels: Record<string, string> = {
  revenue_domestic_19: "Erlöse Inland 19 % (nur nach steuerlicher Prüfung)",
  expense_no_input_vat: "Aufwendungen ohne Vorsteuer",
};
const db = supabase as unknown as { from: (table: string) => any; auth: typeof supabase.auth };

export function DatevAccountingSettings() {
  const [userId, setUserId] = useState("");
  const [chart, setChart] = useState<Chart>("SKR03");
  const [year, setYear] = useState(new Date().getFullYear());
  const [berater, setBerater] = useState("");
  const [mandant, setMandant] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [stored, setStored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data: auth, error: authError } = await db.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) throw new Error("Bitte erneut anmelden.");
        const uid = auth.user.id;
        const [settings, savedMappings] = await Promise.all([
          db.from("company_accounting_settings").select("*").eq("user_id", uid).maybeSingle(),
          db.from("company_account_mappings").select("*").eq("user_id", uid),
        ]);
        if (settings.error) throw settings.error;
        if (savedMappings.error) throw savedMappings.error;
        if (!alive) return;
        setUserId(uid);
        if (settings.data) {
          setChart(settings.data.chart);
          setYear(settings.data.fiscal_year);
          setBerater(settings.data.datev_beraternummer ?? "");
          setMandant(settings.data.datev_mandantennummer ?? "");
          setStored(true);
        }
        setMappings(Object.fromEntries((savedMappings.data ?? []).map((m: any) => [m.mapping_key, m.account_number])));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "DATEV-Einstellungen konnten nicht geladen werden.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    void db.from("accounting_chart_accounts").select("account_number,account_name,category")
      .eq("chart", chart).eq("fiscal_year", year).eq("is_active", true)
      .order("account_number").then(({ data, error }: any) => {
        if (!alive) return;
        if (error) toast.error(error.message);
        else setAccounts(data ?? []);
      });
    return () => { alive = false; };
  }, [chart, year]);

  async function saveSettings() {
    if (!userId) return;
    if ((berater && !/^\d{1,7}$/.test(berater)) || (mandant && !/^\d{1,5}$/.test(mandant))) {
      toast.error("DATEV-Nummern dürfen nur Ziffern enthalten (Berater max. 7, Mandant max. 5).");
      return;
    }
    setSaving(true);
    try {
      const { error } = await db.from("company_accounting_settings").upsert({
        user_id: userId, chart, fiscal_year: year,
        datev_beraternummer: berater || null, datev_mandantennummer: mandant || null,
      }, { onConflict: "user_id" });
      if (error) throw error;
      setStored(true);
      toast.success("DATEV-Einstellungen gespeichert.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally { setSaving(false); }
  }

  async function saveMapping(key: string, number: string) {
    if (!stored || !userId) return;
    if (!number) {
      toast.error("Bestehende Zuordnungen bleiben erhalten. Wählen Sie ein Konto.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await db.from("company_account_mappings").upsert({
        user_id: userId, mapping_key: key, chart, fiscal_year: year, account_number: number,
      }, { onConflict: "user_id,mapping_key" });
      if (error) throw error;
      setMappings((prev) => ({ ...prev, [key]: number }));
      toast.success("Kontozuordnung gespeichert.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Zuordnung fehlgeschlagen.");
    } finally { setSaving(false); }
  }

  if (loading) return <p>DATEV-Einstellungen werden geladen…</p>;
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">DATEV / Kontenrahmen</h2>
      <p className="text-sm text-muted-foreground">
        Kontenrahmen und Konten werden je Unternehmen gespeichert. Bitte mit Ihrem Steuerberater abstimmen.
        Änderungen am Kontenrahmen sind bei vorhandenen Zuordnungen gesperrt.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="datev-chart">Kontenrahmen</Label>
          <select id="datev-chart" className="w-full rounded-md border bg-background p-2" value={chart}
            onChange={(e) => setChart(e.target.value as Chart)}>
            <option value="SKR03">SKR03</option><option value="SKR04">SKR04</option>
          </select></div>
        <div className="space-y-1"><Label htmlFor="datev-year">Wirtschaftsjahr</Label>
          <Input id="datev-year" type="number" min={2000} max={2200} value={year}
            onChange={(e) => setYear(Number(e.target.value))} /></div>
        <div className="space-y-1"><Label htmlFor="datev-berater">DATEV-Beraternummer</Label>
          <Input id="datev-berater" inputMode="numeric" value={berater} onChange={(e) => setBerater(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="datev-mandant">DATEV-Mandantennummer</Label>
          <Input id="datev-mandant" inputMode="numeric" value={mandant} onChange={(e) => setMandant(e.target.value)} /></div>
      </div>
      <Button disabled={saving || !userId || year < 2000 || year > 2200} onClick={() => void saveSettings()}>
        Einstellungen speichern
      </Button>
      <div className="space-y-3">
        <h3 className="font-medium">Kontozuordnungen</h3>
        {!stored && <p className="text-sm">Bitte zuerst die Einstellungen speichern.</p>}
        {Object.entries(mappingLabels).map(([key, label]) => (
          <div className="space-y-1" key={key}>
            <Label htmlFor={key}>{label}</Label>
            <div className="flex flex-wrap gap-2">
              <select id={key} disabled={!stored || saving} className="min-w-0 flex-1 rounded-md border bg-background p-2"
                value={mappings[key] ?? ""} onChange={(e) => setMappings((prev) => ({ ...prev, [key]: e.target.value }))}>
                <option value="">Konto auswählen</option>
                {accounts.filter((a) => key === "revenue_domestic_19"
                  ? a.account_number === (chart === "SKR03" ? "8400" : "4400")
                  : a.category === "expense").map((a) => <option key={a.account_number} value={a.account_number}>
                  {a.account_number} – {a.account_name}
                </option>)}
              </select>
              <Button variant="outline" disabled={!stored || saving || !mappings[key] ||
                !accounts.some((a) => a.account_number === mappings[key] &&
                  (key === "revenue_domestic_19" ? a.account_number === (chart === "SKR03" ? "8400" : "4400") : a.category === "expense"))}
                onClick={() => void saveMapping(key, mappings[key] ?? "")}>Zuordnen</Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Diese Zuordnungen allein erzeugen noch keinen freigegebenen DATEV-Buchungsstapel.</p>
    </section>
  );
}
