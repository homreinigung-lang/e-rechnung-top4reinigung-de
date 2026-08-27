ALTER TABLE public.calculation_items
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'Kalkulation',
  ADD COLUMN IF NOT EXISTS source_lv_item_id uuid;

CREATE INDEX IF NOT EXISTS calculation_items_source_lv_item_id_idx
  ON public.calculation_items (source_lv_item_id);