# Monats-Lieferschein für Verbrauchsmaterial

In der Detailansicht einer Rechnung steht ein eigener Bereich **Monats-Lieferschein**.
Die bestehende Rechnung, ihre Positionen, Berechnungen und Seitenvorlagen bleiben unverändert.
Beim PDF-Export und E-Mail-Versand folgen die Lieferscheinseiten nach allen Rechnungsseiten
in derselben Datei. Angebote und Stornorechnungen erhalten keinen Material-Lieferschein.

## Bedienung

1. Rechnung öffnen, **Lieferschein erstellen** wählen und Monat, Nummer, Bestellung und tatsächliche Lieferadresse prüfen.
2. Die fünf Wochen mit Lieferdatum und Mengen erfassen: Toilettenpapier und Handtuchpapier in Kartons,
   Flüssigseife in 5-Liter-Kanistern. Dezimalmengen wie `1,5` werden unterstützt.
3. Speichern. Die Monatssummen werden je Material berechnet; Preise stehen nur auf der Rechnung.
4. Entweder Wochen- und Monatsbestätigungen am Handy erfassen (Name, Datum und transparente Unterschrift)
   oder den Lieferschein über die Druckansicht ausdrucken, unterschreiben und als PDF/JPG/PNG hochladen.
   Eine hochgeladene Papierfassung ersetzt die erzeugte Lieferscheinseite, damit es keine doppelte Fassung gibt.
5. Über **Gesamt-PDF ansehen** prüfen. Download und E-Mail verwenden denselben PDF-Generator.
   Zum Versand werden beide Monatsunterschriften oder eine hochgeladene unterschriebene Papierfassung benötigt.

Signierte Zeilen und Kopfdaten sind geschützt. Vor Änderungen müssen die betreffenden Signaturen
zurückgesetzt und danach neu eingeholt werden. Eine hinterlegte Papierfassung muss vor Änderungen entfernt
werden. Nach Festschreibung der Rechnung ist auch der Lieferschein gesperrt. Ein versehentlich hinzugefügter
Lieferschein kann vor Festschreibung wieder entfernt werden.

## Bereitstellung

Vor Aktivierung die additive Migration `20261030153753_monthly_delivery_notes.sql` anwenden.
Sie legt eine separate, mandantengeschützte Tabelle und eine versionsgeprüfte Finalisierungsfunktion an.
Bestehende Rechnungsfelder und Nummernkreise werden nicht verändert. Der vorhandene private Datei-Bucket
wird wiederverwendet. Es werden keine externen Signaturdienste oder zusätzlichen Pakete benötigt.
Fehlt die neue Tabelle während einer gestaffelten Bereitstellung, funktionieren bisherige Rechnungen weiter;
der neue Bereich zeigt einen Ladefehler, bis die Migration installiert ist.

Die PDF-Seitenoperationen der Rechnung werden in Regressionstests vor und nach dem Anhängen verglichen.
Ein Versionsvergleich unter derselben Datenbanksperre wie die Festschreibung verhindert den Versand eines
inzwischen veralteten Lieferscheins. Wiederholter Versand nutzt wie bisher das geprüfte Archivoriginal.

## Prüfung

- `bun run typecheck`
- `bun run test`
- `bun run build`
- `node scripts/security/test-local.mjs` nach dem bestehenden lokalen Migrations-Replay

Optionaler visueller PDF-Export aus dem Test:
`DELIVERY_NOTE_QA_PDF=/absolute/path/combined.pdf bun run test -- src/lib/delivery-note-pdf.test.ts`

Die Tests verwenden synthetische Daten. Änderungen an der produktiven Datenbank, E-Mail-Versand und
Veröffentlichung erfolgen nicht durch die Tests.
