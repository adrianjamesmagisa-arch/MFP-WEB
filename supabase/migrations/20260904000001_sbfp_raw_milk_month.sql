-- Per-SDO month used for Raw ₱/L entry and Income display (Aug–Dec of SY).
-- Keys match raw_milk_prices JSONB: "8".."12".

ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS raw_milk_month TEXT;

COMMENT ON COLUMN public.sbfp_data.raw_milk_month IS
  'Calendar month key for this SDO raw milk price/income UI. Values: "8".."12" (Aug–Dec).';
