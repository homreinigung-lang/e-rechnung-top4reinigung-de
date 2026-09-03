# Code-Prüfung LV-Analyse-Bereich (nur Analyse, kein Code geändert)

Geprüft: `LvAnalyse.tsx`, `LvPositionenTabelle.tsx`, `aggregate.ts`, `calculation.ts`, `classify.ts`, `export.ts`, `gaeb.ts`, `normalize.ts`, `pipeline.ts`, `types.ts`, `validate.ts`, `lv-analyse.functions.ts`, `lv-pdf.ts` sowie die RLS-Lage von `lv_import_logs` (per DB-Abfrage geprüft).

## Kritisch

1. **Intervall „zweiwöchentlich“ / „alle 2 Wochen“ wird als wöchentlich gewertet** – `normalize.ts` FREQ_RULES: die Regel `/wöchentlich/` steht vor `/14-tägig|zweiwöchentlich|alle 2 wochen/`. „zweiwöchentlich“ enthält „wöchentlich“ und liefert 52 statt 26 Einsätze/Jahr. Wirkt direkt auf Jahresfläche, Jahresstunden, Jahresnetto und Preisempfehlung (Faktor 2).
2. **PDF-Bericht: Kopfzeile zeigt Werte aller Positionen, Tabelle nur die freigegebenen** – `LvAnalyse.tsx` übergibt `area.totalArea`, `hours.totalHours`, `cost.net` (berechnet über **alle** `items`) an `buildPdfReport`, das darunter nur `exportItems` auflistet. Der Text „Freigegebene Positionen: N … Summe: X €“ ist damit falsch, sobald nicht alle Positionen freigegeben sind. CSV/XLSX rechnen dagegen korrekt über die Exportmenge.
3. **Angebotspreis rechnet mit Menge 1, wenn die Menge fehlt** – `calculation.ts:offerPrice` setzt `qty = 1` bei `quantity === null`. Im Export steht in der Mengenspalte „Prüfung erforderlich“, in der Preisspalte aber ein scheinbar gültiger Betrag. Führt zu massiv unterkalkulierten Angebotssummen ohne Warnung.
4. **PDF-Beschreibung wird stumm abgeschnitten** – `export.ts` nutzt `doc.splitTextToSize(...)[0]`: jede Zelle zeigt nur die erste Zeile, ohne Kürzungshinweis. Positionstexte im Bericht sind unvollständig.

## Wichtig

5. **Doppelte, abweichende MwSt-Logik** – `summarizeCost` erhält `companyVatRate` (0/19), `summarizeOwnCalculation` wird in `LvAnalyse.tsx` und in `export.ts` **ohne** Steuersatz aufgerufen (Default 19). In der UI wird `ownSummary.net` mit `cost.vat`/`cost.gross` gemischt. Bei Kleinunternehmern liefert `summarizeOwnCalculation` intern falsche Werte; heute nur deshalb unauffällig, weil im UI zufällig die Netto-Felder daraus stammen.
6. **Falscher Hinweis „abweichender Steuersatz 0 %“** – die KI liefert `vat_rate: 0`, wenn kein Satz erkannt wurde; `normalizeItem` speichert 0 (nicht `null`), `summarizeCost` vergleicht `0 !== 19` und blendet den Warnhinweis ein, obwohl das Dokument gar keinen Steuersatz nennt.
7. **Kennzahl-Inkonsistenz Stunden** – Tab „Arbeitsstunden“ zeigt `annualHours` (nur erfasste Stunden), `recommendPrice` rechnet mit `annualHours + estimatedFromArea`; `monthlyHours` lässt die Flächenschätzung ebenfalls weg. Drei Tabs zeigen unterschiedliche Stundenbasis.
8. **Division durch Null in der Preisempfehlung** – `recommendPrice.deltaPercent` teilt durch `recommended`; ohne Stunden/Fläche ist `recommended = 0` → `Infinity`/`NaN` in der Anzeige.
9. **Jahresnetto mischt Jahres- und Einzelpreise** – `summarizeOwnCalculation`/`summarizeCost` addieren `annualOfferPrice(i) ?? offerPrice(i)`: Positionen ohne erkanntes Intervall gehen mit dem Einmalpreis in die Jahressumme ein, ohne Kennzeichnung → systematische Unterschätzung.
10. **Stunden-Spalte im Export nie als prüfbedürftig markiert** – `export.ts:buildExportRows` ruft `num(item.working_hours, "area_m2", [])` auf: falsches Feld und leere Review-Liste, dadurch wird `null`/unsicher nur über den `null`-Zweig erkannt und die Confidence-Regel greift nicht.
11. **Klassifizierung: ein einziger Geldbetrag genügt für „Preisblatt“** – `classify.ts` prüft `structuredItemCount < 3 && (… || moneyLines >= 1)` **vor** der Leistungsbeschreibungs-Erkennung. Reine Leistungsbeschreibungen mit einer Preisangabe werden als `pricing_form` eingestuft.
12. **GAEB-XML mit Endung `.xml` läuft nicht durch den GAEB-Parser** – `isGaebFile` prüft nur `x8x/d8x/p8x/gaeb`; `.xml` ist in `isSupportedFile` erlaubt und landet im generischen Dokumentleser.
13. **Flacher GAEB-Zweig erzeugt Pseudopositionen** – `parseGaeb` splittet feste Satzformate an „2+ Leerzeichen“ und meldet jede Zeile als Datensatz; `itemCount` täuscht dann Erfolg vor.
14. **KI-Einstufung darf die Heuristik auf `unsupported` überstimmen** – in `pipeline.ts` kann `aiKind = "unsupported"` den Status auf „Fehler“ setzen, obwohl Positionen extrahiert wurden; diese bleiben im State sichtbar, der Export ist aber gesperrt.
15. **Tabellenpositionen bekommen pauschal Confidence 0,8 und Seite 1** – `pipeline.ts` überschreibt die reale Erkennungsqualität; Review-Markierungen und Quellseiten sind damit nicht belastbar.
16. **Dedupe kann echte Positionen verschlucken** – `dedupeItems` schlüsselt auf `item_number + erste 80 Zeichen Beschreibung`; gleichlautende Positionen ohne Nummer (typisch bei Etagen-Wiederholungen) werden zu einer zusammengeführt, Mengen gehen verloren.
17. **Fehler werden still verschluckt (Fehlerbehandlung)**
    - `loadLog`: `if (error) return;` – keine Meldung.
    - Insert in `lv_import_logs`: Rückgabewert wird nicht geprüft.
    - Laden von `company_settings`: kein Error-Handling; bei Fehler stiller Fallback auf 19 % (Kleinunternehmer sehen falsche MwSt).
    - Scheitert die KI-Analyse, kann der Gesamtstatus trotzdem „Erfolgreich verarbeitet“ lauten (Erfolgstoast), der Fehler steht nur in der Schrittliste.
18. **`lv-pdf.ts` rechnet nicht cent-genau** – `net += p.quantity * p.unitPrice` ohne Rundung je Zeile, während `calculation.ts`/`kalkulation-engine.ts` konsequent in ganzen Cent rechnen. Angezeigte Zeilensummen und Endsumme können um Cent abweichen.
19. **Chunking der KI-Analyse ohne Obergrenze/Teilfehler-Toleranz** – bis zu 9 sequentielle Gateway-Aufrufe (400 000 / 45 000 Zeichen); ein fehlgeschlagener Chunk verwirft das gesamte Ergebnis, Positionen an Chunk-Grenzen können doppelt entstehen.

## Nice-to-have

20. Manuell angelegte Positionen erhalten `analysis_id: ""`, wenn noch keine Analyse geladen ist – `selectExportItems` filtert sie dann trotz Freigabe aus dem Export.
21. `recommendPrice.documentAnnualNet` heißt „document…“, enthält aber die eigene Jahressumme; die UI-Formulierung ist dadurch missverständlich.
22. Export-Zahlen via `String(v).replace(".", ",")`: keine feste 2-Stellen-Formatierung, Exponentialschreibweise bei Extremwerten möglich; XLSX-Zellen ohne Zahlenformat.
23. PDF-Summenblock: Betrag (`marginX+120`, rechtsbündig) und Seitenangabe (`marginX+130`) können überlappen; außerdem fehlt im PDF der Summenblock der eigenen Kalkulation, den CSV/XLSX ausgeben.
24. `extractTotals` erfasst auch „Mehrwertsteuer“-Zeilen als Summen – in der Tabelle „Erkannte Summen“ wirkt das wie doppelte Beträge.
25. Serverfunktion verwirft Summen mit `amount === 0` (`filter(t => t.amount !== 0)`) – legitime 0,00-Positionen verschwinden.
26. `.txt`/`.xml` sind erlaubt, werden dem Nutzer aber als Format nicht genannt („Unterstützte Formate: PDF, XLSX, CSV, GAEB“).

## Sicherheit / RLS – Ergebnis

- `lv_import_logs`: RLS ist aktiv, eine Policy `ALL` für Rolle `authenticated` mit `auth.uid() = user_id` in USING **und** WITH CHECK. Lesen und Schreiben sind korrekt auf den eingeloggten Nutzer beschränkt; der clientseitig gesetzte `user_id` ist durch WITH CHECK abgesichert.
- Hinweis (nice-to-have): `anon` besitzt Tabellen-GRANTs auf `lv_import_logs`, aber keine Policy – Zugriff ist damit faktisch blockiert; die Grants sind dennoch unnötig weit.
- Beide Server-Funktionen laufen mit `requireSupabaseAuth`, der KI-Schlüssel wird nur serverseitig gelesen. Keine Auffälligkeiten.

## Race Conditions / State (Punkt 3 der Anfrage)

- Doppel-Uploads sind durch `busy` + `disabled` weitgehend verhindert; der `onStep`-Callback schreibt jedoch ungeprüft in den globalen `steps`-State – ohne Lauf-ID würden parallele Läufe ihre Schritte vermischen.
- `loadLog` hat keinen Abbruch bei Unmount (der `company_settings`-Effekt hat einen `active`-Guard – uneinheitlich).
- Kein grundlegender Fehler in der Tab-/Item-Verwaltung gefunden; `items` und `result` werden beim neuen Upload sauber zurückgesetzt und über `stampAnalysis` an die Analyse-ID gebunden.

## Nächster Schritt

Kein Code geändert. Auf Wunsch setze ich die Punkte in Reihenfolge Kritisch → Wichtig um, sinnvoll gebündelt: (a) Kalkulations-/Frequenzlogik inkl. Tests, (b) Export-Konsistenz (PDF-Kopf, Review-Felder, Summenblock), (c) Klassifizierung/GAEB, (d) Fehlermeldungen sichtbar machen.
