import { readFileSync, writeFileSync } from "node:fs";

function replaceStrict(source, from, to, label = from.slice(0, 80)) {
  if (!source.includes(from)) {
    console.error(`Abbruch: erwarteter Text nicht gefunden (${label}).`);
    process.exit(1);
  }
  return source.replace(from, to);
}

const kalkFile = "src/routes/_authenticated/kalkulation.tsx";
let source = readFileSync(kalkFile, "utf8");

const replacements = [
  [
    "Zentraler Bereich für Analyse, Grundriss-Kalkulation und Ausschreibungen. Alles bleibt\n          manuell änderbar und geht mit einem Klick ins Angebot.",
    "Kalkulation für normale Kundenangebote: Grundriss optional prüfen, Leistungsdaten erfassen,\n          Preis kontrollieren und direkt ein Angebot erstellen.",
  ],
  ['<TabsTrigger value="grundriss">Grundriss (Planung)</TabsTrigger>', '<TabsTrigger value="grundriss">Grundriss & Objekt</TabsTrigger>'],
  ['<TabsTrigger value="ausschreibung">Ausschreibung (Angebot & Vergabe)</TabsTrigger>', '<TabsTrigger value="ausschreibung">Angebot erstellen</TabsTrigger>'],
  ['title="Grundriss (Planung)"', 'title="Grundriss & Objekt (optional)"'],
  [
    'text="Grundlage der Kalkulation: Grundrisse und Objektfotos hochladen, Flächen, Räume und Etagen dokumentieren und den Reinigungsaufwand berechnen. Die hier ermittelten Werte fließen automatisch in die Ausschreibung und in die Kennzahlen."',
    'text="Optionaler Schritt für normale Angebote: Grundriss oder Objektfoto prüfen, Flächen, Räume und Etagen dokumentieren und die bestätigten Werte in die Kalkulation übernehmen."',
  ],
  ['title="Ausschreibung (Angebot & Vergabe)"', 'title="Angebot erstellen"'],
  [
    'text="Hier entsteht das offizielle Angebot: Ausschreibungstext verfassen, Vergabeunterlagen (z. B. Vergabe Saarland) hinterlegen, Leistungspositionen kalkulieren und den geprüften Preis direkt als Angebot übernehmen. Flächen und Stunden stammen aus dem Grundriss-Tab."',
    'text="Hier entsteht das normale Kundenangebot: Angebotspositionen prüfen, Preis und Steuer kontrollieren und die bestätigte Kalkulation direkt als Angebot übernehmen."',
  ],
  ['<FileSignature className="size-5" /> Angebots- & Ausschreibungstext', '<FileSignature className="size-5" /> Angebotstext'],
  [
    "Offizieller Text für die Vergabestelle. Er wird beim Übernehmen als Einleitungstext\n                in das Angebot geschrieben und bleibt dort änderbar.",
    "Optionaler Einleitungstext für den Kunden. Er wird beim Übernehmen in das Angebot geschrieben\n                und bleibt dort jederzeit änderbar.",
  ],
  ['<Label>Bezeichnung der Ausschreibung / Vergabe</Label>', '<Label>Bezeichnung des Angebots</Label>'],
  ['placeholder="z. B. Unterhaltsreinigung Verwaltungsgebäude – Vergabe Saarland, Los 2"', 'placeholder="z. B. Unterhaltsreinigung Büro Musterkunde"'],
  [
    "Positionen der Ausschreibung bzw. des Angebots – vom Assistenten erzeugt oder\n                  manuell ergänzt. Jede Zeile bleibt frei änderbar.",
    "Positionen des normalen Kundenangebots – automatisch vorgeschlagen oder manuell ergänzt.\n                  Jede Zeile bleibt frei änderbar.",
  ],
  [
    'Das Leistungsverzeichnis weicht vom aktuellen Vorschlag ab: Bereich\n                      „Kalkulation" {formatMoney(lvCalcTotal)} statt {formatMoney(suggested)}. Ein\n                      Angebot würde den veralteten Stand übernehmen.',
    'Die Angebotspositionen weichen vom aktuellen Kalkulationsvorschlag ab: Bereich\n                      „Kalkulation" {formatMoney(lvCalcTotal)} statt {formatMoney(suggested)}. Bitte\n                      die aktuellen Werte übernehmen, bevor das Angebot erstellt wird.',
  ],
  ["Grundkalkulation für Angebot übernehmen", "Kalkulationswerte als Angebotspositionen übernehmen"],
  ["Positionen aus Projekt-LV laden", "Positionen aus verknüpftem Projekt laden"],
  ["LV als PDF exportieren", "Positionen als PDF exportieren"],
  ["Positionen im Leistungsverzeichnis", "Angebotspositionen"],
  [
    "Die Gesamtsumme ergibt sich ausschließlich aus Menge × Einzelpreis der\n                    LV-Positionen – ohne stille Ausgleichsposition.",
    "Die Gesamtsumme ergibt sich ausschließlich aus Menge × Einzelpreis der\n                    Angebotspositionen – ohne versteckte Zusatzposition.",
  ],
  [
    "Quelle: Grundkalkulation (primär für Ausschreibungen/LV). Über „Grundkalkulation\n                    für Angebot übernehmen“ werden diese Werte als Positionen in das\n                    Leistungsverzeichnis geschrieben. Maßgeblich für Angebot und PDF ist immer die\n                    Summe der LV-Positionen.",
    "Die Grundkalkulation ist der aktuelle Preisvorschlag. Über „Kalkulationswerte als\n                    Angebotspositionen übernehmen“ werden daraus die Positionen für das Kundenangebot.\n                    Maßgeblich für das Angebot ist anschließend die Summe dieser Angebotspositionen.",
  ],
  ["Leistungsverzeichnis enthält andere Positionen", "Angebot enthält andere Positionen"],
  [
    "Das Leistungsverzeichnis enthält bereits {pendingApply?.foreignCount} Position(en)\n              anderer Herkunft ({formatMoney(pendingApply?.foreignTotal ?? 0)}). Sollen diese\n              erhalten bleiben oder komplett durch „{pendingApply?.label}“ ersetzt werden?",
    "Das Angebot enthält bereits {pendingApply?.foreignCount} Position(en) anderer Herkunft\n              ({formatMoney(pendingApply?.foreignTotal ?? 0)}). Sollen diese erhalten bleiben oder\n              komplett durch „{pendingApply?.label}“ ersetzt werden?",
  ],
  ["LV komplett ersetzen", "Alle Angebotspositionen ersetzen"],
  [
    "Diese Positionen sind ein Vorschlag und gelangen erst per Klick ins\n                Leistungsverzeichnis.",
    "Diese Positionen sind ein Vorschlag und gelangen erst nach Ihrer Bestätigung in das Angebot.",
  ],
  [
    'Im Leistungsverzeichnis steht für diesen Bereich {formatMoney(lvKiTotal)} statt{" "}\n                    {formatMoney(kiTotal)}.',
    'In den Angebotspositionen steht für diesen Bereich {formatMoney(lvKiTotal)} statt{" "}\n                    {formatMoney(kiTotal)}.',
  ],
  ['proposalTitle.trim() ? `Ausschreibung: ${proposalTitle.trim()}` : "",', 'proposalTitle.trim() ? `Angebot: ${proposalTitle.trim()}` : "",'],
  ['title: proposalTitle.trim() || `Leistungsverzeichnis ${selected.label}`,', 'title: proposalTitle.trim() || `Angebotspositionen ${selected.label}`,'],
  ['"Leistungsverzeichnis.pdf",', '"Angebotspositionen.pdf",'],
  ['throw new Error("Bitte zuerst LV-Positionen erfassen oder die Kalkulation übernehmen.");', 'throw new Error("Bitte zuerst Angebotspositionen erfassen oder die Kalkulationswerte übernehmen.");'],
  ['toast.error("Im Projekt sind noch keine LV-Positionen erfasst.");', 'toast.error("Im verknüpften Projekt sind noch keine Positionen erfasst.");'],
  ['toast.success(`${rows.length} Positionen aus dem Projekt-LV übernommen`);', 'toast.success(`${rows.length} Positionen aus dem verknüpften Projekt übernommen`);'],
];

for (const [from, to] of replacements) source = replaceStrict(source, from, to);

source = replaceStrict(
  source,
  '  const [tenderDocs, setTenderDocs] = useState<Attachment[]>([]);\n',
  "",
  "tenderDocs state",
);

const tenderStart = '              <div className="space-y-3 rounded-md border p-3">\n                <div>\n                  <Label>Vergabeunterlagen</Label>';
const tenderEnd = '              </div>\n            </CardContent>\n          </Card>';
const startIndex = source.indexOf(tenderStart);
if (startIndex < 0) {
  console.error("Abbruch: Vergabeunterlagen-Block nicht gefunden.");
  process.exit(1);
}
const endIndex = source.indexOf(tenderEnd, startIndex);
if (endIndex < 0) {
  console.error("Abbruch: Ende des Vergabeunterlagen-Blocks nicht gefunden.");
  process.exit(1);
}
source = source.slice(0, startIndex) + '            </CardContent>\n          </Card>' + source.slice(endIndex + tenderEnd.length);

writeFileSync(kalkFile, source, "utf8");

const stbFile = "src/routes/_authenticated/steuerberater.tsx";
let stb = readFileSync(stbFile, "utf8");
const exportMarker = '      <section className="no-print flex flex-wrap gap-2">\n        <Button\n          onClick={() => downloadCsv(`DATEV_Buchungsstapel_${period}.csv`, datevRows, { from, to })}';
const exportReplacement = '      <section className="no-print flex flex-wrap gap-2">\n        <Button variant="outline" onClick={() => { window.location.href = "/steuerberater/fahrtenbuch"; }}>\n          <FileText className="size-4" /> Fahrtenbuch für Steuerberater\n        </Button>\n        <Button\n          onClick={() => downloadCsv(`DATEV_Buchungsstapel_${period}.csv`, datevRows, { from, to })}';
stb = replaceStrict(stb, exportMarker, exportReplacement, "Steuerberater Fahrtenbuch link");
writeFileSync(stbFile, stb, "utf8");

console.log("Staging UI finalisiert: Kalkulation bereinigt und Fahrtenbuch im Steuerberater verlinkt.");
