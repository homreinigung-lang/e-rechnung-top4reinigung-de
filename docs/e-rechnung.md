# E-Rechnung: Käuferreferenz und Bestellnummer

Im Belegeditor stehen zwei getrennte Felder zur Verfügung:

- **Käuferreferenz / Leitweg-ID (BT-10):** Die vom Auftraggeber mitgeteilte Referenz. Für XRechnung erforderlich. Es wird keine Bestellnummer oder „N/A“ ersatzweise eingetragen.
- **Bestellnummer des Kunden (BT-13):** Eine zusätzlich mitgeteilte Bestellnummer. Sie ersetzt BT-10 nicht.

Verlangt der Auftraggeber eine Leitweg-ID, die entsprechende Option aktivieren. Vor dem Export von XRechnung und ZUGFeRD prüft das Programm dann Format und MOD-97-10-Prüfziffer. Diese Prüfung bestätigt weder die tatsächliche Vergabe noch die Zugehörigkeit zur Behörde. Die Kennung immer vom Auftraggeber übernehmen. Keine Peppol-Präfixe wie `0204:` in BT-10 eintragen.

Ohne Leitweg-ID-Anforderung sind auch andere Käuferreferenzen für Geschäftskunden zulässig. Bei ZUGFeRD ohne Käuferreferenz wird das optionale Element weggelassen. Bestehende Belege werden nicht automatisch geändert; alte Bestellnummern müssen anhand der Vorgaben des Auftraggebers geprüft werden.

## Einführung

1. Migration `separate_einvoice_buyer_reference` vor dem aktualisierten Frontend anwenden.
2. Käuferreferenz, Bestellnummer und gegebenenfalls Leitweg-ID-Anforderung im Entwurf eintragen und speichern.
3. XRechnung exportieren und vor dem ersten produktiven Versand mit der aktuellen KoSIT-Validator-Konfiguration prüfen; bei ZUGFeRD zusätzlich XML und PDF/A-Konformität prüfen.
4. Den vom Auftraggeber vorgegebenen Übermittlungsweg verwenden und Annahme-/Fehlerprotokolle aufbewahren.

Die lokale Pflichtdatenprüfung ist keine vollständige Schema-/Schematron- oder PDF/A-Validierung. Diese Änderung bestätigt daher keine allgemeine Konformität aller erzeugten Rechnungen.

Die Referenz wird beim Neuladen, im PDF und in der Vorschau berücksichtigt. Umwandlungen und manuell erzeugte Wiederholungen kopieren die Geschäftsangaben. Die Migration ergänzt die expliziten Kopierlisten für Stornos, automatische Wiederholungen und Nachträge. Bereits festgeschriebene Belege bleiben unveränderbar.

## Quellen

- https://e-rechnung-bund.de/faq/
- https://e-rechnung.service.rlp.de/informationen-fuer-rechnungssteller/e-rechnung-ablehnungsgruende-und-loesungen/die-e-rechnung-wurde-zurueckgewiesen/die-leitweg-id-kann-keinem-rechnungsempfaenger-zugeordnet-werden
- https://e-rechnung.service.rlp.de/fileadmin/zre-upload.rlp.de/allgemeine_Dokumente/Leitweg-ID-Formatspezifikation-v2-0-2.pdf

## Validierung dieser Änderung

- Gesamte Testsuite: 1.090 Tests erfolgreich, ein Test bewusst übersprungen.
- TypeScript-Prüfung und Produktionsbuild erfolgreich.
- KoSIT Validator 1.6.3 mit XRechnung-3.0.2-Konfiguration vom 31.08.2026: vier synthetische UBL-Dateien (Rechnung, Rabatt, Rundung und Storno) in Schema und Schematron akzeptiert; Käuferreferenz und Bestellnummer sind verschieden.
- Migration in einer isolierten PostgreSQL-Testinstanz ausgeführt: Storno, automatische Wiederholung, Nachtrag und Nachtragsrechnung übernehmen beide Referenzen getrennt.

Diese Ergebnisse gelten für die geprüften Beispiele. ZUGFeRD-PDF/A wurde in dieser Änderung nicht extern validiert. Die Migration wurde am 06.11.2026 um 21:43 Uhr (Europe/Berlin) in der produktiven Datenbank angewendet und unter Version `20261106204308` registriert. Die vorhandenen 25 Belege sind laut Inhaltsprüfsumme und Summenvergleich unverändert. RLS und Funktionsberechtigungen sind unverändert, der Sicherheitscheck zeigt keine zusätzlichen Hinweise. Die Frontend-Bereitstellung steht noch aus.
