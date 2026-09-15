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
  '<FileText className="size-4" /> Fahrtenbuch PDF',
);

// Im Steuerberater-Bereich soll Fahrtenbuch ausschließlich direkt als PDF
// heruntergeladen werden. Keine Navigation auf eine Fahrtenbuch-Unterseite.
const oldButtons = [
`        <Button
          type="button"
          variant="outline"
          onClick={() => window.location.assign("/steuerberater/fahrtenbuch")}
        >
          <FileText className="size-4" /> Fahrtenbuch
        </Button>`,
`        <Button
          type="button"
          variant="outline"
          onClick={() => window.location.assign("/fahrtenbuch")}
        >
          <FileText className="size-4" /> Fahrtenbuch
        </Button>`,
];

const pdfButton = `        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void (async () => {
              if (fahrtenbuchRows.length === 0) {
                toast.error("Keine Fahrten im gewählten Zeitraum.");
                return;
              }
              const { jsPDF } = await import("jspdf");
              const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
              const margin = 10;
              const pageWidth = doc.internal.pageSize.getWidth();
              const pageHeight = doc.internal.pageSize.getHeight();
              let y = 13;

              const addHeader = () => {
                doc.setFontSize(15);
                doc.text(\`Fahrtenbuch \\${formatDate(from)} – \\${formatDate(to)}\`, margin, y);
                y += 7;
                doc.setFontSize(7);
                doc.text(
                  "Datum | Start | Rückkehr | Fahrzeug | Kennzeichen | Fahrtart | Von | Ziel/Zweck | Nach | Start-km | End-km | km",
                  margin,
                  y,
                );
                y += 5;
              };

              addHeader();
              doc.setFontSize(7);
              for (const row of fahrtenbuchRows) {
                if (y > pageHeight - 12) {
                  doc.addPage();
                  y = 13;
                  addHeader();
                }
                const line = [
                  row["Datum"], row["Startzeit"], row["Rückkehrzeit"], row["Fahrzeug"],
                  row["Kennzeichen"], row["Fahrtart"], row["Von"], row["Kunde / Ziel / Zweck"],
                  row["Zieladresse"], row["Start-km"], row["End-km"], row["Geschäftliche km"],
                ].join(" | ");
                const text = doc.splitTextToSize(line, pageWidth - margin * 2);
                doc.text(text, margin, y);
                y += Math.max(5, text.length * 3.5);
              }

              await saveFile(doc.output("blob"), \`Fahrtenbuch_\\${period}.pdf\`);
            })()
          }
        >
          <FileText className="size-4" /> Fahrtenbuch PDF
        </Button>`;

let replaced = false;
for (const oldButton of oldButtons) {
  if (steuerberater.includes(oldButton)) {
    steuerberater = steuerberater.replace(oldButton, pdfButton);
    replaced = true;
    break;
  }
}

if (!replaced && !steuerberater.includes("Fahrtenbuch PDF")) {
  console.error("Abbruch: Steuerberater-Fahrtenbuch-Button nicht gefunden.");
  process.exit(1);
}

writeFileSync(steuerberaterFile, steuerberater, "utf8");

console.log("Navigation finalisiert: Fahrtenbuch im Hauptmenü; Steuerberater lädt Fahrtenbuch nur als PDF herunter.");
