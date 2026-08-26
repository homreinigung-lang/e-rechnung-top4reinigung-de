import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rechtliches/agb")({
  head: () => ({
    meta: [
      { title: "AGB – Allgemeine Geschäftsbedingungen | GebCalc" },
      {
        name: "description",
        content:
          "Allgemeine Geschäftsbedingungen für die gewerbliche Nutzung der GebCalc Cloud-Software (B2B-SaaS).",
      },
      { property: "og:title", content: "AGB – GebCalc" },
      {
        property: "og:description",
        content: "Allgemeine Geschäftsbedingungen: Leistungen, Preise, Zahlung, Haftung.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://e-rechnung.top4reinigung.de/rechtliches/agb" },
    ],
    links: [{ rel: "canonical", href: "https://e-rechnung.top4reinigung.de/rechtliches/agb" }],
  }),
  component: Agb,
});

const sections = [
  {
    title: "§ 1 Geltungsbereich und Vertragspartner",
    body: "Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Bereitstellung und Nutzung der Cloud-Software GebCalc (Software as a Service) gegenüber Unternehmern im Sinne des § 14 BGB, juristischen Personen des öffentlichen Rechts und öffentlich-rechtlichen Sondervermögen. Ein Vertragsschluss mit Verbrauchern erfolgt nicht. Abweichende oder entgegenstehende Bedingungen des Kunden werden nur wirksam, wenn sie ausdrücklich in Textform bestätigt werden.",
  },
  {
    title: "§ 2 Vertragsschluss und Registrierung",
    body: "Der Vertrag kommt durch Registrierung eines Firmenkontos und Bestätigung durch den Anbieter oder durch die verbindliche Bestellung eines kostenpflichtigen Pakets zustande. Der Kunde versichert, dass die bei der Registrierung angegebenen Unternehmensdaten zutreffend sind und dass er die Anwendung ausschließlich zu gewerblichen oder beruflichen Zwecken nutzt.",
  },
  {
    title: "§ 3 Leistungsgegenstand (SaaS)",
    body: "Der Anbieter stellt dem Kunden die jeweils aktuelle Version der Anwendung über das Internet zur Nutzung bereit. Der Leistungsumfang richtet sich nach dem gebuchten Paket und umfasst insbesondere Angebots-, Auftrags- und Rechnungserstellung, E-Rechnung (XRechnung/ZUGFeRD), Kunden- und Projektverwaltung, Kalkulation, Zeiterfassung und Einsatzplanung sowie Export- und Archivfunktionen. Der Anbieter entwickelt die Anwendung fortlaufend weiter; Funktionen können ergänzt oder gleichwertig ersetzt werden, sofern der vertragliche Kernnutzen erhalten bleibt. Eine Übertragung der Software auf Datenträger oder ein Erwerb von Eigentum an der Software erfolgt nicht.",
  },
  {
    title: "§ 4 Nutzungsrecht",
    body: "Der Kunde erhält für die Vertragslaufzeit ein einfaches, nicht übertragbares und nicht unterlizenzierbares Recht, die Anwendung im vereinbarten Umfang (Anzahl Benutzer bzw. Mitarbeitende gemäß Paket) über einen Webbrowser zu nutzen. Eine Weitergabe der Zugangsdaten an Dritte sowie die Nutzung als Rechenzentrumsleistung für Dritte sind nicht gestattet.",
  },
  {
    title: "§ 5 Verfügbarkeit, Wartung und Support",
    body: "Der Anbieter stellt eine Verfügbarkeit der Anwendung im Jahresmittel von 99 % am Übergabepunkt (Router-Ausgang des Rechenzentrums) an. Hiervon ausgenommen sind angekündigte Wartungsfenster sowie Ausfälle, die der Anbieter nicht zu vertreten hat (insbesondere höhere Gewalt, Störungen bei Vorleistungsanbietern). Der Support erfolgt in Textform an Werktagen; Reaktionszeiten richten sich nach dem gebuchten Paket.",
  },
  {
    title: "§ 6 Preise, Abrechnung und Zahlung",
    body: "Alle Preise verstehen sich netto zzgl. der gesetzlichen Umsatzsteuer. Die Abrechnung erfolgt je nach Bestellung monatlich oder jährlich im Voraus per SEPA-Überweisung. Rechnungen sind ohne Abzug innerhalb von 14 Tagen ab Rechnungsdatum zahlbar. Bei Zahlungsverzug gelten die gesetzlichen Verzugsregelungen (§ 288 BGB); der Anbieter kann den Zugang nach vorheriger Ankündigung bis zum Zahlungseingang sperren.",
  },
  {
    title: "§ 7 Umsatzsteuer / Reverse-Charge",
    body: "Bei Leistungen an Unternehmer im EU-Ausland mit gültiger USt-IdNr. geht die Steuerschuld nach § 13b UStG bzw. Art. 196 MwStSystRL auf den Leistungsempfänger über (Reverse-Charge); es wird keine Umsatzsteuer ausgewiesen. Diese Regelung gilt gleichermaßen für die vom Kunden mit der Anwendung erstellten Ausgangsrechnungen.",
  },
  {
    title: "§ 8 Pflichten und Verantwortlichkeit des Kunden",
    body: "Der Kunde ist für die Richtigkeit und Vollständigkeit der von ihm eingegebenen Daten sowie für die steuer- und handelsrechtliche Zulässigkeit der von ihm erstellten Belege selbst verantwortlich. Er sichert Zugangsdaten gegen unbefugten Zugriff, verwaltet die Berechtigungen seiner Mitarbeitenden und prüft erstellte Dokumente vor dem Versand. Der Anbieter erbringt keine Steuer- oder Rechtsberatung.",
  },
  {
    title: "§ 9 Datenschutz und Auftragsverarbeitung",
    body: "Der Kunde ist datenschutzrechtlich Verantwortlicher für die in der Anwendung verarbeiteten personenbezogenen Daten. Der Anbieter verarbeitet diese Daten ausschließlich weisungsgebunden auf Grundlage des Vertrages zur Auftragsverarbeitung nach Art. 28 DSGVO (AVV), der Bestandteil dieses Vertrages ist. Einzelheiten zu Zweck, Datenarten und technischen sowie organisatorischen Maßnahmen ergeben sich aus dem AVV und der Datenschutzerklärung.",
  },
  {
    title: "§ 10 Gewährleistung und Haftung",
    body: "Der Anbieter gewährleistet die vertragsgemäße Nutzbarkeit der Anwendung nach den Regeln des Mietrechts; die verschuldensunabhängige Haftung für anfängliche Mängel nach § 536a Abs. 1 Alt. 1 BGB ist ausgeschlossen. Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper und Gesundheit. Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt; im Übrigen ist die Haftung ausgeschlossen. Für Datenverlust haftet der Anbieter nur in dem Umfang, der bei ordnungsgemäßer und regelmäßiger Datensicherung durch den Kunden entstanden wäre.",
  },
  {
    title: "§ 11 Kostenlose Testphase (60 Tage)",
    body: "Neu registrierte Firmenkonten erhalten eine unverbindliche Testphase von 60 Kalendertagen ab Registrierung mit vollem Funktionsumfang. Es sind keine Zahlungsdaten erforderlich, es entstehen keine Kosten und die Testphase geht nicht automatisch in ein kostenpflichtiges Abonnement über. Nach Ablauf der 60 Tage können kostenpflichtige Funktionen nur nach ausdrücklicher Bestellung eines Pakets weitergenutzt werden; bis dahin bleiben bereits erstellte Belege lesbar und exportierbar. Das Konto kann während der Testphase jederzeit ohne Frist und ohne Angabe von Gründen gelöscht werden; ein Widerrufsrecht wird dadurch nicht eingeschränkt.",
  },
  {
    title: "§ 12 Abonnement, Laufzeit und Kündigung der Software-Nutzung",
    body: "Kostenpflichtige Pakete werden monatlich im Voraus abgerechnet und verlängern sich um jeweils einen Monat, sofern nicht mit einer Frist von 14 Tagen zum Laufzeitende gekündigt wird. Die Kündigung ist in Textform (z. B. per E-Mail) möglich. Preisänderungen werden mindestens 30 Tage vorher mitgeteilt; im Falle einer Erhöhung besteht ein Sonderkündigungsrecht.",
  },
  {
    title: "§ 13 Registrierung, Konto und E-Mail-Kommunikation",
    body: "Zugangsdaten sind vertraulich zu behandeln. Im Rahmen der Registrierung versenden wir systembedingte E-Mails (Bestätigungs- und Anmeldelinks, Passwort-Zurücksetzung, Hinweise zur Testphase) über einen von uns beauftragten E-Mail-Dienstleister. Bestätigungslinks sind aus Sicherheitsgründen nur zeitlich begrenzt gültig und können jederzeit erneut angefordert werden.",
  },
  {
    title: "§ 14 Datenexport und Löschung",
    body: "Nutzer können ihre Daten jederzeit exportieren (u. a. PDF, XML, Excel/JSON). Nach Kontolöschung werden personenbezogene Daten gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten (insbesondere § 147 AO, § 14b UStG, GoBD) entgegenstehen.",
  },
  {
    title: "§ 15 Schlussbestimmungen",
    body: "Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist – soweit zulässig – der Sitz des Auftragnehmers. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.",
  },
];

function Agb() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-bold">Allgemeine Geschäftsbedingungen (AGB)</h1>
      <p className="text-sm text-muted-foreground">Stand: 01.08.2026</p>
      {sections.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="text-sm text-muted-foreground">{s.body}</p>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Hinweis: Diese AGB sind eine anpassbare Vorlage und ersetzen keine individuelle
        Rechtsberatung.
      </p>
    </article>
  );
}
