import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rechtliches/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum – Hom R Office" },
      {
        name: "description",
        content:
          "Impressum und Anbieterkennzeichnung nach § 5 TMG: Firmenanschrift, Kontakt, USt-IdNr. und Verantwortliche.",
      },
      { property: "og:title", content: "Impressum – Hom R Office" },
      { property: "og:description", content: "Anbieterkennzeichnung nach § 5 TMG mit Kontakt- und Steuerdaten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Impressum,
});

function Impressum() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-bold">Impressum</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Angaben gemäß § 5 TMG</h2>
        <p className="text-sm text-muted-foreground">
          Hom Reinigung Service
          <br />
          Inhaber: Herr Hom
          <br />
          Poststraße 8
          <br />
          66333 Völklingen
          <br />
          Deutschland
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Kontakt</h2>
        <p className="text-sm text-muted-foreground">
          Telefon: +49 (0) 6898 000000
          <br />
          E-Mail:{" "}
          <a className="underline" href="mailto:info@top4reinigung.de">
            info@top4reinigung.de
          </a>
          <br />
          Web: e-rechnung.top4reinigung.de
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Umsatzsteuer-Identifikationsnummer</h2>
        <p className="text-sm text-muted-foreground">
          USt-IdNr. gemäß § 27 a Umsatzsteuergesetz: <strong>DE458492078</strong>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p className="text-sm text-muted-foreground">
          Herr Hom, Poststraße 8, 66333 Völklingen
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">EU-Streitschlichtung</h2>
        <p className="text-sm text-muted-foreground">
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
          <a className="underline" href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noreferrer">
            https://ec.europa.eu/consumers/odr/
          </a>
          . Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Haftung für Inhalte und Links</h2>
        <p className="text-sm text-muted-foreground">
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen
          verantwortlich. Für Inhalte externer Links sind ausschließlich deren Betreiber verantwortlich. Bei Bekanntwerden
          von Rechtsverletzungen entfernen wir derartige Inhalte umgehend.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Hinweis: Bitte prüfen Sie die hier hinterlegten Firmendaten (Anschrift, Telefonnummer, Registerangaben) und
        passen Sie diese bei Bedarf an Ihre tatsächlichen Unternehmensdaten an.
      </p>
    </article>
  );
}
