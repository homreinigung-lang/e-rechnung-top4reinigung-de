-- Keep reviewed room inputs with each saved calculation. Existing row policies apply.
alter table public.calculations
  add column if not exists room_calculation jsonb not null
  default '{"version":1,"enabled":false,"rooms":[]}'::jsonb;

alter table public.calculations
  add constraint calculations_room_calculation_object
  check (jsonb_typeof(room_calculation) = 'object');
