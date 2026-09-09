import { readFileSync, writeFileSync } from "node:fs";

const file = "src/routes/_authenticated/kalkulation.tsx";
let source = readFileSync(file, "utf8");

const replacements = [
  [
    "Zentraler Bereich für Analyse, Grundriss-Kalkulation und Ausschreibungen. Alles bleibt\n          manuell änderbar und geht mit einem Klick ins Angebot.",
    "Kalkulation für normale Kundenangebote: Grundriss optional prüfen, Leistungsdaten erfassen,\n          Preis kontrollieren und direkt ein Angebot erstellen.",
  ],
  [
    '<TabsTrigger value="ausschreibung">Ausschreibung (Angebot & Vergabe)</TabsTrigger>',
    '<TabsTrigger value="ausschreibung">Angebot erstellen</TabsTrigger>',
  ],
  [
    'title="Grundriss (Planung)"',
    'title="Grundriss & Objekt (optional)"',
  ],
  [
    'text="Grundlage der Kalkulation: Grundrisse und Objektfotos hochladen, Flächen, Räume und Etagen dokumentieren und den Reinigungsaufwand berechnen. Die hier ermittelten Werte fließen automatisch in die Ausschreibung und in die Kennzahlen."',
    'text="Optionaler Schritt für normale Angebote: Grundriss oder Objektfoto prüfen, Flächen, Räume und Etagen dokumentieren und die Werte anschließend in die Kalkulation übernehmen."',
  ],
  [
    'title="Ausschreibung (Angebot & Vergabe)"',
    'title="Angebot erstellen"',
  ],
  [
    'text="Hier entsteht das offizielle Angebot: Ausschreibungstext verfassen, Vergabeunterlagen (z. B. Vergabe Saarland) hinterlegen, Leistungspositionen kalkulieren und den geprüften Preis direkt als Angebot übernehmen. Flächen und Stunden stammen aus dem Grundriss-Tab."',
    'text="Hier entsteht das normale Kundenangebot: Angebotspositionen prüfen, Preis und Steuer kontrollieren und die bestätigte Kalkulation direkt als Angebot übernehmen."',
  ],
  [
    '<FileSignature className="size-5" /> Angebots- & Ausschreibungstext',
    '<FileSignature className="size-5" /> Angebotstext',
  ],
  [
    "Offizieller Text für die Vergabestelle. Er wird beim Übernehmen als Einleitungstext\n                in das Angebot geschrieben und bleibt dort änderbar.",
    "Optionaler Einleitungstext für den Kunden. Er wird beim Übernehmen in das Angebot geschrieben\n                und bleibt dort jederzeit änderbar.",
  ],
  [
    '<Label>Bezeichnung der Ausschreibung / Vergabe</Label>',
    '<Label>Bezeichnung des Angebots</Label>',
  ],
  [
    'placeholder="z. B. Unterhaltsreinigung Verwaltungsgebäude – Vergabe Saarland, Los 2"',
    'placeholder="z. B. Unterhaltsreinigung Büro Musterkunde"',
  ],
  [
    '<Label>Vergabeunterlagen</Label>',
    '<Label>Unterlagen zum Angebot (optional)</Label>',
  ],
  [
    "Ausschreibungsunterlagen (PDF, Leistungsverzeichnis, Formblätter) hochladen und\n                    mit dieser Kalkulation verknüpfen. Über „Datei analysieren“ werden Positionen\n                    automatisch vorgeschlagen.",
    "PDFs oder Objektunterlagen können optional mit dieser Kalkulation verknüpft werden.\n                    Über „Datei analysieren“ können später automatisch Positionen vorgeschlagen werden.",
  ],
  [
    'label="Vergabeunterlage hochladen"',
    'label="Unterlage hochladen"',
  ],
  [
    "Noch keine Vergabeunterlagen hinterlegt.",
    "Noch keine Unterlagen hinterlegt.",
  ],
  [
    "Positionen der Ausschreibung bzw. des Angebots – vom Assistenten erzeugt oder\n                  manuell ergänzt. Jede Zeile bleibt frei änderbar.",
    "Positionen des normalen Kundenangebots – automatisch vorgeschlagen oder manuell ergänzt.\n                  Jede Zeile bleibt frei änderbar.",
  ],
  [
    "Das Leistungsverzeichnis weicht vom aktuellen Vorschlag ab: Bereich\n                      „Kalkulation" {formatMoney(lvCalcTotal)} statt {formatMoney(suggested)}. Ein\n                      Angebot würde den veralteten Stand übernehmen.",
    "Die Angebotspositionen weichen vom aktuellen Kalkulationsvorschlag ab: Bereich\n                      „Kalkulation" {formatMoney(lvCalcTotal)} statt {formatMoney(suggested)}. Bitte\n                      die aktuellen Werte übernehmen, bevor das Angebot erstellt wird.",
  ],
  [
    "Grundkalkulation für Angebot übernehmen",
    "Kalkulationswerte als Angebotspositionen übernehmen",
  ],
  [
    "Positionen aus Projekt-LV laden",
    "Positionen aus verknüpftem Projekt laden",
  ],
  [
    "LV als PDF exportieren",
    "Positionen als PDF exportieren",
  ],
  [
    "Positionen im Leistungsverzeichnis",
    "Angebotspositionen",
  ],
  [
    "Die Gesamtsumme ergibt sich ausschließlich aus Menge × Einzelpreis der\n                    LV-Positionen – ohne stille Ausgleichsposition.",
    "Die Gesamtsumme ergibt sich ausschließlich aus Menge × Einzelpreis der\n                    Angebotspositionen – ohne versteckte Zusatzposition.",
  ],
  [
    "Quelle: Grundkalkulation (primär für Ausschreibungen/LV). Über „Grundkalkulation\n                    für Angebot übernehmen“ werden diese Werte als Positionen in das\n                    Leistungsverzeichnis geschrieben. Maßgeblich für Angebot und PDF ist immer die\n                    Summe der LV-Positionen.",
    "Die Grundkalkulation ist der aktuelle Preisvorschlag. Über „Kalkulationswerte als\n                    Angebotspositionen übernehmen“ werden daraus die Positionen für das Kundenangebot.\n                    Maßgeblich für das Angebot ist anschließend die Summe dieser Angebotspositionen.",
  ],
  [
    "Leistungsverzeichnis enthält andere Positionen",
    "Angebot enthält andere Positionen",
  ],
  [
    "Das Leistungsverzeichnis enthält bereits {pendingApply?.foreignCount} Position(en)\n              anderer Herkunft ({formatMoney(pendingApply?.foreignTotal ?? 0)}). Sollen diese\n              erhalten bleiben oder komplett durch „{pendingApply?.label}“ ersetzt werden?",
    "Das Angebot enthält bereits {pendingApply?.foreignCount} Position(en) anderer Herkunft\n              ({formatMoney(pendingApply?.foreignTotal ?? 0)}). Sollen diese erhalten bleiben oder\n              komplett durch „{pendingApply?.label}“ ersetzt werden?",
  ],
  [
    "LV komplett ersetzen",
    "Alle Angebotspositionen ersetzen",
  ],
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) {
    console.error(`Abbruch: erwarteter Text nicht gefunden:\n${from}`);
    process.exit(1);
  }
  source = source.replace(from, to);
}

writeFileSync(file, source, "utf8");
console.log("Kalkulation UI cleanup applied successfully.");
