import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rechtliches/bibliotheken")({
  head: () => ({
    meta: [
      { title: "Bibliotheken & Open-Source-Lizenzen – HomR" },
      {
        name: "description",
        content:
          "Übersicht der in HomR verwendeten Open-Source-Bibliotheken, Frameworks und ihrer Lizenzen (MIT, Apache 2.0, ISC).",
      },
      { property: "og:title", content: "Bibliotheken & Lizenzen – HomR" },
      { property: "og:description", content: "Verwendete Open-Source-Pakete und ihre Lizenzen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://e-rechnung.top4reinigung.de/rechtliches/bibliotheken" },
    ],
    links: [{ rel: "canonical", href: "https://e-rechnung.top4reinigung.de/rechtliches/bibliotheken" }],
  }),
  component: Bibliotheken,
});

type Lib = { name: string; version: string; license: string; url: string; use: string };

const libs: Lib[] = [
  { name: "React", version: "19.2", license: "MIT", url: "https://react.dev", use: "UI-Framework" },
  {
    name: "TanStack Start / Router",
    version: "1.x",
    license: "MIT",
    url: "https://tanstack.com/start",
    use: "Routing & Server-Funktionen",
  },
  {
    name: "TanStack Query",
    version: "5.x",
    license: "MIT",
    url: "https://tanstack.com/query",
    use: "Datenabruf & Caching",
  },
  { name: "Vite", version: "8.x", license: "MIT", url: "https://vite.dev", use: "Build-Tool" },
  {
    name: "TypeScript",
    version: "5.8",
    license: "Apache-2.0",
    url: "https://www.typescriptlang.org",
    use: "Typsystem",
  },
  {
    name: "Tailwind CSS",
    version: "4.x",
    license: "MIT",
    url: "https://tailwindcss.com",
    use: "Styling",
  },
  {
    name: "Radix UI",
    version: "1.x / 2.x",
    license: "MIT",
    url: "https://www.radix-ui.com",
    use: "Barrierefreie UI-Primitive",
  },
  {
    name: "shadcn/ui",
    version: "–",
    license: "MIT",
    url: "https://ui.shadcn.com",
    use: "Komponentenvorlagen",
  },
  {
    name: "lucide-react",
    version: "0.575",
    license: "ISC",
    url: "https://lucide.dev",
    use: "Icons",
  },
  {
    name: "Supabase JS",
    version: "2.x",
    license: "MIT",
    url: "https://supabase.com",
    use: "Datenbank, Auth, Storage",
  },
  {
    name: "jsPDF",
    version: "4.x",
    license: "MIT",
    url: "https://github.com/parallax/jsPDF",
    use: "PDF-Erzeugung",
  },
  {
    name: "html2canvas",
    version: "1.4",
    license: "MIT",
    url: "https://html2canvas.hertzen.com",
    use: "Rendering für PDF",
  },
  {
    name: "pdf-lib",
    version: "1.17",
    license: "MIT",
    url: "https://pdf-lib.js.org",
    use: "PDF-Zusammenführung",
  },
  {
    name: "qrcode",
    version: "1.5",
    license: "MIT",
    url: "https://github.com/soldair/node-qrcode",
    use: "GiroCode / EPC-QR",
  },
  {
    name: "JSZip",
    version: "3.10",
    license: "MIT / GPL-3.0",
    url: "https://stuk.github.io/jszip/",
    use: "GoBD-Export (ZIP)",
  },
  {
    name: "date-fns",
    version: "4.x",
    license: "MIT",
    url: "https://date-fns.org",
    use: "Datumsfunktionen",
  },
  {
    name: "react-hook-form",
    version: "7.x",
    license: "MIT",
    url: "https://react-hook-form.com",
    use: "Formulare",
  },
  { name: "Zod", version: "3.x", license: "MIT", url: "https://zod.dev", use: "Validierung" },
  {
    name: "Recharts",
    version: "2.15",
    license: "MIT",
    url: "https://recharts.org",
    use: "Diagramme & Statistiken",
  },
  {
    name: "Sonner",
    version: "2.x",
    license: "MIT",
    url: "https://sonner.emilkowal.ski",
    use: "Benachrichtigungen",
  },
  {
    name: "react-day-picker",
    version: "9.x",
    license: "MIT",
    url: "https://daypicker.dev",
    use: "Datumsauswahl",
  },
  {
    name: "embla-carousel",
    version: "8.6",
    license: "MIT",
    url: "https://www.embla-carousel.com",
    use: "Karussell",
  },
  {
    name: "clsx / tailwind-merge / cva",
    version: "–",
    license: "MIT",
    url: "https://github.com/lukeed/clsx",
    use: "Klassen-Utilities",
  },
];

function Bibliotheken() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-bold">Bibliotheken & Lizenzen</h1>
      <p className="text-sm text-muted-foreground">
        Diese Anwendung nutzt die folgende Open-Source-Software. Die Rechte verbleiben bei den
        jeweiligen Autoren; die vollständigen Lizenztexte sind über die verlinkten Projektseiten
        abrufbar.
      </p>

      <div className="surface overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Paket</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Lizenz</th>
              <th className="px-4 py-3">Verwendung</th>
            </tr>
          </thead>
          <tbody>
            {libs.map((l) => (
              <tr key={l.name} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <a className="underline" href={l.url} target="_blank" rel="noreferrer">
                    {l.name}
                  </a>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{l.version}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.license}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        MIT-, ISC- und Apache-2.0-Lizenzen erlauben die kommerzielle Nutzung unter Beibehaltung der
        jeweiligen Copyright- und Lizenzhinweise.
      </p>
    </article>
  );
}
