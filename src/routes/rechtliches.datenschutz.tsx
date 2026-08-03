import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rechtliches/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutzbestimmungen (DSGVO) – CleanInvoice" },
      {
        name: "description",
        content:
          "Datenschutzerklärung nach DSGVO: verarbeitete Daten, Rechtsgrundlagen, Speicherdauer, Auftragsverarbeiter und Ihre Betroffenenrechte.",
      },
      { property: "og:title", content: "Datenschutzbestimmungen – CleanInvoice" },
      { property: "og:description", content: "Informationen zur Verarbeitung personenbezogener Daten nach Art. 13 DSGVO." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Datenschutz,
});

function Datenschutz() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-bold">Datenschutzbestimmungen</h1>
      <p className="text-sm text-muted-foreground">
        Diese Seite wird vom Betreiber der Anwendung gepflegt und informiert über die Verarbeitung personenbezogener
        Daten gemäß Art. 13 DSGVO. Stand: 01.08.2026
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Verantwortlicher</h2>
        <p className="text-sm text-muted-foreground">
          Hom Reinigung Service, Rathausstraße 1, 66333 Völklingen, E-Mail: info@top4reinigung.de
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Verarbeitete Daten</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Kontodaten der Nutzer (E-Mail-Adresse, Anmeldeinformationen, ggf. Google-Konto-Kennung)</li>
          <li>Stammdaten von Kunden (Name, Anschrift, USt-IdNr., Kontaktdaten)</li>
          <li>Belegdaten (Angebote, Rechnungen, Positionen, Zahlungsstatus, Ausgaben)</li>
          <li>Hochgeladene Dateien (z. B. Logo, Belege, PDF-Anhänge)</li>
          <li>Technische Protokolldaten beim Aufruf der Anwendung</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Zwecke und Rechtsgrundlagen</h2>
        <p className="text-sm text-muted-foreground">
          Die Verarbeitung erfolgt zur Vertragserfüllung und Rechnungsstellung (Art. 6 Abs. 1 lit. b DSGVO), zur
          Erfüllung gesetzlicher Aufbewahrungs- und Buchführungspflichten (Art. 6 Abs. 1 lit. c DSGVO i. V. m. § 147 AO,
          § 14b UStG, GoBD) sowie auf Grundlage berechtigter Interessen am sicheren Betrieb der Anwendung (Art. 6 Abs. 1
          lit. f DSGVO).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Auftragsverarbeiter und Empfänger</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Hosting- und Datenbank-/Auth-Dienst der Anwendungsplattform (Speicherung in der EU)</li>
          <li>E-Mail-Versanddienstleister für den Versand von Angeboten und Rechnungen</li>
          <li>Google (nur bei Nutzung der optionalen Anmeldung per Google-Konto)</li>
          <li>Steuerberatung/Finanzamt im Rahmen gesetzlicher Pflichten</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Mit Dienstleistern bestehen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Speicherdauer</h2>
        <p className="text-sm text-muted-foreground">
          Rechnungen und buchhaltungsrelevante Unterlagen werden gemäß gesetzlicher Aufbewahrungsfristen (in der Regel 10
          Jahre) unveränderbar archiviert. Übrige Daten werden gelöscht, sobald der Zweck entfällt.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Cookies und Tracking</h2>
        <p className="text-sm text-muted-foreground">
          Die Anwendung verwendet ausschließlich technisch notwendige Speichermechanismen (z. B. Sitzungs-Token für die
          Anmeldung). Es findet kein Marketing-Tracking und keine Profilbildung statt.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">7. Datensicherheit</h2>
        <p className="text-sm text-muted-foreground">
          Die Übertragung erfolgt verschlüsselt über HTTPS. Der Zugriff auf Daten ist durch Anmeldung und
          zeilenbasierte Zugriffsregeln (Row Level Security) auf das jeweilige Konto beschränkt.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">8. Ihre Rechte</h2>
        <p className="text-sm text-muted-foreground">
          Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung
          (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO) sowie das Recht auf Beschwerde bei
          einer Aufsichtsbehörde – für das Saarland: Unabhängiges Datenschutzzentrum Saarland, Saarbrücken.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">9. Kontakt in Datenschutzfragen</h2>
        <p className="text-sm text-muted-foreground">
          E-Mail:{" "}
          <a className="underline" href="mailto:info@top4reinigung.de">
            info@top4reinigung.de
          </a>
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Hinweis: Diese Datenschutzerklärung ist eine anpassbare Vorlage und ersetzt keine individuelle Rechtsberatung.
      </p>
    </article>
  );
}
