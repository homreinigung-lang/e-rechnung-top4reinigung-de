import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileText, Scale, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/rechtliches/")({
  head: () => ({
    meta: [
      { title: "Rechtliches – HomR" },
      {
        name: "description",
        content:
          "Impressum, AGB, Datenschutzbestimmungen (DSGVO) und Open-Source-Lizenzen der HomR Rechnungssoftware.",
      },
      { property: "og:title", content: "Rechtliches – HomR" },
      {
        property: "og:description",
        content: "Impressum, AGB, Datenschutz und verwendete Open-Source-Bibliotheken.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://e-rechnung.top4reinigung.de/rechtliches" },
    ],
    links: [{ rel: "canonical", href: "https://e-rechnung.top4reinigung.de/rechtliches" }],
  }),
  component: LegalIndex,
});

const items = [
  {
    to: "/rechtliches/impressum",
    icon: Scale,
    title: "Impressum",
    text: "Anbieterkennzeichnung nach § 5 TMG.",
  },
  {
    to: "/rechtliches/agb",
    icon: FileText,
    title: "AGB",
    text: "Allgemeine Geschäftsbedingungen.",
  },
  {
    to: "/rechtliches/datenschutz",
    icon: ShieldCheck,
    title: "Datenschutzbestimmungen",
    text: "Informationen nach Art. 13 DSGVO.",
  },
  {
    to: "/rechtliches/bibliotheken",
    icon: BookOpen,
    title: "Bibliotheken",
    text: "Verwendete Open-Source-Software und Lizenzen.",
  },
] as const;

function LegalIndex() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Rechtliches</h1>
      <p className="mt-3 text-muted-foreground">
        Alle rechtlichen Informationen zu dieser Anwendung auf einen Blick.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {items.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className="surface block p-6 transition-colors hover:bg-muted/40"
          >
            <i.icon className="size-6 text-primary" />
            <h2 className="mt-4 text-base font-semibold">{i.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{i.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
