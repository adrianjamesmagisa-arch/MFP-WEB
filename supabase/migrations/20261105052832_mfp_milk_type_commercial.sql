-- SBFP monitoring uses CM for Commercial Milk, including synced school drop-offs.
-- Keep existing enum labels unchanged and allow the same CM code in mfp_data.
-- IF NOT EXISTS also supports projects where this fix was run in the SQL editor.
ALTER TYPE public.milk_type ADD VALUE IF NOT EXISTS 'CM';
