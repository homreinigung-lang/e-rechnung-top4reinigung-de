import { readFileSync, writeFileSync } from "node:fs";

const appShellFile = "src/components/AppShell.tsx";
let appShell = readFileSync(appShellFile, "utf8").replace(/\r\n/g, "\n");

// Fahrtenbuch im Hauptmenü unter "Arbeit" sichtbar machen.
appShell = appShell.replace(
  '    { to: "/steuerberater/fahrtenbuch", label: "Fahrtenbuch für Steuerberater", icon: Car },\n',
  "",
);
if (!appShell.includes('{ to: "/fahrtenbuch", label: "Fahrtenbuch", icon: Car }')) {
  const marker = '    { to: "/karte", label: "Einsatzkarte", icon: MapIcon },\n';
  const insertion = `${marker}    { to: "/fahrtenbuch", label: "Fahrtenbuch", icon: Car },\n`;
  if (!appShell.includes(marker)) {
    console.error("Abbruch: Arbeit-Menü für Fahrtenbuch-Link nicht gefunden.");
    process.exit(1);
  }
  appShell = appShell.replace(marker, insertion);
}
writeFileSync(appShellFile, appShell, "utf8");

const steuerberaterFile = "src/routes/_authenticated/steuerberater.tsx";
let steuerberater = readFileSync(steuerberaterFile, "utf8").replace(/\r\n/g, "\n");
steuerberater = steuerberater.replace(
  '<FileText className="size-4" /> Fahrtenbuch für Steuerberater',
  '<FileText className="size-4" /> Fahrtenbuch',
);

// Der bisherige verschachtelte Steuerberater-Link rendert wegen fehlendem Outlet
// wieder die Elternseite. Deshalb führt der Button direkt zum funktionierenden
// eigenständigen Fahrtenbuch-Bereich.
steuerberater = steuerberater.replace(
  'window.location.assign("/steuerberater/fahrtenbuch")',
  'window.location.assign("/fahrtenbuch")',
);

if (!steuerberater.includes('window.location.assign("/fahrtenbuch")')) {
  const marker = `      <section className="no-print flex flex-wrap gap-2">\n        <Button\n          onClick={() => downloadCsv(`;
  const insertion = `      <section className="no-print flex flex-wrap gap-2">\n        <Button\n          type="button"\n          variant="outline"\n          onClick={() => window.location.assign("/fahrtenbuch")}\n        >\n          <FileText className="size-4" /> Fahrtenbuch\n        </Button>\n        <Button\n          onClick={() => downloadCsv(`;

  if (!steuerberater.includes(marker)) {
    console.error("Abbruch: Steuerberater-Exportbereich für Fahrtenbuch-Link nicht gefunden.");
    process.exit(1);
  }
  steuerberater = steuerberater.replace(marker, insertion);
}

writeFileSync(steuerberaterFile, steuerberater, "utf8");

console.log("Navigation finalisiert: Fahrtenbuch im Hauptmenü und Steuerberater-Link führen zu /fahrtenbuch.");
