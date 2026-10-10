# Datensicherung und Offline-Zeiterfassung

## Offline-Zeiterfassung

Auf der bereits geladenen Seite „Meine Arbeitszeiten“ kann die manuelle Arbeitszeit auch bei unterbrochener Verbindung gespeichert werden. Die Arbeitszeit wird zuerst in IndexedDB auf diesem Gerät gesichert. Nach Rückkehr der Verbindung wird sie im geöffneten Programm automatisch übertragen, alternativ über „Jetzt synchronisieren“. Eine feste UUID verhindert doppelte Einträge bei wiederholter Übertragung oder verlorenen Serverantworten. Die Zuordnung ist an das angemeldete Konto und den Mitarbeiter gebunden; Arbeitszeiten bleiben zur administrativen Prüfung vorgemerkt.

Der Status nennt die noch ausstehenden Einträge. Bei einer Ablehnung durch den Server bleiben sie lokal erhalten. Browserdaten nicht löschen und kein privates Browserfenster verwenden, solange Einträge ausstehen. Das Programm muss zur Synchronisierung geöffnet sein. Ein Neustart ohne Internet, Fotos, Unterschriften, Einsatzbestätigungen und die gesamte Planung sind nicht Teil dieser Offline-Funktion. Ein Browser kann lokale Daten bei Speicherknappheit entfernen; lokale Daten sind keine vollständige Datensicherung.

## Export und vollständige Sicherung

Der Export in den Einstellungen enthält ausschließlich Kunden, Belege und Positionen. Alle sichtbaren Zeilen werden paginiert geladen; bei einem Fehler wird kein unvollständiger Export als erfolgreich gemeldet. Er ist ausdrücklich kein vollständiges Systembackup.

Für eine vollständige Sicherung benötigt der Betreiber:

- PostgreSQL-Archiv einschließlich zugänglicher Auth-Daten und Anwendungsschemata.
- Originaldateien aus **allen** Storage-Buckets mit Dateigrößen und SHA-256-Prüfsummen.
- Separat geschützte Betriebsinformationen: Edge-Function-Secrets, Auth-/Mail-Konfiguration, eigene Domain und Projektkonfiguration. Diese sind nicht vollständig im Datenbankarchiv enthalten und gehören niemals ins Git-Repository.

Die vorhandenen Skripte wurden um die Sicherung aller Datei-Buckets, geschützte Dateiberechtigungen unter Linux und die Prüfung des Archivs ergänzt. Automatische Sicherungen/PITR sind im Supabase-Projekt gemäß Tarif separat zu prüfen; deren Aktivierung wird durch diese Skripte nicht verändert.

Voraussetzungen: Node mit installierten Projektabhängigkeiten und PostgreSQL-Werkzeuge passend zur Datenbankversion (aktuell PostgreSQL 17). Schlüssel und Datenbankzugang ausschließlich lokal über die verdeckten Eingaben angeben, nicht im Chat oder Git speichern.

Linux/macOS, aus dem Projektverzeichnis:

```bash
bash scripts/backup-source.sh prod-2026-10-10 ../backups
node scripts/verify-backup.mjs ../backups/prod-2026-10-10
node scripts/restore-storage.mjs ../backups/prod-2026-10-10/storage
```

Windows:

```powershell
.\scripts\backup-source.ps1 -SourceName prod-2026-10-10 -MigrationRoot ..\backups
```

Jeder Lauf braucht ein neues Verzeichnis. Bei Änderungen an Dateien während des Downloads bricht die Sicherung ab: während einer ruhigen Betriebsphase erneut ausführen. Für einen konsistenten Stand der Datenbank und Dateien in dieser Phase keine Daten verändern. Dateien geschützt und verschlüsselt auf zwei getrennten Medien ablegen; den Sicherungsort nicht mit einem Git-Repository synchronisieren.

## Verschlüsselte Sicherung über GitHub Actions

Der zusätzliche manuelle Workflow „Manual encrypted full database and storage backup“ ergänzt den vorhandenen reinen Datenbank-Workflow. Er sichert Datenbank und sämtliche Datei-Buckets, prüft die Dateien und verschlüsselt beide Archive mit dem öffentlichen age-Schlüssel **vor** dem Upload als Actions-Artefakt. Er benötigt die Repository-Secrets `SUPABASE_BACKUP_DATABASE_URL`, `SUPABASE_BACKUP_SERVICE_ROLE_KEY` und `BACKUP_AGE_PUBLIC_KEY`. Der private Entschlüsselungsschlüssel bleibt beim Betreiber, niemals in GitHub. Der Workflow ist manuell, nicht automatisch aktiv, und wurde ohne diese Secrets nicht als vollständige Sicherung ausgeführt. Artefakte werden nach 90 Tagen gelöscht; zusätzlich langfristig extern aufbewahren.

## Wiederherstellungstest

1. Ein unabhängiges, nicht produktives Projekt vorbereiten. Ausgehende E-Mails, Bankabfragen und Cron-Aufgaben deaktivieren; keine produktiven Provider-Secrets übernehmen.
2. Datenbankarchiv und Storage-Manifeste mit `verify-backup.mjs` prüfen. Prüfsummen bestätigen die Integrität, nicht die Wiederherstellbarkeit.
3. Datenbankarchiv vom Betreiber in das kompatible Testprojekt wiederherstellen lassen, inklusive Anwendungsschemata, Auth-Zuordnungen, RLS und Storage-Bucket-Konfiguration. Konflikte mit bereits vorhandenen Supabase-Systemobjekten sind vor der Wiederherstellung aufzulösen. Niemals ein produktives Projekt als Testziel verwenden.
4. `restore-storage.mjs <storage-Verzeichnis>` führt standardmäßig nur eine lokale Prüfung aus. Tatsächliche Dateiübertragung erfolgt ausschließlich mit `--apply-test` und den lokalen Umgebungsvariablen `TEST_SUPABASE_URL`, `TEST_SUPABASE_SECRET_KEY`, `TEST_PROJECT_REF`. Das Skript verweigert das bekannte Produktionsprojekt, das Quellprojekt und eine abweichende Zielkennung. Vorhandene Dateien werden nicht überschrieben; ihre Prüfsumme muss stimmen.
5. Im Testprojekt Kunden, Mitarbeiter, Projekte, Stunden, Rechnungsnummern, Summen, Zugriffsrechte und heruntergeladene Originaldateien prüfen. Eine Datenbank- und Dateiprüfung allein ersetzt diese Anwendungsprüfung nicht.
6. Zeitpunkt, Archivprüfsumme, Testprojekt, Tabellen-/Dateizahlen, geprüfte Abläufe und Fehler dokumentieren. Erst nach dieser Prüfung die Sicherung als erfolgreich wiederhergestellt kennzeichnen.

**Status:** Die Skripte und Offline-Logik sind automatisiert mit Testdaten prüfbar. Eine echte Datenbanksicherung und Wiederherstellung benötigt Betreiberzugang und ein vorbereitetes Testprojekt; ein erfolgreicher Produktiv-Restore wird hier nicht behauptet.
