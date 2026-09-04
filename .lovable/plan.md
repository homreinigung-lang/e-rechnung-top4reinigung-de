# Prüfbericht: Personal, Einsatzplanung, Zeiterfassung, Zugriffsrechte

Nur Analyse – es wurde nichts geändert. Geprüft: Personal-/Team-Modul, Einsatzkalender, Arbeitsplanung, Zeiterfassung, Mitarbeiterportal, Urlaubsanträge, Zeitkonto, Steuerberater-Zugang sowie die zugehörigen Zugriffsregeln der Datenbank und die öffentlichen Serverfunktionen.

## Kritisch

1. **Urlaub und Krankheit erzeugen falsche Minusstunden.** Abwesenheiten werden zwingend mit 0 Stunden gespeichert, während das Zeitkonto die volle Sollzeit gegenrechnet. Jeder genehmigte Urlaubstag verschlechtert das Stundenkonto der Mitarbeitenden – arbeitsrechtlich und für die Lohnabrechnung falsch.
2. **Mitarbeitende können ihren eigenen Stundensatz setzen.** Die Zugriffsregel für selbst erfasste Arbeitszeiten prüft nur Besitzer und Eintragsart, nicht `hourly_rate`, `hours` oder das Datum. Über die öffentliche Datenschnittstelle lässt sich damit ein beliebiger Stundensatz oder eine beliebige Stundenzahl buchen, die anschließend direkt in Lohnauswertung, Steuerberater-Export und Kostenstatistik einfließt.
3. **Kein Urlaubsanspruch, kein Resturlaub.** Nirgends existiert ein Jahresanspruch je Mitarbeiter. Es werden nur genommene Tage gezählt; Überschreitungen, Resttage und Übertrag ins Folgejahr sind weder sichtbar noch geprüft.
4. **Keine Doppelbuchungs-Prüfung.** Weder Einsatzplanung noch Abwesenheitszeitraum prüfen, ob für Mitarbeiter und Tag bereits ein Eintrag existiert. Zwei Nutzer oder zwei Browsertabs erzeugen doppelte Einsätze und doppelte Urlaubstage; in der Datenbank fehlt eine entsprechende Eindeutigkeitsregel.

## Wichtig

5. **Rollentrennung nur in der Oberfläche.** Mitarbeitende werden per Weiterleitung aus Firmenbereichen ausgesperrt. Der Schutz greift ausschließlich im Browser; ob jede Firmentabelle die Mitarbeiterkonten serverseitig ebenfalls ausschließt, ist nicht durchgängig abgesichert (z. B. Projekt- und Kundendaten, auf die geplante Einsätze verweisen).
6. **Fremdbezug bei selbst erfassten Zeiten möglich.** Beim Eintrag durch Mitarbeitende werden Projekt- und Kundenbezug nicht gegen den Bestand der eigenen Firma geprüft.
7. **Passwort-Wiederherstellung ohne Drosselung.** Die Registrierungs-E-Mail hat eine Sperre je Adresse und IP; der Wiederherstellungs-Link hat keine. Damit ist Mail-Bombing auf beliebige Adressen möglich, mit Risiko für die Zustellreputation der Absenderdomain.
8. **Einladungscode ist zu kurz und unbegrenzt versuchbar.** Acht Zeichen ohne Fehlversuchssperre; ein angemeldetes Fremdkonto kann sich durch Durchprobieren als Mitarbeiter in eine fremde Firma eintragen. Es fehlt zudem eine Bestätigung durch die Firma.
9. **Öffentlich lesbare Firmendaten.** Aktive, auf der Startseite sichtbare Abonnements geben Kontakt-E-Mail, Anschrift und Notiz frei; die Plattform-Zahlungsdaten liefern IBAN, BIC, Steuernummer und E-Mail an nicht angemeldete Besucher. Beides sollte auf die wirklich benötigten Felder reduziert werden.
10. **Paketbestellungen sind ungeprüft anlegbar.** Bestellungen dürfen ohne Anmeldung eingetragen werden, inklusive frei wählbarer Beträge und Status – Spam und manipulierte Beträge sind möglich.
11. **Steuerberater-Zugang mit schwachem Zugangscode.** Der Code wird im Klartext gespeichert, ist kurz und wird zeichenweise verglichen. Die Sperre nach Fehlversuchen greift, ein Ablaufdatum je Code und ein gehashter Vergleich fehlen.
12. **Urlaubsanträge: Entscheidungen ohne Sperre.** Beim Genehmigen wird nicht geprüft, ob der Antrag noch offen ist, und es wird kein Entscheider protokolliert. Zwei gleichzeitig arbeitende Vorgesetzte überschreiben einander.
13. **Verschieben per Drag-and-drop setzt Nachweise zurück.** Beim Umplanen werden Erledigt-Status, Fotos und Freigaben gelöscht – auch bei bereits abgerechneten oder genehmigten Einsätzen. Abgerechnete Einsätze sollten nicht verschiebbar sein.
14. **Nachtschichten werden stillschweigend umgerechnet.** Endet ein Einsatz vor dem Start, wird über Mitternacht gerechnet; ein Tippfehler wie 08:00–07:00 ergibt 23 Stunden ohne Warnung.
15. **Fehler beim Laden bleiben unsichtbar.** Nahezu alle Listen (Personal, Kalender, Zuordnungen, Benachrichtigungen) fallen bei einem Fehler auf eine leere Liste zurück. Ein Rechteproblem oder Netzausfall sieht dann aus wie „keine Daten“.
16. **Wochenplanung speichert Zelle für Zelle ohne Konfliktprüfung.** Bricht der Speichervorgang in der Mitte ab, bleibt ein Teil gespeichert und der Entwurf inkonsistent; parallele Bearbeitung überschreibt sich gegenseitig ohne Hinweis.
17. **Sollstunden-Berechnung pauschal.** Das Zeitkonto rechnet mit einer festen Wochenzahl je Monat und berücksichtigt nur Monate, in denen es bereits Einträge gibt. Feiertage, Eintrittsdatum und Teilmonate verzerren das Ergebnis.
18. **Zwei-Faktor ohne Wirkung auf Rechte.** TOTP kann aktiviert werden, aber weder Administrationsbereich noch Datenzugriff verlangen die zweite Stufe; Abschalten ist ohne erneute Anmeldung möglich. Auch die Passwortänderung verlangt kein aktuelles Passwort.

## Nice-to-have

19. **Benachrichtigung „Plan freigegeben" nur im geöffneten Browser** – wer nicht angemeldet ist, erfährt nichts; der gelesen-Status hängt am jeweiligen Gerät.
20. **Wiederholte Objektanlage** bei der Wochenplanung kann bei paralleler Nutzung doppelte Objekte erzeugen.
21. **Datenbank-Prüfung meldet 19 Hinweise**: eine Erweiterung im öffentlichen Bereich und 18 Funktionen mit erhöhten Rechten, die angemeldete Nutzer aufrufen dürfen. Ein Teil davon ist bewusst so gebaut (Belegnummern, Storno); die Liste sollte einmal Funktion für Funktion bestätigt und dokumentiert werden.
22. **Kein Prüfprotokoll für Personaldaten** – Änderungen an Stundensatz, Vertrag und Zeiten sind nicht historisiert; für Lohnprüfungen wäre das hilfreich.

## Empfohlene Reihenfolge

1. Punkte 1–4 (Zeitkonto, Stundensatz-Absicherung, Urlaubsanspruch, Doppelbuchung)
2. Punkte 5–11 (Zugriffs- und Missbrauchsschutz)
3. Punkte 12–18 (Datenintegrität und Bedienbarkeit)
