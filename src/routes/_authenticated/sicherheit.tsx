import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TwoFactorCard } from "@/components/TwoFactorCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Archive, DatabaseBackup, Lock, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sicherheit")({
  head: () => ({
    meta: [
      { title: "Sicherheit & Backup – GebCalc" },
      {
        name: "description",
        content:
          "Zwei-Faktor-Anmeldung, Aufbewahrungsfristen für Fotos, GoBD-Archivierung und das Backup-Handbuch für GebCalc.",
      },
      { property: "og:title", content: "Sicherheit & Backup – GebCalc" },
      {
        property: "og:description",
        content: "2FA, Datensicherung, GoBD-Archivierung und Aufbewahrungsfristen verwalten.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SicherheitPage,
});

function SicherheitPage() {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const saveRetention = useMutation({
    mutationFn: async (days: number) => {
      if (!settings?.["id"]) throw new Error("Bitte zuerst die Firmendaten speichern.");
      const { error } = await supabase
        .from("company_settings")
        .update({ photo_retention_days: days } as never)
        .eq("id", settings["id"] as string);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aufbewahrungsfrist gespeichert");
      queryClient.invalidateQueries({ queryKey: ["company_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Sicherheit & Datensicherung</h1>
        <p className="text-sm text-muted-foreground">
          Zugriffsschutz, Aufbewahrungsfristen und das Vorgehen zur Sicherung und Wiederherstellung
          Ihrer Daten.
        </p>
      </div>

      <TwoFactorCard />

      <section className="surface space-y-4 p-6">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">Zugriffsschutz (aktiv)</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                Alle Tabellen sind mit strikten Zugriffsregeln (Row Level Security) geschützt –
                jedes Konto sieht ausschließlich eigene Daten.
              </li>
              <li>
                Der Datei-Speicher ist vollständig privat. Fotos und PDF-Dateien sind nur über
                zeitlich begrenzte, signierte Links erreichbar.
              </li>
              <li>
                Mitarbeitende haben Nur-Lese-Rechte auf Arbeitszeiten und dürfen an eigenen
                Einträgen ausschließlich Fotos hinzufügen.
              </li>
              <li>Sämtliche Verbindungen sind TLS-verschlüsselt.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="surface space-y-4 p-6">
        <div className="flex items-start gap-3">
          <Archive className="mt-0.5 size-5 text-primary" />
          <div className="w-full">
            <h2 className="font-display text-lg font-semibold">
              Fotos: Aufbewahrungsfrist (Retention)
            </h2>
            <p className="text-sm text-muted-foreground">
              Arbeitsnachweis-Fotos werden nach Ablauf der Frist täglich um 03:20 Uhr automatisch
              gelöscht. Rechnungen, Angebote, Vorlagen und das GoBD-Archiv bleiben unberührt. Wert 0
              = keine automatische Löschung.
            </p>
            <div className="mt-4 max-w-xs space-y-2">
              <Label htmlFor="retention">Aufbewahrung in Tagen</Label>
              <Input
                id="retention"
                type="number"
                min={0}
                defaultValue={String(settings?.["photo_retention_days"] ?? 0)}
                onBlur={(e) => saveRetention.mutate(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="surface space-y-4 p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">
              GoBD: unveränderbare Archivierung
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                Festgeschriebene Rechnungen sind unveränderbar und können nicht gelöscht werden –
                Korrekturen erfolgen ausschließlich über eine Stornorechnung.
              </li>
              <li>
                Jede archivierte PDF-Datei erhält eine SHA-256-Prüfsumme; jede Aktion wird im
                unveränderbaren Prüfprotokoll festgehalten.
              </li>
              <li>Aufbewahrungsfrist der Belege: 10 Jahre, automatisch vermerkt.</li>
              <li>
                Der vollständige Prüfexport (Belege, Positionen, Protokoll, PDF, XRechnung) steht im
                Bereich Steuerberater bereit.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="surface space-y-4 p-6">
        <div className="flex items-start gap-3">
          <DatabaseBackup className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">Backup-Handbuch</h2>

            <h3 className="mt-4 text-sm font-semibold">1. Automatische Sicherung</h3>
            <p className="text-sm text-muted-foreground">
              Die Datenbank wird durch den Cloud-Betreiber täglich automatisch gesichert
              (Point-in-Time-fähige Tagessicherungen, Aufbewahrung gemäß Tarif). Diese Sicherung
              läuft ohne Ihr Zutun und umfasst alle Tabellen inklusive Rechnungen, Angeboten,
              Zeiterfassung und Prüfprotokoll.
            </p>

            <h3 className="mt-4 text-sm font-semibold">
              2. Eigene Sicherung (monatlich empfohlen)
            </h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Bereich <strong>Steuerberater</strong> öffnen und den GoBD-Prüfexport für das
                laufende Jahr erzeugen. Das ZIP enthält alle Belege als CSV, die Original-PDF und
                die XRechnung-XML.
              </li>
              <li>Zusätzlich den DATEV-Export des jeweiligen Quartals herunterladen.</li>
              <li>
                Beide Dateien auf zwei getrennten Medien ablegen (z. B. verschlüsselte externe
                Festplatte und Firmen-Cloud), Dateiname mit Datum versehen.
              </li>
              <li>Sicherungen 10 Jahre aufbewahren – die gesetzliche Frist für Rechnungen.</li>
            </ol>

            <h3 className="mt-4 text-sm font-semibold">3. Wiederherstellung</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Datenverlust sofort melden – die Wiederherstellung aus der Tagessicherung erfolgt
                über den Cloud-Bereich des Projekts.
              </li>
              <li>
                Fehlende Einzelbelege können aus dem GoBD-Export erneut eingespielt bzw. dem
                Finanzamt direkt vorgelegt werden; die SHA-256-Prüfsumme belegt die Unverändertheit.
              </li>
              <li>
                Nach jeder Wiederherstellung stichprobenartig Rechnungsnummern auf Lückenlosigkeit
                prüfen.
              </li>
            </ol>

            <h3 className="mt-4 text-sm font-semibold">4. Prüfintervall</h3>
            <p className="text-sm text-muted-foreground">
              Einmal pro Quartal einen Testdownload eines gesicherten Exports öffnen und
              kontrollieren, ob PDF und CSV lesbar sind. Ergebnis kurz dokumentieren.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
