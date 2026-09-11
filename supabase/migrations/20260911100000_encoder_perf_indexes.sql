-- Speed encoder workspace filters (center + year) used on every SBFP/DSWD page load.
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
