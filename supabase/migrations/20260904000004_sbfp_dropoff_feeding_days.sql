-- Add feeding days on SBFP drop-off schools (encoder input for pack / formulation calc)

ALTER TABLE public.sbfp_dropoff_points
  ADD COLUMN IF NOT EXISTS feeding_days INTEGER NOT NULL DEFAULT 0;
