begin;

update public.plans
set
  price_monthly_cents = 2999,
  price_yearly_cents = 29990,
  description = 'Rechnungen, Angebote, E-Rechnung und Kundenverwaltung für kleine Reinigungsbetriebe.',
  features = array[
    'Rechnungen & Angebote',
    'E-Rechnung (XRechnung/ZUGFeRD)',
    'Kundenverwaltung & EÜR',
    '1 Benutzer'
  ]::text[]
where code = 'basis';

update public.plans
set
  price_monthly_cents = 6999,
  price_yearly_cents = 69990,
  description = 'Kalkulation, Personal, Einsatzplanung und Materialverwaltung für wachsende Reinigungsfirmen.',
  features = array[
    'Alles aus Basis',
    'Kalkulation & Leistungsverzeichnis',
    'Zeiterfassung, Dienstplan & Lohnvorbereitung',
    'Materialverwaltung, Fahrtenbuch & QM',
    'Bis 20 Mitarbeitende (jeder weitere +2,50 € / Monat)'
  ]::text[]
where code = 'pro';

update public.plans
set
  price_monthly_cents = 13000,
  price_yearly_cents = 130000,
  description = 'Voller Funktionsumfang mit Objekt- und Projektmanagement, Steuerberater/DATEV und Bankabgleich.',
  features = array[
    'Alles aus Pro',
    'Projekte, Objekt-Mappen & Raumbuch',
    'Arbeitsnachweise, Fotos & Objektinformationen',
    'Steuerberater-Portal, DATEV-Export & Bankabgleich',
    'Unbegrenzte Mitarbeitende'
  ]::text[]
where code = 'enterprise';

commit;
