# Prüfbericht Kalkulation (nur Analyse, keine Änderungen)

Geprüft: `src/routes/_authenticated/kalkulation.tsx`, `src/lib/kalkulation-engine.ts`, `src/components/KalkulationAnalytics.tsx`, `src/components/Leistungswerte.tsx`, `src/lib/leistungswerte.ts`, `src/lib/raumbuch.ts` sowie die Module, die dieselbe Engine nutzen (`lv-analyse/aggregate.ts`, `lv-analyse/calculation.ts`, `lv-pdf.ts`) und der Belegeditor `dokumente.$id.tsx`.

## Kritisch

1. **Verwaister Test ohne Produktivcode** — `src/lib/document-totals.test.ts:4-16` rechnet die Summenkette (Rabatt → Netto → MwSt → Brutto) in einer eigenen Testfunktion nach; `src/lib/document-totals.ts` existiert nicht. Der Test bestätigt also eine Kopie, nicht die produktive Logik in `dokumente.$id.tsx:348-352`. Änderungen am Belegeditor bleiben ungetestet.
2. **Zwei parallele Rundungs-Implementierungen** — `kalkulation-engine.ts:25-36` (`toCents/fromCents/round2`) und `format.ts:21-24` (`roundCents`). Aktuell verhalten sie sich fast gleich, aber Kalkulation/LV-Analyse/LV-PDF laufen über die Engine, Belegeditor und Dokument-PDF über `roundCents`. Eine spätere Änderung an einer Seite erzeugt abweichende Beträge zwischen Kalkulation und Angebot/Rechnung.

## Wichtig

3. **Ungerundete MwSt-Anzeige je Position** — `dokumente.$id.tsx:2086`: `item.quantity * item.unit_price * (1 + vatRate/100)` ohne `roundCents`. Nur Anzeige (fließt nicht in gespeicherte Summen), kann aber sichtbar um einen Cent von der Endsumme abweichen.
4. **Kennzahlen ohne Mandantenfilter im Code** — `KalkulationAnalytics.tsx:60-70` liest `projects`, `time_entries`, `project_assignments`, `documents` ohne `user_id`-Filter. Abgesichert allein durch RLS. Für Mitarbeiter-Accounts greift zusätzlich die Policy „employee reads assigned projects", d. h. dieselbe Auswertung zeigt je nach Rolle unterschiedliche Grundgesamtheiten (Projekte sichtbar, Zeiten/Belege ggf. nicht) — Umsatz und Marge können dadurch systematisch zu niedrig erscheinen, statt gar nicht angezeigt zu werden.
5. **„Umsatz" ist kalkulatorisch, nicht abgerechnet** — `KalkulationAnalytics.tsx:92`: Projektumsatz = Ist-Stunden × `projects.hourly_rate`. Im Trend-Diagramm (`:129-141`) ist „Umsatz" dagegen die Summe der Rechnungs-Nettobeträge. Zwei verschiedene Umsatzbegriffe unter demselben Wort in einer Ansicht.
6. **Stornorechnungen nicht ausgeklammert** — `KalkulationAnalytics.tsx:124` filtert nur `type === "invoice"` und `status !== "draft"`; `is_storno` wird geladen, aber nicht ausgewertet. Stornos erhöhen den Trendumsatz statt ihn zu mindern.
7. **Soll-Stunden mit fester Monatsumrechnung** — `KalkulationAnalytics.tsx:98-100`: `hours_per_week × WEEKS_PER_MONTH` als Soll für einen beliebigen Zeitraum, während die Ist-Stunden über **alle** je erfassten Einträge laufen (kein Datumsfilter, `:87-90`). Die Effizienzquote vergleicht damit Gesamt-Ist gegen Ein-Monats-Soll und ist praktisch immer > 100 %.
8. **Rabattposition ohne Schutz beim Angebot** — `kalkulation.tsx:1130,1174-1184,1202-1205` überträgt die negative Rabattposition als eigene Zeile und setzt `discount_percent/amount` bewusst auf 0. Korrekt beim Anlegen; ein späteres Setzen eines Dokumentrabatts im Belegeditor zieht den Rabatt jedoch ein zweites Mal ab, ohne Warnung.
9. **Leistungswerte ohne Wertvalidierung** — `Leistungswerte.tsx:59-77,174`: `sqm_per_hour` wird als `Number(...) || 0` gespeichert; der Wert 0 oder ein negativer Wert ist speicherbar. In `leistungswerte.ts:127-131` gilt `perHour <= 0` dann als „unmatched" und der Raum fällt still aus der Stundenberechnung.
10. **Stiller Fallback im Raumbuch** — `raumbuch.ts:47,60-62`: Fehler bei `performance_rates`/`projects` werden nicht geprüft (nur `roomsRes.error`), bei leerem Ergebnis greifen Default-Werte bzw. `sqm_per_hour = 0`. Der Nutzer sieht keine Meldung, dass mit Branchenrichtwerten statt eigenen Werten gerechnet wurde.
11. **Duplikate bei Standard-Leistungswerten** — `Leistungswerte.tsx:43-51` fügt `DEFAULT_PERFORMANCE_RATES` ohne Prüfung auf bereits vorhandene Zeilen ein; mehrfaches Klicken erzeugt doppelte Sätze, die `findRate` willkürlich auflösen lässt.

## Nice-to-have

12. **Rundung zweimal auf demselben Wert** — `kalkulation-engine.ts:317-322` rundet je Position und danach die Summe; mathematisch unschädlich, aber der doppelte Schritt verschleiert, welche Ebene maßgeblich ist.
13. **Kein Datumsbereich in den Kennzahlen** — die Projekttabelle summiert alle Zeiten seit Beginn; ein Zeitraumfilter (Jahr/Quartal) würde die Aussagen erst vergleichbar machen.
14. **`round2` dreifach lokal definiert** — u. a. `KalkulationAnalytics.tsx:22-24` und `lv-analyse/aggregate.ts:6` statt Import aus der Engine.

## Ausdrücklich in Ordnung

- Rundungsreihenfolge ist projektweit gleich: Positionen cent-genau → Summe → MwSt auf die Nettosumme → Brutto.
- MwSt-Satz kommt überall aus `vatRateForTaxMode` (`format.ts:153`), `tax_mode`/`reverse_charge` werden beim Angebot korrekt mitgeschrieben (`kalkulation.tsx:1207-1209`).
- Gemeinkosten/Gewinn wirken nur im LV-Analyse-Modul und dort korrekt vor MwSt (`lv-analyse/calculation.ts:58-71`).
- RLS: `calculations`, `calculation_items`, `performance_rates`, `project_rooms`, `project_lv_items`, `projects` haben jeweils eine `ALL`-Policy `auth.uid() = user_id` in USING **und** WITH CHECK, GRANTs für `authenticated`/`service_role` sind in den Migrationen vorhanden.

## Vorgeschlagene Reihenfolge bei Freigabe

1 → 2 (gemeinsame Summenlogik in ein Modul ziehen und den vorhandenen Test darauf richten), danach 6/7/5 (Kennzahlen korrigieren), dann 9/10/11 (Leistungswerte robust machen), zuletzt 3/8 und die Nice-to-haves.
