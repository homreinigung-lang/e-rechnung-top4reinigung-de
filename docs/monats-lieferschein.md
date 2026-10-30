# Monats-Lieferschein für Verbrauchsmaterial

Der Monats-Lieferschein wird unter **Objekte → Objekt öffnen → Lieferscheine**
unabhängig von einer Rechnung erstellt und gespeichert. Die bestehende Rechnung, ihre Positionen,
Berechnungen und Seitenvorlagen bleiben unverändert. Beim späteren PDF-Export und E-Mail-Versand
folgen die Lieferscheinseiten nach allen Rechnungsseiten in derselben Datei.

## Bedienung

1. Objekt öffnen, **Lieferschein erstellen** wählen und Monat, Nummer, Bestellung und Lieferadresse prüfen.
2. Pro Woche Datum und Mengen eintragen: Toilettenpapier in Rollen, Handtuchpapier in Packungen,
   Flüssigseife in Litern. Dezimalmengen wie `1,5` Liter werden unterstützt. Zum Monatsende werden die
   fünf Wochen automatisch addiert und umgerechnet: **32 Rollen = 1 Karton Toilettenpapier,
   15 Packungen = 1 Karton Handtuchpapier, 5 Liter = 1 Kanister**. Die Monatszeile zeigt ausschließlich
   Kartons bzw. Kanister, einschließlich Teilmengen. Beispiel: 64 Rollen / 30 Packungen / 7,5 Liter
   ergeben **2 Kartons / 2 Kartons / 1,5 Kanister**. Die bestätigten Gebindegrößen werden bei neuen
   Nachweisen mitgespeichert; es sind keine zusätzlichen wöchentlichen Eingaben nötig.
3. Im Objekt speichern. Die Monatssummen werden je Material berechnet; der Lieferschein enthält keine Preise.
4. Wochen- und Monatsbestätigungen am Handy erfassen (Name, Datum, transparente Unterschrift) oder
   ausdrucken, auf Papier unterschreiben und als PDF/JPG/PNG hochladen. Der Scan ersetzt die erzeugte
   Lieferscheinseite im Gesamt-PDF.
5. Im Objekt eine offene Rechnung desselben Objekts und Kunden auswählen und **Mit Rechnung verbinden**
   wählen. Alternativ lässt sich der fertige Objekt-Nachweis in der Rechnung auswählen.
6. In der Rechnung **Gesamt-PDF ansehen**, herunterladen oder senden. Erst kommen sämtliche
   Rechnungsseiten, anschließend der unterschriebene Monatsnachweis. Das Original bleibt im Objekt sichtbar.

Die Verbindung benötigt Mengen und beide Monatsunterschriften oder eine unterschriebene Papierfassung.
Ein zugeordneter Nachweis ist schreibgeschützt. Zum Bearbeiten zuerst die Zuordnung in der offenen
Rechnung entfernen; dabei bleibt das Objekt-Original erhalten. Ein Nachweis kann nur einer Rechnung
zugeordnet werden. Kunde und Objekt der verbundenen Rechnung können erst nach Entfernen der Zuordnung
geändert werden. Auf dem Handy erscheinen die Wochen als Karten; das gedruckte PDF bleibt die
landschaftliche Monatsübersicht entsprechend der Papierfassung.

Signierte Zeilen und Kopfdaten sind geschützt. Vor Änderungen müssen die betreffenden Signaturen
zurückgesetzt und danach neu eingeholt werden. Eine hinterlegte Papierfassung muss vor Änderungen entfernt
werden. Nach Festschreibung der Rechnung ist auch der Lieferschein gesperrt. Ein versehentlich hinzugefügter
Lieferschein kann vor Festschreibung wieder entfernt werden.

## Bereitstellung

Vor Aktivierung die additiven Migrationen `20261030153753_monthly_delivery_notes.sql` und
`20261030202703_object_delivery_notes.sql` anwenden.
Sie ergänzen getrennte, mandantengeschützte Tabellen für Objekt-Originale und Rechnungskopien sowie
eine versionsgeprüfte Zuordnung und Finalisierung.
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
