-- SBFP drop-off points (schools) + link into MFP masterlist

CREATE TABLE IF NOT EXISTS public.sbfp_dropoff_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  center TEXT NOT NULL,
  sbfp_data_id UUID REFERENCES public.sbfp_data(id) ON DELETE SET NULL,
  sdo TEXT NOT NULL DEFAULT '',
  dropoff_name TEXT NOT NULL,
  beneficiaries INTEGER NOT NULL DEFAULT 0,
  district TEXT,
  municipality TEXT,
  province TEXT,
  region TEXT,
  remarks TEXT,
  include_in_masterlist BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS sbfp_dropoff_points_center_year_idx
  ON public.sbfp_dropoff_points (center, year);

CREATE INDEX IF NOT EXISTS sbfp_dropoff_points_sbfp_data_id_idx
  ON public.sbfp_dropoff_points (sbfp_data_id);

CREATE UNIQUE INDEX IF NOT EXISTS sbfp_dropoff_points_unique_school_idx
  ON public.sbfp_dropoff_points (center, year, sdo, dropoff_name);

ALTER TABLE public.sbfp_dropoff_points ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sbfp_dropoff_points' AND policyname = 'sbfp_dropoff_select'
  ) THEN
    CREATE POLICY sbfp_dropoff_select ON public.sbfp_dropoff_points
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sbfp_dropoff_points' AND policyname = 'sbfp_dropoff_insert'
  ) THEN
    CREATE POLICY sbfp_dropoff_insert ON public.sbfp_dropoff_points
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sbfp_dropoff_points' AND policyname = 'sbfp_dropoff_update'
  ) THEN
    CREATE POLICY sbfp_dropoff_update ON public.sbfp_dropoff_points
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sbfp_dropoff_points' AND policyname = 'sbfp_dropoff_delete'
  ) THEN
    CREATE POLICY sbfp_dropoff_delete ON public.sbfp_dropoff_points
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

ALTER TABLE public.mfp_data
  ADD COLUMN IF NOT EXISTS source_dropoff_id UUID REFERENCES public.sbfp_dropoff_points(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mfp_data_source_dropoff_id_uidx
  ON public.mfp_data (source_dropoff_id)
  WHERE source_dropoff_id IS NOT NULL;
