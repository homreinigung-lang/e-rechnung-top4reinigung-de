# Umsetzungsplan: Behebung der Audit-Befunde

Reihenfolge: kritisch → wichtig → nice-to-have. Business-Logik-Entscheidungen (Runden, Wochenfaktor, MwSt.) werden **nicht** angefasst, bevor Sie die Empfehlungen unten bestätigen.

---

## Teil A – Eindeutige technische Bugs (direkte Korrektur, keine Rückfrage nötig)

### A1. Cron-Endpoint absichern (kritisch)
`src/routes/api/public/foto-retention.ts` prüft aktuell den Header `apikey` gegen den öffentlichen Publishable-Key — der steht im Browser-Bundle, jeder kann den Endpunkt auslösen und Fotos löschen.
- Neues Secret `CRON_SECRET` (von Ihnen in den Projekt-Einstellungen zu hinterlegen) und Prüfung per zeitkonstantem Vergleich.
- Kein Treffer → 401, ohne Detailmeldung.
- Der geplante Job wird auf den neuen Header umgestellt.

### A2. Stille 0-Werte beim E-Rechnungs-Import (kritisch)
`src/lib/e-invoice-import.ts` ersetzt nicht parsbare Beträge/Datumswerte durch `0` bzw. leere Werte. Damit landen falsche Rechnungssummen im System.
- Parser gibt `null` statt `0` zurück; fehlende Pflichtfelder (Summe, Netto, Steuer, Rechnungsnummer, Datum) führen zu einem klaren Importfehler.
- Import bricht mit deutscher Fehlermeldung ab und listet die betroffenen Felder, statt einen falschen Beleg anzulegen.
- Rundungs-Gegenprobe: Netto + Steuer muss der Bruttosumme entsprechen (Toleranz 1 Cent), sonst Warnung im Importprotokoll.

### A3. Stille `catch`-Blöcke (wichtig)
Betroffen: PDF-Erzeugung (`src/lib/invoice-pdf.ts`), Passwort-Reset (`src/routes/reset-password.tsx`), Mail-Versand-Aufrufer.
- Leere `catch {}` werden ersetzt durch: Fehler protokollieren **und** eine deutsche Toast-/Fehlermeldung an die Nutzerin ausgeben.
- Wo ein Fallback sinnvoll ist (z. B. Logo lädt nicht), bleibt der Fallback, aber mit sichtbarem Hinweis statt Stille.

### A4. Öffentlicher Mail-Endpunkt drosseln (wichtig)
`src/lib/auth-mail.functions.ts` ist unauthentifiziert und kann zum Mail-Bombing missbraucht werden.
- Neue Tabelle `auth_mail_throttle` (E-Mail-Hash + IP-Hash, Zeitstempel) mit RLS (nur `service_role`).
- Limit: max. 3 Anfragen je Adresse / 15 Minuten, max. 20 je IP / Stunde. Bei Überschreitung identische Erfolgsantwort (kein Konto-Leak), aber kein Versand.

### A5. Zustandsändernder GET-Endpoint (wichtig)
`src/routes/api/public/konto-freigabe.ts` löscht bzw. genehmigt Konten per `GET` — E-Mail-Scanner und Link-Vorschauen können den Link unbeabsichtigt auslösen.
- `GET` zeigt nur noch eine Bestätigungsseite mit Button.
- Die eigentliche Aktion läuft über `POST` mit demselben Einmal-Token; Token wird nach Ausführung entwertet.

### A6. Zahl-Parser vereinheitlichen (wichtig)
Vier deutsche Zahl-Parser existieren parallel (`src/lib/format.ts`, `lv-form/number.ts`, `lv-analyse/normalize.ts`, Inline-Logik in `kalkulation.tsx`).
- `parseGermanNumber` / `parsePositiveNumber` aus `src/lib/format.ts` wird der einzige Standard.
- Die übrigen Implementierungen werden auf diesen Kern umgestellt (dünne Re-Exports, wo Signaturen abweichen), Tests decken die bisherigen Sonderfälle ab (`1.234,56`, `1 234,56`, `1234.56`, reine Tausenderpunkte).

---

## Teil B – Business-Logik: meine Empfehlungen (bitte bestätigen)

### B1. Rundung — Empfehlung: **Integer-Cent-Rechnung (Weg aus `kalkulation-engine.ts`)**
Heute rechnet `kalkulation-engine.ts` in Cent, `lv-analyse/calculation.ts` mit reinen Float-Rundungen — bei vielen Positionen driften die Summen um Cents auseinander.
**Empfehlung:** Cent-Arithmetik überall; erst am Ende in Euro formatieren. Gerundet wird pro Position (kaufmännisch, halb aufwärts), Summen entstehen als Summe der gerundeten Positionen — so entspricht die PDF-Summe immer der Addition der sichtbaren Zeilen (Prüfkriterium des Finanzamts).
Zusätzlich: Die aktuelle `EPSILON`-Verwendung in `toCents` ist bei negativen Beträgen (Rabattzeilen) fehleranfällig und wird durch eine vorzeichenkorrekte Variante ersetzt.
*Auswirkung:* Abweichungen im Cent-Bereich gegenüber bisherigen LV-Auswertungen. Bestehende Belege bleiben unverändert (GoBD).

### B2. Wochen-je-Monat — Empfehlung: **52 Wochen/Jahr als Basis, Monat = 52/12**
`kalkulation.tsx` nutzt den gerundeten Wert `4,33`, `lv-analyse/normalize.ts` rechnet mit 52 Wochen/Jahr (= 4,3333/Monat). Über ein Jahr ergibt 4,33 nur 51,96 Wochen → rund 0,08 % zu wenig.
**Empfehlung:** Eine zentrale Konstantendatei mit `WEEKS_PER_YEAR = 52` und `WEEKS_PER_MONTH = 52 / 12` (ungerundet in der Rechnung). In der Oberfläche wird weiterhin „× 4,33" als gerundeter Anzeigewert erklärt, gerechnet wird aber exakt.
*Auswirkung:* Monats-/Jahrespreise steigen um ca. 0,08 % gegenüber heute — beide Module liefern danach identische Werte.

### B3. MwSt.-Logik — Empfehlung: **Steuerart aus den Firmeneinstellungen (Weg aus `calculation.ts`)**
`aggregate.ts` übernimmt heute den Steuersatz der **ersten Position mit gesetztem Wert** aus dem hochgeladenen Ausschreibungsdokument — also einen Fremdwert. `calculation.ts` erhält den Satz als Parameter.
**Empfehlung:** Einzige Quelle ist die Steuerart des Firmenkontos (`vatRateForTaxMode` aus `src/lib/format.ts`): Inland 19 %, Reverse-Charge 0 %, Kleinunternehmer 0 % — passend zu Ihrer bereits umgesetzten §-13b-/§-19-Logik. Ein abweichender Satz im Fremddokument wird nur noch als Hinweis („Dokument nennt X %") angezeigt, nicht mehr gerechnet.
*Auswirkung:* Keine Steuerübernahme aus fremden PDFs mehr — konsistent mit der Regel „keine Preise aus dem Dokument übernehmen".

---

## Teil C – Nice-to-have (nach A und B)
- Toter Code in `src/lib/lv-form/*` und redundante Route `lv-formular.tsx` entfernen bzw. abschließend in die LV-Analyse überführen.
- Doppelte Konstanten (`WEEKS_PER_MONTH`, Stundensätze, MwSt.-Sätze) in ein Modul zusammenführen.
- Tabelle `bank_transactions` entweder mit Funktion füllen oder entfernen — aktuell ohne Logik.
- Server-seitige Durchsetzung der Plan-Beschränkungen (Reverse-Charge nur ab Pro) in den Server-Funktionen, nicht nur im Frontend.

---

## Vorgehen
1. Sie bestätigen B1–B3 (oder korrigieren einzelne Punkte).
2. Umsetzung Teil A (kritisch → wichtig), inkl. neuer Tests für Parser, E-Rechnungs-Import und Cron-Auth.
3. Umsetzung Teil B mit Regressionstests für Kalkulation und LV-Analyse; bestehende Belege bleiben unverändert.
4. Teil C.

Benötigt von Ihnen: das Secret `CRON_SECRET` in den Projekt-Einstellungen.
