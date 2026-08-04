import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rechtliches/agb")({
  head: () => ({
    meta: [
      { title: "AGB – Allgemeine Geschäftsbedingungen | Hom R Office" },
      {
        name: "description",
        content:
          "Allgemeine Geschäftsbedingungen für Reinigungsdienstleistungen und die Nutzung der Hom R Office Rechnungssoftware.",
      },
      { property: "og:title", content: "AGB – Hom R Office" },
      { property: "og:description", content: "Allgemeine Geschäftsbedingungen: Leistungen, Preise, Zahlung, Haftung." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Agb,
});

const sections = [
  {
    title: "§ 1 Geltungsbereich",
    body: "Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Verträge über Reinigungsdienstleistungen sowie für die Nutzung dieser Anwendung. Abweichende Bedingungen des Auftraggebers werden nur wirksam, wenn sie schriftlich bestätigt werden.",
  },
  {
    title: "§ 2 Vertragsschluss und Angebote",
    body: "Angebote sind freibleibend und 30 Tage gültig, sofern nichts anderes angegeben ist. Der Vertrag kommt durch schriftliche Auftragsbestätigung oder Beginn der Leistungsausführung zustande.",
  },
  {
    title: "§ 3 Leistungsumfang",
    body: "Der Umfang der Leistungen ergibt sich aus dem Angebot bzw. dem Leistungsverzeichnis. Zusatzleistungen werden gesondert vereinbart und berechnet.",
  },
  {
    title: "§ 4 Preise und Zahlungsbedingungen",
    body: "Rechnungen sind ohne Abzug innerhalb von 14 Tagen ab Rechnungsdatum zahlbar. Bei Zahlungsverzug werden Verzugszinsen gemäß § 288 BGB berechnet.",
  },
  {
    title: "§ 5 Umsatzsteuer / Reverse-Charge",
    body: "Bei Leistungen an Unternehmer im EU-Ausland mit gültiger USt-IdNr. geht die Steuerschuld nach § 13b UStG bzw. Art. 196 MwStSystRL auf den Leistungsempfänger über (Reverse-Charge). Es wird keine Umsatzsteuer ausgewiesen.",
  },
  {
    title: "§ 6 Mitwirkungspflichten des Auftraggebers",
    body: "Der Auftraggeber stellt Zugang zu den Räumlichkeiten, Strom und Wasser unentgeltlich zur Verfügung und weist auf besondere Gefahrenquellen hin.",
  },
  {
    title: "§ 7 Mängelrügen und Gewährleistung",
    body: "Mängel sind unverzüglich, spätestens innerhalb von 7 Werktagen nach Leistungserbringung, schriftlich anzuzeigen. Bei berechtigter Rüge erfolgt Nacherfüllung.",
  },
  {
    title: "§ 8 Haftung",
    body: "Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper und Gesundheit. Im Übrigen ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt.",
  },
  {
    title: "§ 9 Kündigung",
    body: "Dauerschuldverhältnisse können mit einer Frist von vier Wochen zum Monatsende gekündigt werden. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.",
  },
  {
    title: "§ 10 Schlussbestimmungen",
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
        Hinweis: Diese AGB sind eine anpassbare Vorlage und ersetzen keine individuelle Rechtsberatung.
      </p>
    </article>
  );
}
