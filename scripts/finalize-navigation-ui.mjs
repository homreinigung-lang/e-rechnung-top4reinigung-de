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
writeFileSync(steuerberaterFile, steuerberater, "utf8");

console.log("Navigation finalisiert: Fahrtenbuch nur im Steuerberater-Bereich.");
