# Konzept: Klare Trennung von KI-Analyse und Leistungsverzeichnis

## Ist-Zustand (Ursache der Verwirrung)

Es gibt heute nur **einen** Positions-Speicher: den State `aiItems` (daraus abgeleitet `lvPositions`). Drei Quellen schreiben ohne Rückfrage direkt hinein:

- KI-Assistent (`aiSuggest.onSuccess`) → `setAiItems(list)` — **ersetzt sofort alles**, ohne Button.
- Grundriss-/Dokumenten-Scan → hängt Positionen **an** (`setAiItems(prev => [...prev, ...posFromItems])`).
- „Kalkulation übernehmen" (`applyCalculation`) → ersetzt nur den Bereich `Kalkulation`, behält Fremdbereiche.

Angebot und PDF entstehen immer aus `lvPositions`. Weil die KI-Positionen dort ungefragt landen, entsteht der Eindruck eines „veralteten LV": die KI hatte den letzten Schreibzugriff, nicht die Grundkalkulation.

## Zielstruktur: drei Zustände statt einem

```text
[ A ] KI-Analyse (Grundriss)        [ B ] Grundkalkulation
      eigener State: kiItems              abgeleitet: stagedPositions
      eigene Summe, eigene Tabelle        eigene Summe, eigene Tabelle
             |                                    |
   "Für Angebot übernehmen"           "Für Angebot übernehmen"
             \                                    /
              -----> [ C ] Leistungsverzeichnis <-----
                     State: lvItems (einzige Quelle
                     für Angebot / PDF / Speicherung)
```

- **A — KI-Analyse (Grundriss):** neuer, eigener State `kiItems`. KI-Antwort und Dokumenten-Scan schreiben ausschließlich hierhin, nie mehr ins LV. Eigene editierbare Positionsliste mit Netto-Summe. Ein Button: „KI-Positionen für Angebot übernehmen".
- **B — Grundkalkulation:** wie heute aus dem Formular berechnet (`stagedPositions`, inkl. Rabattposition). Eigene Positionsvorschau mit Summe. Ein Button: „Grundkalkulation für Angebot übernehmen".
- **C — Leistungsverzeichnis:** bleibt die einzige Quelle für Angebot, PDF, `calculation_items` und `project_lv_items`. Weiterhin manuell editierbar, weiterhin Ziel des Imports „Positionen aus Projekt-LV laden". Kein Bereich schreibt automatisch hinein.

Optisch: drei klar abgegrenzte Karten mit Kopfzeile, Quellen-Badge („Quelle: KI-Analyse" / „Quelle: Grundkalkulation" / „Quelle: manuell / Projekt-LV") und je eigener Nettosumme. Die Vorschau-Karten A und B sind visuell zurückhaltend (Muted-Hintergrund), C ist die Hauptkarte.

## Kollisionsregel beim zweiten Klick

Vorschlag: **Ersetzen pro Herkunftsbereich, nie stilles Dazumischen.**

Jede LV-Zeile trägt bereits `section`. Diese wird zum Herkunftsschlüssel:

| Herkunft | `section` |
| --- | --- |
| Grundkalkulation | `Kalkulation` |
| KI-Analyse | `KI-Analyse` |
| Projekt-LV / manuell | vorhandener Bereich bzw. `Manuell` |

Ein Klick auf „Für Angebot übernehmen" ersetzt **nur die Zeilen der eigenen Herkunft** und lässt alle anderen unangetastet. Damit kann nichts dupliziert werden (wiederholtes Klicken ist idempotent) und nichts aus dem anderen Bereich wird stillschweigend gelöscht.

Damit trotzdem nichts unbemerkt „stehen bleibt": enthält das LV beim Klick bereits Zeilen des jeweils **anderen** Bereichs, erscheint ein Bestätigungsdialog:

> Das Leistungsverzeichnis enthält bereits 3 Position(en) aus der KI-Analyse (127,50 €).
> [ Nur ersetzen – andere behalten ] [ LV komplett ersetzen ] [ Abbrechen ]

- „Nur ersetzen" = Standard (Default-Button), reine Bereichsersetzung.
- „LV komplett ersetzen" = alle Zeilen verwerfen, nur die neue Quelle schreiben; für den typischen Fall „ich will eindeutig nur die KI-Positionen im Angebot".
- Ohne Kollision (LV leer oder nur eigene Herkunft) kein Dialog, direktes Übernehmen mit Toast.

Ergänzend bleibt der bestehende Abweichungs-Hinweis erhalten, jetzt aber pro Quelle: zeigt eine Quelle eine andere Summe als ihr Abschnitt im LV, erscheint der Warnstreifen „weicht ab – jetzt übernehmen" direkt an dieser Quelle.

## Auswirkung auf Angebot/Beschreibung

Die im letzten Schritt eingeführte Ableitung der Leistungsbeschreibung aus den tatsächlichen LV-Positionen bleibt unverändert gültig und passt zur neuen Struktur, da das Angebot weiterhin ausschließlich aus C entsteht. Zusätzlich wird im Angebots-Schritt die Herkunft angezeigt („LV enthält: 4 Positionen aus Grundkalkulation").

## Technische Details (nur Konzept, keine Umsetzung)

- Datei: `src/routes/_authenticated/kalkulation.tsx`. `kalkulation-engine.ts` bleibt unverändert.
- Neuer State `kiItems: AiItem[]`; `aiItems` wird zu `lvItems` umbenannt (semantisch korrekt) und verliert alle automatischen Schreibzugriffe.
- `aiSuggest.onSuccess` und `scanFile.onSuccess` schreiben nach `kiItems` statt nach `lvItems`; die Formularfelder (Fläche, Stunden, Turnus) dürfen wie bisher vorbelegt werden — das ist Eingabe, kein LV-Schreibzugriff.
- Zwei Übernahme-Funktionen mit gemeinsamer Hilfsfunktion `applySource(section, positions, strategy)` (`strategy: "section" | "replaceAll"`).
- `AiItem.section` wird Pflichtfeld beim Anlegen; Speicherlogik (`source_lv_item_id`-Upsert) bleibt unverändert, da sie bereits sektionsbasiert arbeitet.
- Persistenz: `kiItems` sind reine Vorschläge und werden nicht in `calculation_items` gespeichert (optional später als Snapshot-Feld). Beim Laden einer gespeicherten Kalkulation befüllt sich nur das LV.
