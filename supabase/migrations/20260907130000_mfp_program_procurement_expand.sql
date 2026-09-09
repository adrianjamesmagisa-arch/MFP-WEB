-- Expand program procurement to match SBFP SDO procurement columns

ALTER TABLE public.mfp_program_procurement
  ADD COLUMN IF NOT EXISTS beneficiaries INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pr_number TEXT,
  ADD COLUMN IF NOT EXISTS pr_date_received DATE,
  ADD COLUMN IF NOT EXISTS ors_date DATE,
  ADD COLUMN IF NOT EXISTS po_number TEXT,
  ADD COLUMN IF NOT EXISTS batch TEXT,
  ADD COLUMN IF NOT EXISTS status_of_payment TEXT,
  ADD COLUMN IF NOT EXISTS pack_unit_price NUMERIC,
  ADD COLUMN IF NOT EXISTS delivery_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS monthly_packs_delivered JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_milk_prices JSONB NOT NULL DEFAULT '{}'::jsonb;
