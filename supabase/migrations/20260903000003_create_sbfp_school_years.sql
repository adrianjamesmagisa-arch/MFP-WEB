-- School year registry for SBFP (SY label + integer year used on data tables)
CREATE TABLE IF NOT EXISTS public.sbfp_school_years (
  year INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sbfp_school_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated" ON public.sbfp_school_years
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.sbfp_school_years
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.sbfp_school_years
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated" ON public.sbfp_school_years
  FOR DELETE TO authenticated USING (true);

INSERT INTO public.sbfp_school_years (year, label, is_active) VALUES
  (2025, '2025-2026', true),
  (2026, '2026-2027', true)
ON CONFLICT (year) DO UPDATE SET
  label = EXCLUDED.label,
  is_active = EXCLUDED.is_active;
