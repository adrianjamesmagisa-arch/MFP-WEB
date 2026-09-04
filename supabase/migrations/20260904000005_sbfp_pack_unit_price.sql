-- Encoder pack ₱ for Commercial Milk (CM). PM/SM use fixed 25/30 in app logic.
ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS pack_unit_price NUMERIC;

COMMENT ON COLUMN public.sbfp_data.pack_unit_price IS
  '₱ per pack for CM (commercial). PM=25 and SM=30 are fixed in app; unused for those types.';
