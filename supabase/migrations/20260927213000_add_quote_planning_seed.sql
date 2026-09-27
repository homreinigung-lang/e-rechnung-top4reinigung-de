alter table public.documents
  add column if not exists planned_hours_month numeric not null default 0,
  add column if not exists planned_visits_month numeric not null default 0;

comment on column public.documents.planned_hours_month is 'Aus der Kalkulation übernommene Soll-Stunden pro Monat für die spätere Einsatzplanung';
comment on column public.documents.planned_visits_month is 'Aus der Kalkulation übernommene Einsätze pro Monat für die spätere Einsatzplanung';