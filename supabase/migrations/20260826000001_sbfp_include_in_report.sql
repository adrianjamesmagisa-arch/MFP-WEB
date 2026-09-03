-- Add include_in_report flag to sbfp_data
-- Allows staff to toggle SDOs in/out of generated narrative reports
ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS include_in_report BOOLEAN DEFAULT true;

-- Set all existing rows to true
UPDATE public.sbfp_data SET include_in_report = true WHERE include_in_report IS NULL;
