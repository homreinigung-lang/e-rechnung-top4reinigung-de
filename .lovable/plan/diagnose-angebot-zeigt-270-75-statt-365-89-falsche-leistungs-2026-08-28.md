# Diagnose: Angebot zeigt 270,75 € statt 365,89 € + falsche Leistungsbeschreibung

## Befund aus den Daten

Das erzeugte Angebot `AN-DEMO-4812295` (netto 270,75 €) enthält genau diese drei Positionen:

```text
Büroreinigung (ca. 180m²) – 4,33 Einsätze/Monat   6,5 Std. × 35,50 €
Treppenhausreinigung (1 Etage) – 2 Einsätze/Monat   2 Etage × 12,50 €
Material & Verbrauchsmittel                          1 Monat × 15,00 €
```

Es gibt **keinen** gespeicherten Kalkulationsdatensatz (`calculations` ist leer). Nichts wurde also aus einer alten DB-Version geladen.

## Ursache 1 — kein Cache, sondern zwei getrennte Datenquellen

- Der Kasten „Vorschlag Grundkalkulation (netto)" (365,89 €) wird live aus dem Formular berechnet (`stagedPositions` / `buildConsolidatedPositions`).
- Das Leistungsverzeichnis (`aiItems`) ist ein davon **unabhängiger** Zustand. „In Angebot übernehmen" schreibt ausschließlich das LV ins Dokument.
- Die drei Positionen stammen erkennbar aus der KI-Analyse, nicht aus der Grundkalkulation: die Kalkulation erzeugt Texte im Format `Büroreinigung – 180 m² × 0,4 €/m² je Einsatz` und niemals eine Position „Material & Verbrauchsmittel".

Fazit: „Kalkulation übernehmen" wurde vor dem Angebot nicht (bzw. nicht nach der letzten Eingabeänderung) gedrückt. Das LV blieb auf dem KI-Stand. Es gibt aktuell **keinerlei Warnung**, wenn LV-Summe und Vorschlag auseinanderlaufen — das Angebot entsteht stillschweigend aus dem veralteten LV.

## Ursache 2 — Beschreibungstext kommt aus dem Formular, nicht aus den Positionen

Die gespeicherte `service_description` lautet:

```text
Büroreinigung
180 m² × 0,40 €/m²
1 Einsätze pro Woche (× 4,33 = 4,33 pro Monat)
Treppenhausreinigung: 1 Etagen × 12,50 €/Etage
```

Dieser Block wird in `toQuote` aus dem aktuellen Formularzustand zusammengebaut (`mode === "area"` → m²-Zeile), völlig unabhängig davon, welche Positionen tatsächlich abgerechnet werden (hier Stunden aus der KI). Deshalb widersprechen sich Text (m²-Methode) und Abrechnung (Std.).

## Vorschlag zur Behebung (nach Abstimmung)

1. **Synchronitäts-Sperre / Warnung**: Vor „In Angebot übernehmen" prüfen, ob die Summe des Bereichs „Kalkulation" im LV der aktuellen Grundkalkulation entspricht. Bei Abweichung ein deutlicher Hinweis im UI („LV weicht vom aktuellen Vorschlag ab – 270,75 € statt 365,89 €") plus Button „Jetzt übernehmen"; das Angebot wird erst nach bewusster Entscheidung erzeugt.
2. **Beschreibung aus den echten Positionen ableiten**: Die Methodenzeile (Std. vs. m²) nicht mehr aus `mode`, sondern aus den tatsächlichen LV-Positionen bilden (Einheit „Std." → Stundenmethode mit Menge × Stundensatz; „Einsatz"/m²-Position → Flächenmethode). Formularwerte, die in keiner Position vorkommen, entfallen aus dem Text.
3. Optional: Anzeige der LV-Summe direkt neben dem Vorschlag mit farblicher Differenz-Markierung, damit der Unterschied schon beim Kalkulieren sichtbar ist.

## Technische Details

- `src/routes/_authenticated/kalkulation.tsx`: `stagedPositions` (Vorschlag) vs. `lvPositions`/`aiItems` (Quelle des Angebots); `applyCalculation` ersetzt nur den Bereich „Kalkulation"; `toQuote` baut `parts` aus `mode`, `area`, `pricePerSqm`, `hours`, `hourlyRate`.
- Änderungen betreffen nur diese Datei (Warnlogik + Beschreibungsaufbau); die Rechenkerne in `src/lib/kalkulation-engine.ts` bleiben unverändert.
