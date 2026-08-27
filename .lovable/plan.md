# Prüfbericht: Bereich „Kalkulation / GebCalc"

Reine Analyse – es wurde kein Code geändert. Geprüft: `src/lib/kalkulation-engine.ts`, `src/routes/_authenticated/kalkulation.tsx`, `src/lib/lv-pdf.ts`, `src/lib/leistungswerte.ts`, `src/lib/raumbuch.ts`, `src/lib/create-document.ts`, `src/lib/item-ai.server.ts`, `src/components/ProjektAnalyse.tsx`, `ProjektKennzahlen.tsx`, `KalkulationAnalytics.tsx`, `src/routes/_authenticated/projekte.$id.tsx`.

## 1. Fehler in der Rechenlogik (Preise, USt., Mengen/Flächen)

**A. USt. ist fest auf 19 % verdrahtet – Kleinunternehmer und Reverse-Charge werden ignoriert (kritisch)**
- `kalkulation.tsx:507-508`: `vatAmount = round2(aiTotal * 0.19)`, Anzeige „zzgl. 19 % MwSt." (Zeile 1738) – unabhängig von `company_settings.small_business` und vom Kundenstatus.
- `kalkulation.tsx:639`: LV-PDF wird immer mit `vatRate: 19` erzeugt; `lv-pdf.ts:246-250` druckt daraufhin USt.- und Bruttozeile. Für § 19 UStG bzw. § 13b UStG fehlen die Pflichthinweise vollständig (`KLEINUNTERNEHMER_NOTE` / `REVERSE_CHARGE_NOTE` aus `format.ts` werden im LV-PDF nie verwendet).
- `kalkulation.tsx:730-731`: Beim „In Angebot übernehmen" wird `vat_amount = net*0,19` und `total = net*1,19` direkt in das Dokument geschrieben – obwohl `create-document.ts:38-39` für Kleinunternehmer korrekt `tax_mode: kleinunternehmer, vat_rate: 0` gesetzt hat. Ergebnis: Angebot mit `vat_rate = 0`, aber `total` inklusive 19 % → falscher Belegbetrag.

**B. Kunden-/EU-Kontext fehlt in der Kalkulation**
Die Kalkulation kennt keinen Kunden. Reverse-Charge (EU-Kunde mit USt-IdNr.) kann dort nicht abgebildet werden; das erzeugte Angebot startet immer mit `reverse_charge: false` (`create-document.ts:37`) und muss manuell nachgezogen werden.

**C. Rundung im LV-PDF**
`lv-pdf.ts:231`: `net += p.quantity * p.unitPrice` summiert ungerundete Fließkommawerte, während jede Zeile einzeln über `formatMoney` gerundet dargestellt wird. Die sichtbaren Zeilensummen können daher um Cent von der gedruckten „Angebotssumme netto" abweichen (im Gegensatz zur App, die in `kalkulation-engine.ts` centgenau rechnet).

**D. Doppelte Rundung in den Kennzahlen**
`KalkulationAnalytics.tsx:94-148` und `ProjektKennzahlen.tsx:81-93` runden pro Eintrag, dann pro Projekt, dann pro Portfolio – Cent-Drift bei vielen Projekten. Zusätzlich stellt `KalkulationAnalytics.tsx:130-142` Umsatz nach `issue_date` gegen Kosten nach `work_date` – periodenfremder Vergleich, Marge kann Monat für Monat verzerrt sein.

**E. „Stundenbedarf" im Flächenmodus ist ein Zirkelschluss**
`kalkulation.tsx:517-522`: `monthlyHours = (Fläche × €/m² × Einsätze) / Stundensatz`. Das ist der Preis zurückgerechnet, keine Leistungswert-Berechnung. Die vorhandenen Leistungswerte (`leistungswerte.ts`, `raumbuch.ts`) werden im Flächenmodus nicht genutzt – die Zahl geht so auch ins LV-PDF (`meta`, Zeile 636) und in den Angebotstext.

**F. Nicht ganzzahlige Einsätze**
`WEEKS_PER_MONTH = 4,33`: Positionen mit Einheit „Einsatz"/„Etage" erhalten Mengen wie 4,33 oder 12,99 (`kalkulation-engine.ts:135,171`). Fachlich in einem Angebot an eine Vergabestelle unüblich – üblich ist „x Einsätze/Monat, Preis je Einsatz" oder Jahresmenge (52 Wochen).

## 2. Konflikte Grundkalkulation ↔ Leistungsverzeichnis

1. **Endpreis dominiert die Positionen.** `reconcilePositionsTotal` (`kalkulation-engine.ts:224`) hängt bei jeder Abweichung eine Position „Manuelle Endpreisanpassung"/„Manueller Preisnachlass" an. Diese Zeile erscheint im LV-PDF und im Angebot an den Kunden – bei Ausschreibungen (z. B. Vergabe Saarland) ist eine solche unerklärte Ausgleichsposition ein Ausschlusskriterium.
2. **Preisänderungen im LV verändern den Preis nicht.** Ändert der Nutzer eine LV-Zeile, bleibt `aiTotal = targetNetTotal` konstant (Zeile 506); der Unterschied wandert nur in die Ausgleichsposition. Das ist zwar so gewollt dokumentiert, wirkt aber wie ein Fehler: Die Summe reagiert nicht auf Positionsänderungen.
3. **Keine Verbindung zu `project_lv_items`.** Das Projekt-LV (`projekte.$id.tsx`) und das Kalkulations-LV sind zwei getrennte Welten. „In Kalkulation übernehmen" (`projekte.$id.tsx:503-514`) übergibt nur `area`, `objekt`, `belag` per URL; Positionen/Preise werden weder gelesen noch zurückgeschrieben.
4. **Kein Speichern.** Die gesamte Kalkulation inkl. LV-Positionen liegt nur im React-State. Ein Reload verwirft alles; es gibt keine Wiedervorlage einer Kalkulation.
5. **Raumbuch überschreibt Eingaben.** `kalkulation.tsx:216-224`: Sobald ein Projekt Räume hat, werden Fläche und Stunden bei jedem Query-Ergebnis überschrieben – manuelle Korrekturen können wieder verloren gehen.

## 3. Validierung und Grenzfälle

- **Deutsche Zahleneingabe unvollständig:** `num()` (`kalkulation.tsx:135`) ersetzt nur das erste Komma. „1.250,50" → `1.25`, „1.250" → `1.25`. Bei Flächen und Preisen mit Tausenderpunkt entstehen um Faktor 1000 falsche Werte, ohne Warnung.
- **Negative Werte** werden nirgends abgefangen: negative Menge/Preis im LV (`kalkulation.tsx:1589-1601`) und in `projekte.$id.tsx:709,728` (`Number(...) || 0` lässt negative Zahlen durch, kein `min="0"`).
- **`|| 0` / `|| 1`-Muster** verwechseln „ungültig" mit „null": `item-ai.server.ts:99` macht aus einer legitimen Menge 0 eine 1.
- **Plausibilitätsprüfung greift zu kurz:** `checkPlausibility` wird nie mit `toilets` aufgerufen (`kalkulation.tsx:527-531`); im Stundenmodus wird die Fläche nur aus Anhängen geprüft. Keine Prüfung auf unrealistische Stundensätze (< Mindestlohn) oder €/m²-Werte.
- **Fläche = Glasfläche:** Bei „Glas- und Fensterreinigung" wird dasselbe Feld `area` als Glasfläche interpretiert (`kalkulation-engine.ts:133`) – wer die Bodenfläche stehen lässt, kalkuliert massiv zu hoch.
- **Aufzug nur mit Treppenhaus:** Die Aufzugsposition wird nur erzeugt, wenn `stairs` aktiv ist (`kalkulation-engine.ts:175`).
- **Rabatt:** wird auf alles inkl. Anfahrt und Pauschalen gerechnet; Rabattgrund ohne Rabatt-% verschwindet stillschweigend.
- **NaN-Maskierung:** `formatMoney`/`formatNumber` zeigen bei NaN „0,00 €", während die Summenrechnung im PDF weiterläuft – Fehler bleiben unsichtbar.

## 4. Bewertung gegenüber dem deutschen Marktstandard

- **Struktur gut:** Trennung Leistungswerte (m²/h), Raumbuch, Positionen und centgenaue Summenlogik entspricht der Branchenpraxis (Richtwerte in `leistungswerte.ts` sind realistisch: Büro 200–250, WC 60, Treppenhaus 120, Glas 40 m²/h).
- **Preis-Presets inkonsistent:** `CLEANING_TYPES` (`kalkulation.tsx:110-127`) passt nicht zu den eigenen Leistungswerten. Unterhaltsreinigung 0,55 €/m² je Einsatz entspricht bei 250 m²/h und 35 €/h rechnerisch ca. **0,14 €/m²** – der Vorschlag liegt also rund 4-fach über dem eigenen Kalkulationsmodell. Glas: 1,40 €/m² vs. 38 €/h ÷ 40 m²/h = 0,95 €/m². Grundreinigung 1,90 €/m² ist marktüblich eher 0,70–1,20 €/m².
- **Stundensätze** (34–45 € netto) sind marktgerecht, aber es fehlt jede Kostenrechnung von unten: Tariflohn Gebäudereiniger-Handwerk (LG 1), Lohnnebenkosten, Ausfallzeiten, Material/Verbrauch, Gemeinkosten, Wagnis und Gewinn. Für Ausschreibungen wird eine solche Kalkulationsherleitung häufig verlangt.
- **Fehlend gegenüber Marktstandard:** Zuschläge (Sonn-/Feiertag, Nacht, Winterdienst), Jahres-/Vertragslaufzeitbetrachtung inkl. Indexierung, Objektleitung/Springer, Sonderreinigungen als Einheitspreise, Mindesteinsatzzeiten, Deckungsbeitrag-/Break-even-Anzeige und ein sauberer LV-Aufbau nach Ordnungszahlen (aktuell nur `n.10`, `lv-pdf.ts`-Aufruf Zeile 593).

## Empfehlungen (priorisiert)

1. Steuerlogik zentralisieren: `tax_mode` (Inland / § 13b / § 19) in Kalkulation und LV-PDF berücksichtigen, Pflichthinweise drucken, beim Angebotstransfer `vat_amount`/`total` aus dem Steuermodus des Belegs ableiten.
2. Deutsche Zahlenparsung robust machen (Tausenderpunkt, Komma, negative Werte, Leereingabe) und zentral in `format.ts` bereitstellen; `min="0"` an allen Betrags-/Mengenfeldern.
3. Ausgleichsposition ersetzen: Endpreisanpassung anteilig auf die Positionen verteilen oder als transparenten „Nachlass" mit Begründung ausweisen.
4. Kalkulation persistieren und mit `project_lv_items` verbinden (Speichern/Laden, Rückschreiben der Positionen).
5. `monthlyHours` aus Raumbuch/Leistungswerten berechnen statt aus dem Preis; Glasfläche als eigenes Feld führen.
6. Preis-Presets an die eigenen Leistungswerte koppeln (€/m² = Stundensatz ÷ m² pro Stunde) und Kostenkalkulation (Lohn, Nebenkosten, Material, Gemeinkosten, Gewinn) mit Mindestpreis-Warnung ergänzen.
7. Rundung im LV-PDF auf Cent je Position vereinheitlichen; Kennzahlen aus ungerundeten Rohwerten summieren.

Auf Wunsch setze ich Punkte 1–7 (oder eine Auswahl) in einem nächsten Schritt um.
