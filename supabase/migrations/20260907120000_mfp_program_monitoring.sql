-- Program monitoring (DSWD / LDS / LGU / Others): procurement + municipality drop-offs → mfp_data

CREATE TABLE IF NOT EXISTS public.mfp_program_procurement (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  center TEXT NOT NULL,
  program TEXT NOT NULL CHECK (program IN ('dswd', 'lds', 'lgu', 'others')),
  region TEXT DEFAULT '',
  province TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  procurement_status TEXT NOT NULL DEFAULT 'For Preparation',
  amount BIGINT NOT NULL DEFAULT 0,
  contract_amount BIGINT NOT NULL DEFAULT 0,
  packs_to_deliver BIGINT NOT NULL DEFAULT 0,
  packs_delivered BIGINT NOT NULL DEFAULT 0,
  milk_type TEXT DEFAULT 'PM',
  mode_of_procurement TEXT DEFAULT '',
  delivery_start DATE,
  delivery_end DATE,
  include_in_report BOOLEAN NOT NULL DEFAULT true,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS mfp_program_procurement_center_year_program_idx
  ON public.mfp_program_procurement (center, year, program);

CREATE UNIQUE INDEX IF NOT EXISTS mfp_program_procurement_unique_label_idx
  ON public.mfp_program_procurement (center, year, program, label);

CREATE TABLE IF NOT EXISTS public.mfp_program_dropoffs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  procurement_id UUID REFERENCES public.mfp_program_procurement(id) ON DELETE SET NULL,
  year INTEGER NOT NULL,
  center TEXT NOT NULL,
  program TEXT NOT NULL CHECK (program IN ('dswd', 'lds', 'lgu', 'others')),
  province TEXT DEFAULT '',
  municipality TEXT NOT NULL DEFAULT '',
  dropoff_name TEXT NOT NULL DEFAULT '',
  beneficiaries INTEGER NOT NULL DEFAULT 0,
  feeding_days INTEGER NOT NULL DEFAULT 0,
  region TEXT,
  district TEXT,
  remarks TEXT,
  include_in_masterlist BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS mfp_program_dropoffs_center_year_program_idx
  ON public.mfp_program_dropoffs (center, year, program);

CREATE INDEX IF NOT EXISTS mfp_program_dropoffs_procurement_id_idx
  ON public.mfp_program_dropoffs (procurement_id);

CREATE UNIQUE INDEX IF NOT EXISTS mfp_program_dropoffs_unique_muni_idx
  ON public.mfp_program_dropoffs (center, year, program, province, dropoff_name);

ALTER TABLE public.mfp_data
  ADD COLUMN IF NOT EXISTS source_program_dropoff_id UUID REFERENCES public.mfp_program_dropoffs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mfp_data_source_program_dropoff_id_uidx
  ON public.mfp_data (source_program_dropoff_id)
  WHERE source_program_dropoff_id IS NOT NULL;

ALTER TABLE public.mfp_program_procurement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfp_program_dropoffs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mfp_program_procurement' AND policyname = 'mfp_program_proc_select'
  ) THEN
    CREATE POLICY mfp_program_proc_select ON public.mfp_program_procurement FOR SELECT TO authenticated USING (true);
    CREATE POLICY mfp_program_proc_insert ON public.mfp_program_procurement FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY mfp_program_proc_update ON public.mfp_program_procurement FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY mfp_program_proc_delete ON public.mfp_program_procurement FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mfp_program_dropoffs' AND policyname = 'mfp_program_drop_select'
  ) THEN
    CREATE POLICY mfp_program_drop_select ON public.mfp_program_dropoffs FOR SELECT TO authenticated USING (true);
    CREATE POLICY mfp_program_drop_insert ON public.mfp_program_dropoffs FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY mfp_program_drop_update ON public.mfp_program_dropoffs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY mfp_program_drop_delete ON public.mfp_program_dropoffs FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
