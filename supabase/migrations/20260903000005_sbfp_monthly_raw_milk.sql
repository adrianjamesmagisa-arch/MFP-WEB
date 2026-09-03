-- Monthly packs delivered + raw milk price (₱/L) per SDO, keyed by calendar month "1".."12".
-- Matches SBFP FY Monitoring columns:
--   Packs delivered for the month of Aug/Sep/...
--   Raw Milk Price August/September/...
-- Gross income = Σ ((packs / 5) × 0.2 × price_per_liter) for the selected month.

ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS monthly_packs_delivered JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_milk_prices JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.sbfp_data.monthly_packs_delivered IS
  'Packs delivered for each calendar month. Keys: "1".."12". Example: {"8": 93252}';
COMMENT ON COLUMN public.sbfp_data.raw_milk_prices IS
  'Raw milk price ₱/L for each calendar month. Keys: "1".."12". Example: {"8": 90}';
