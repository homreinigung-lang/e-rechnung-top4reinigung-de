import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rechtliches/avv")({
  head: () => ({
    meta: [
      { title: "AVV – Auftragsverarbeitung nach Art. 28 DSGVO | GebCalc" },
      {
        name: "description",
        content:
          "Vertrag zur Auftragsverarbeitung (AVV) nach Art. 28 DSGVO für Geschäftskunden der GebCalc Cloud-Software: Gegenstand, Weisungen, TOM und Unterauftragnehmer.",
      },
      { property: "og:title", content: "AVV nach Art. 28 DSGVO – GebCalc" },
      {
        property: "og:description",
        content:
          "Auftragsverarbeitungsvertrag für Geschäftskunden: Zweck, Datenarten, Pflichten, technische und organisatorische Maßnahmen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://e-rechnung.top4reinigung.de/rechtliches/avv" },
    ],
    links: [{ rel: "canonical", href: "https://e-rechnung.top4reinigung.de/rechtliches/avv" }],
  }),
  component: Avv,
});

const sections = [
  {
    title: "§ 1 Gegenstand und Dauer der Verarbeitung",
    body: "Gegenstand dieses Vertrages ist die Verarbeitung personenbezogener Daten durch den Auftragsverarbeiter (Betreiber der Software GebCalc) im Auftrag des Verantwortlichen (Firmenkunde) im Rahmen der Nutzung der Cloud-Anwendung. Die Verarbeitung erfolgt für die Dauer des Hauptvertrages über die Nutzung der Software und endet mit dessen Beendigung.",
  },
  {
    title: "§ 2 Art und Zweck der Verarbeitung",
    body: "Verarbeitet wird zum Zweck der Bereitstellung der Fach- und Cloud-Funktionen: Angebots-, Auftrags- und Rechnungserstellung, E-Rechnung (XRechnung/ZUGFeRD), Kunden- und Projektverwaltung, Kalkulation, Zeiterfassung und Einsatzplanung, Belegarchivierung sowie Versand von Dokumenten per E-Mail.",
  },
  {
    title: "§ 3 Art der Daten und Kategorien betroffener Personen",
    body: "Datenarten: Stamm- und Kontaktdaten (Name, Firma, Anschrift, E-Mail, Telefon), Vertrags- und Abrechnungsdaten, Beleg- und Zahlungsdaten, Arbeitszeit- und Einsatzdaten, hochgeladene Dokumente und Nachweisfotos, Nutzungs- und Protokolldaten. Betroffene Personen: Beschäftigte des Verantwortlichen, dessen Kunden und Ansprechpartner sowie Geschäftspartner.",
  },
  {
    title: "§ 4 Weisungsrecht des Verantwortlichen",
    body: "Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschließlich auf dokumentierte Weisung des Verantwortlichen, es sei denn, er ist nach Unionsrecht oder nationalem Recht zur Verarbeitung verpflichtet. Weisungen erfolgen grundsätzlich in Textform. Hält der Auftragsverarbeiter eine Weisung für rechtswidrig, informiert er den Verantwortlichen unverzüglich.",
  },
  {
    title: "§ 5 Vertraulichkeit",
    body: "Der Auftragsverarbeiter setzt zur Verarbeitung nur Personen ein, die zur Vertraulichkeit verpflichtet wurden oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen (Art. 28 Abs. 3 lit. b DSGVO).",
  },
  {
    title: "§ 6 Technische und organisatorische Maßnahmen (Art. 32 DSGVO)",
    body: "Es bestehen insbesondere: Transportverschlüsselung (TLS) für alle Verbindungen, Verschlüsselung der Daten im Ruhezustand beim Hosting-Dienstleister, strikte Mandantentrennung über Zugriffsregeln auf Datenbankebene (Row Level Security), rollenbasierte Zugriffsrechte, optionale Zwei-Faktor-Authentifizierung, protokollierte und unveränderbare Beleg-Festschreibung (GoBD), regelmäßige Sicherungen sowie Export- und Löschfunktionen für die Datenbestände des Verantwortlichen.",
  },
  {
    title: "§ 7 Unterauftragsverarbeiter",
    body: "Der Verantwortliche stimmt dem Einsatz von Unterauftragsverarbeitern zu, die für den Betrieb der Cloud-Anwendung erforderlich sind (Hosting- und Datenbankbetrieb, Versand von System- und Dokument-E-Mails sowie – nur bei aktiver Nutzung entsprechender Funktionen – Dienste zur Dokumenten- bzw. Spracherkennung). Der Auftragsverarbeiter schließt mit diesen Dienstleistern Verträge mit gleichwertigem Datenschutzniveau. Über beabsichtigte Änderungen wird der Verantwortliche vorab informiert und kann widersprechen.",
  },
  {
    title: "§ 8 Ort der Verarbeitung / Drittlandtransfer",
    body: "Die Verarbeitung findet innerhalb der Europäischen Union bzw. des EWR statt. Sollte im Einzelfall eine Übermittlung in ein Drittland erforderlich sein, erfolgt diese ausschließlich auf Grundlage eines Angemessenheitsbeschlusses oder geeigneter Garantien nach Art. 46 DSGVO (insbesondere EU-Standardvertragsklauseln).",
  },
  {
    title: "§ 9 Unterstützungspflichten",
    body: "Der Auftragsverarbeiter unterstützt den Verantwortlichen mit geeigneten Maßnahmen bei der Erfüllung von Betroffenenrechten (Art. 12–23 DSGVO) sowie bei Datenschutz-Folgenabschätzungen, Meldepflichten nach Art. 33, 34 DSGVO und der Sicherheit der Verarbeitung. Anfragen betroffener Personen werden nicht selbst beantwortet, sondern unverzüglich an den Verantwortlichen weitergeleitet.",
  },
  {
    title: "§ 10 Meldung von Datenschutzverletzungen",
    body: "Der Auftragsverarbeiter meldet dem Verantwortlichen Verletzungen des Schutzes personenbezogener Daten unverzüglich nach Bekanntwerden und stellt die zur Meldung nach Art. 33 DSGVO erforderlichen Informationen bereit.",
  },
  {
    title: "§ 11 Nachweise und Kontrollrechte",
    body: "Der Auftragsverarbeiter stellt dem Verantwortlichen alle erforderlichen Informationen zum Nachweis der Einhaltung der Pflichten aus Art. 28 DSGVO zur Verfügung und ermöglicht Überprüfungen. Kontrollen erfolgen nach angemessener Vorankündigung und ohne Beeinträchtigung des Betriebsablaufs.",
  },
  {
    title: "§ 12 Löschung und Rückgabe nach Vertragsende",
    body: "Nach Beendigung des Vertrages werden die verarbeiteten Daten nach Wahl des Verantwortlichen gelöscht oder zurückgegeben. Der Verantwortliche kann seine Daten jederzeit selbst exportieren (u. a. PDF, XML, Excel/JSON). Von der Löschung ausgenommen sind Daten, für die gesetzliche Aufbewahrungspflichten bestehen (insbesondere § 147 AO, § 14b UStG, GoBD).",
  },
  {
    title: "§ 13 Haftung und Schlussbestimmungen",
    body: "Es gelten die Haftungsregelungen des Hauptvertrages sowie Art. 82 DSGVO. Änderungen und Ergänzungen dieses Vertrages bedürfen der Textform. Bei Widersprüchen zwischen diesem Vertrag und dem Hauptvertrag gehen die Regelungen dieses Vertrages hinsichtlich der Auftragsverarbeitung vor.",
  },
];

function Avv() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-bold">
        Vertrag zur Auftragsverarbeitung (AVV) nach Art. 28 DSGVO
      </h1>
      <p className="text-sm text-muted-foreground">Stand: 26.08.2026</p>
      <p className="text-sm text-muted-foreground">
        Dieser Vertrag gilt zwischen dem Firmenkunden als Verantwortlichem und dem Betreiber der
        Cloud-Anwendung GebCalc als Auftragsverarbeiter. Die vollständigen Angaben zum Betreiber
        finden Sie im Impressum. Auf Wunsch stellen wir Geschäftskunden diesen AVV zusätzlich als
        unterzeichnetes Dokument bereit.
      </p>
      {sections.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="text-sm text-muted-foreground">{s.body}</p>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Hinweis: Dieser AVV ist eine anpassbare Vorlage für Geschäftskunden und ersetzt keine
        individuelle Rechtsberatung.
      </p>
    </article>
  );
}
