-- Optional SBFP columns for Gross Income from Raw Milk:
-- Raw Milk Utilized (L) × Cost per Liter = Gross Revenue from Raw Milk
ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS raw_milk_utilized_liters NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_liter_raw_milk NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_revenue_raw_milk NUMERIC DEFAULT 0;
