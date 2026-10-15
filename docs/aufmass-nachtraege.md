# Aufmaß und Nachträge

Im Objekt unter **Raumbuch / Aufmaß** können Bodenflächen manuell oder über
Länge × Breite erfasst werden. Glasflächen bleiben separat. Beim Öffnen der
Kalkulation für dieses Objekt werden beide Flächen in ihre jeweiligen Felder
übernommen. Nur die Bodenfläche fließt in die raumbezogene Zeitplanung ein.

In einer ursprünglichen Auftragsbestätigung startet **Nachtrag erstellen** ein
separates Nachtragsangebot. Kunde, Objekt und Steuerart werden übernommen;
der ursprüngliche Leistungsumfang und seine Positionen bleiben bestehen.
Die Zusatzleistungen werden im vorhandenen Belegeditor beschrieben und bepreist.

**Kundenfreigabe dokumentieren** speichert den Nachweis der bereits erhaltenen
Zustimmung. Danach bleiben Leistungen, Preis, Kunde und Objekt unverändert.
Optionale Positionen sind nicht Teil des freigegebenen Betrags oder der Rechnung.
Sie müssen vor der Freigabe in reguläre Positionen geändert werden, wenn der
Kunde sie ebenfalls beauftragt.

Nach **Als ausgeführt markieren** erstellt **Nachtrag in Rechnung übernehmen**
einen eigenen Rechnungsentwurf für genau diese Zusatzleistungen. Dieser Schritt
ist atomar und pro Nachtrag nur einmal möglich. Ein Fehler beim Kopieren oder
Protokollieren lässt keinen unvollständigen Rechnungsentwurf zurück.
Die Auftragsübersicht summiert ausschließlich freigegebene Nachtragsangebote.
Die Summen beziehen sich auf die Belegwerte, nicht auf den Gesamtwert einer
unbefristeten Unterhaltsreinigung.

## Bereitstellung

Vor Veröffentlichung des neuen Frontends muss die Migration
`20261014221452_aufmass_nachtraege.sql` und anschließend
`20261015064420_fix_supplement_invoice_generated_columns.sql` im Zielprojekt ausgeführt werden.
Der Branch ändert keine Live-Daten und veröffentlicht das Programm nicht.
Die bestehenden mandantenbezogenen RLS-Regeln bleiben aktiv; neue RPCs sind
`SECURITY INVOKER` und ausschließlich für `authenticated` aufrufbar.

## Prüfung

- `npm run typecheck`
- `npm run test`
- `npm run build`
- PostgreSQL-Integrationstest (isolierte Datenbank, keine Live-Verbindung):
  `node scripts/tests/supplements-db.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js`
  (Getestet mit `@electric-sql/pglite@0.3.14`.)

Die Datenbanktests prüfen die Freigabe, die Sperre von Preisen und Positionen,
die Trennung optionaler Positionen, Mandantentrennung, anonymen Zugriff,
Ausführungsnachweis, einmalige Fakturierung und Rollback bei Audit-Fehlern.
Ein Live-Smoke-Test nach der Migration bleibt erforderlich.
