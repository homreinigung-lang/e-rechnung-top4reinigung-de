# Konzept: PDF-Formular-Ausfüller für Leistungsverzeichnisse

Additive, eigenständige Funktion im Ausschreibungs-Bereich. Keine Änderung an Kalkulation, KI-Analyse, LV-Positionen, Angebots-/PDF-Erzeugung, Steuerlogik oder Mandantentrennung.

## 1. Ablauf aus Nutzersicht

```text
Upload LV-PDF
      |
   Erkennung
   /        \
AcroForm    flaches PDF
   |             |
Feld-Mapping   OCR/Textlayer-Analyse -> Vorschläge
   \             /
    Bildschirm-Vorschau (Seitenbild + Wert-Marker, verschiebbar/editierbar)
                |
        Plausibilitätsprüfung (Mindeststunden etc.)
                |
     Explizite Bestätigung "Ausgefülltes PDF erzeugen"
                |
          Download / Ablage bei den Projektunterlagen
```

Ohne Klick auf die Bestätigung entsteht nie eine Ausgabedatei.

## 2. Zwei-Wege-Erkennung

- **AcroForm-Pfad:** `pdf-lib` (bereits im Projekt) liest `getForm().getFields()`. Sind Felder vorhanden, werden Feldnamen per Heuristik (Normalisierung + Schlüsselwörter wie "pauschal", "monat", "stunden", "wertung", "brutto") den Kennzahlen zugeordnet. Zuordnung bleibt in der Vorschau änderbar (Dropdown je Feld). Ausfüllen über `setText` + `form.flatten()`.
- **Flach-Pfad:** kein AcroForm → ausschließlich Vorschlagsmodus, nie automatischer Export.

## 3. Positions-/Layouterkennung in flachen PDFs

1. **Textlayer zuerst:** `pdfjs-dist` `page.getTextContent()` liefert je Textfragment Inhalt und Transformationsmatrix (x, y, Breite). Damit werden Zeilen rekonstruiert (Gruppierung nach y-Toleranz, Sortierung nach x).
2. **Platzhalter finden:** Regex auf Unterstrich-Ketten (`_{3,}`) sowie auf Muster „Label … ______ €“. Anker ist das Label links davon; die Schreibposition ist die Baseline der Unterstrich-Kette, leicht angehoben, linksbündig nach dem ersten Unterstrich.
3. **Label-Klassifikation:** Wörterbuch mit deutschen LV-Begriffen → interne Kennzahl:
   - Pauschalpreis pro Monat (Unterhaltsreinigung)
   - zugrunde liegende Stunden/Monat
   - Wertungseintrag Unterhaltsreinigung
   - Grundreinigung Pauschale 1x jährlich, Stunden/Jahr
   - Stundenverrechnungssatz Sonderaufträge, fiktives Kontingent
   - Jahresbetrag netto, MwSt-Satz, MwSt-Betrag, Jahresbetrag brutto
   Jede Zuordnung bekommt einen Confidence-Wert (exakter Treffer / Teiltreffer / unsicher).
4. **Kennzahlen aus Fließtext:** separate Regex für Vorgaben wie „Mindestumfang … 220,5 Stunden pro Monat“ oder „10 Std./Jahr“ → als Constraints gespeichert, nicht als Eingabefelder.
5. **Fallback ohne Textlayer (Scan):** Seite wird per pdfjs auf Canvas gerendert; OCR-freier Fallback = manuelles Setzen der Marker durch Klick in die Vorschau. Keine stillschweigende Rateaktion.

Alle Positionen werden in PDF-Punkten relativ zur Seitengröße gespeichert, damit Vorschau (Bild, skaliert) und Ausgabe (pdf-lib `drawText`) deckungsgleich sind.

## 4. Vorschau- und Korrekturoberfläche

- Linke Spalte: Seitenbild (pdfjs-Canvas), darüber absolut positionierte Marker-Chips mit dem vorgeschlagenen Wert. Chips sind per Drag verschiebbar, per Klick editierbar, per Kontextmenü löschbar; „Wert hier einfügen“ per Klick auf freie Stelle.
- Farbcodierung: grün = sicher erkannt, gelb = unsicher, grau = abgeleiteter Rechenwert, rot = Plausibilitätswarnung.
- Rechte Spalte: Eingabeformular mit den Basiswerten (Monatspauschale, Stunden/Monat, Grundreinigung-Pauschale, Stunden/Jahr, Stundensatz Sonderaufträge, MwSt-Satz). Deutsche Zahleneingabe (Komma), Anzeige über bestehende `formatNumber`-Konventionen.
- Unterhalb: Liste der abgeleiteten Werte (schreibgeschützt) mit Rechenweg-Hinweis.
- Fußzeile: Warnbanner + Button „Ausgefülltes PDF erzeugen“, deaktiviert solange eine harte Warnung nicht bestätigt wurde.
- Optional: Werte aus einer bestehenden Kalkulation nur **lesend** übernehmen (Auswahlliste, Copy-in). Keine Rückschreibung in Kalkulation oder LV.

## 5. Abgeleitete Rechenwerte (nicht manuell eingebbar)

- Wertungseintrag Unterhaltsreinigung = Monatspauschale × 12
- Wertungseintrag Grundreinigung = Jahrespauschale × 1
- Wertungseintrag Sonderaufträge = Stundenverrechnungssatz × fiktives Kontingent
- Jahresbetrag netto = Summe der Wertungseinträge
- MwSt = netto × Satz; brutto = netto + MwSt

Rechnung in Integer-Cent, Rundung erst bei der Ausgabe — analog zur bestehenden Praxis, aber in einem eigenen Modul, ohne Wiederverwendung/Änderung der Kalkulations-Engine.

## 6. Plausibilitätsprüfungen

- **Hart (blockierend bis Bestätigung):** eingetragene Stunden/Monat < erkannter Mindestumfang; Stunden/Jahr < genannter Mindestumfang; Pauschale oder Stundensatz = 0.
- **Weich (Hinweis):** rechnerischer Stundensatz (Monatspauschale ÷ Stunden) außerhalb eines plausiblen Korridors; MwSt-Satz ≠ 19 %; Jahresbetrag weicht stark von einer verknüpften Kalkulation ab.
- Jede harte Warnung nennt Fundstelle im Dokument („Seite 1: Mindestumfang 220,5 Std./Monat“) und verlangt eine explizite Checkbox „Abweichung ist gewollt“.

## 7. Isolation gegenüber bestehendem Code

- Neue Route: `src/routes/_authenticated/lv-formular.tsx` (Einstieg zusätzlich als eigener Button im Ausschreibungs-Bereich, rein additiv eingefügt).
- Neue Module ausschließlich unter `src/lib/lv-form/` (`detect.ts`, `layout.ts`, `derive.ts`, `validate.ts`, `fill.ts`) und `src/components/lv-form/`.
- Keine Importe aus `kalkulation-engine.ts`, `lv-pdf.ts`, `invoice-pdf.ts`, `erechnung.ts`; nur generische Helfer (`format`, `pdf-text`, UI-Komponenten) werden lesend genutzt.
- Persistenz optional in einer neuen Tabelle `lv_form_fills` (eigene RLS analog bestehender Mandantenregeln, eigene GRANTs). Bestehende Tabellen bleiben unverändert; ohne Persistenz-Wunsch bleibt alles rein clientseitig plus Datei-Ablage.
- Neue Abhängigkeit: `pdfjs-dist` (nur clientseitig geladen, hinter `ClientOnly`/dynamischem Import, damit SSR unberührt bleibt). `pdf-lib` ist bereits vorhanden.
- Verifikation: bestehende Tests unverändert lauffähig, neue Unit-Tests nur für die neuen Module (Zahlenparser, Ableitungen, Warnlogik).

## 8. Umfang / Reihenfolge bei Umsetzung

1. Erkennung + Textlayer-Analyse (AcroForm & flach), reine Logik mit Tests
2. Vorschau-UI mit Markern und manueller Korrektur
3. Ableitungen + Plausibilitätsprüfungen
4. Export via pdf-lib inkl. Bestätigungsschritt und Ablage bei den Projektunterlagen

Nur Konzept — Umsetzung erst nach Ihrer Freigabe.
