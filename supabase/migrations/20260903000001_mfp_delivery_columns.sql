-- Add target_milk_packs_to_deliver and total_milk_packs_delivered columns to mfp_data
ALTER TABLE public.mfp_data
  ADD COLUMN IF NOT EXISTS target_milk_packs_to_deliver INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_milk_packs_delivered INTEGER DEFAULT 0;
