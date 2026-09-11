import { readFileSync, writeFileSync } from "node:fs";

const appShellFile = "src/components/AppShell.tsx";
let appShell = readFileSync(appShellFile, "utf8").replace(/\r\n/g, "\n");
appShell = appShell.replace(
  '    { to: "/steuerberater/fahrtenbuch", label: "Fahrtenbuch für Steuerberater", icon: Car },\n',
  "",
);
writeFileSync(appShellFile, appShell, "utf8");

const steuerberaterFile = "src/routes/_authenticated/steuerberater.tsx";
let steuerberater = readFileSync(steuerberaterFile, "utf8").replace(/\r\n/g, "\n");
steuerberater = steuerberater.replace(
  '<FileText className="size-4" /> Fahrtenbuch für Steuerberater',
  '<FileText className="size-4" /> Fahrtenbuch',
);

// Fahrtenbuch im Steuerberater-Bereich immer als echte Navigation zur eigenen
// Export-Seite anbieten. Kein leeres Button-Submit und kein Seiten-Refresh.
if (!steuerberater.includes('window.location.assign("/steuerberater/fahrtenbuch")')) {
  const marker = `      <section className="no-print flex flex-wrap gap-2">\n        <Button\n          onClick={() => downloadCsv(`;
  const insertion = `      <section className="no-print flex flex-wrap gap-2">\n        <Button\n          type="button"\n          variant="outline"\n          onClick={() => window.location.assign("/steuerberater/fahrtenbuch")}\n        >\n          <FileText className="size-4" /> Fahrtenbuch\n        </Button>\n        <Button\n          onClick={() => downloadCsv(`;

  if (!steuerberater.includes(marker)) {
    console.error("Abbruch: Steuerberater-Exportbereich für Fahrtenbuch-Link nicht gefunden.");
    process.exit(1);
  }
  steuerberater = steuerberater.replace(marker, insertion);
}

writeFileSync(steuerberaterFile, steuerberater, "utf8");

console.log("Navigation finalisiert: Fahrtenbuch nur im Steuerberater-Bereich und als eigene Export-Seite.");
