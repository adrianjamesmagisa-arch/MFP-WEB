-- Re-ensure encoder filter indexes (idempotent). Run in Supabase SQL Editor if
-- 20260911100000 was never applied on production.
CREATE INDEX IF NOT EXISTS idx_sbfp_data_center_year ON public.sbfp_data (center, year);
CREATE INDEX IF NOT EXISTS idx_sbfp_dropoff_center_year ON public.sbfp_dropoff_points (center, year);
CREATE INDEX IF NOT EXISTS idx_sbfp_dropoff_parent ON public.sbfp_dropoff_points (sbfp_data_id);

CREATE INDEX IF NOT EXISTS idx_mfp_program_proc_lookup
  ON public.mfp_program_procurement (program, center, year);
CREATE INDEX IF NOT EXISTS idx_mfp_program_drop_lookup
  ON public.mfp_program_dropoffs (program, center, year);
CREATE INDEX IF NOT EXISTS idx_mfp_program_drop_parent
  ON public.mfp_program_dropoffs (procurement_id);

CREATE INDEX IF NOT EXISTS idx_mfp_data_center_year_funded
  ON public.mfp_data (center, year, funded_by);

-- Verify (notices show in SQL Editor output)
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  expected text[] := ARRAY[
    'idx_sbfp_data_center_year',
    'idx_sbfp_dropoff_center_year',
    'idx_sbfp_dropoff_parent',
    'idx_mfp_program_proc_lookup',
    'idx_mfp_program_drop_lookup',
    'idx_mfp_program_drop_parent',
    'idx_mfp_data_center_year_funded'
  ];
  name text;
BEGIN
  FOREACH name IN ARRAY expected
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = name AND c.relkind = 'i'
    ) THEN
      missing := array_append(missing, name);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NULL THEN
    RAISE NOTICE 'encoder_perf_indexes: all % indexes present', array_length(expected, 1);
  ELSE
    RAISE WARNING 'encoder_perf_indexes missing: %', missing;
  END IF;
END $$;
