ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_status_check') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_status_check CHECK (status IN ('active','paused','terminated'));
  END IF;
END $$;