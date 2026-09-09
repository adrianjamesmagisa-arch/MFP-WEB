-- DSWD/LDS/LGU/Others: monthly workspaces (not school year) + coop per province

ALTER TABLE public.mfp_program_procurement
  ADD COLUMN IF NOT EXISTS month INTEGER NOT NULL DEFAULT 8
    CHECK (month >= 1 AND month <= 12);

ALTER TABLE public.mfp_program_dropoffs
  ADD COLUMN IF NOT EXISTS month INTEGER NOT NULL DEFAULT 8
    CHECK (month >= 1 AND month <= 12);

ALTER TABLE public.mfp_program_procurement
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.cooperatives(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.mfp_program_procurement_unique_label_idx;
CREATE UNIQUE INDEX IF NOT EXISTS mfp_program_procurement_unique_label_idx
  ON public.mfp_program_procurement (center, year, month, program, label);

DROP INDEX IF EXISTS public.mfp_program_dropoffs_unique_muni_idx;
CREATE UNIQUE INDEX IF NOT EXISTS mfp_program_dropoffs_unique_muni_idx
  ON public.mfp_program_dropoffs (center, year, month, program, province, dropoff_name);

CREATE TABLE IF NOT EXISTS public.mfp_program_months (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  center TEXT NOT NULL,
  program TEXT NOT NULL CHECK (program IN ('dswd', 'lds', 'lgu', 'others')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (center, program, year, month)
);

CREATE INDEX IF NOT EXISTS mfp_program_months_center_program_idx
  ON public.mfp_program_months (center, program, year, month);

INSERT INTO public.mfp_program_months (year, month, center, program)
SELECT DISTINCT year, month, center, program
FROM public.mfp_program_procurement
ON CONFLICT (center, program, year, month) DO NOTHING;

ALTER TABLE public.mfp_program_months ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mfp_program_months' AND policyname = 'mfp_program_months_select'
  ) THEN
    CREATE POLICY mfp_program_months_select ON public.mfp_program_months FOR SELECT TO authenticated USING (true);
    CREATE POLICY mfp_program_months_insert ON public.mfp_program_months FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY mfp_program_months_update ON public.mfp_program_months FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY mfp_program_months_delete ON public.mfp_program_months FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
