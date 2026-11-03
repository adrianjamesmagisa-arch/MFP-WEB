-- MFP Financial Accomplishment (Allotment / Obligation / Disbursement) per center per year.
CREATE TABLE IF NOT EXISTS public.sbfp_financial_accomplishment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  center TEXT NOT NULL,
  allotment NUMERIC DEFAULT 0,
  obligation NUMERIC DEFAULT 0,
  disbursement NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (center, year)
);

ALTER TABLE public.sbfp_financial_accomplishment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read for authenticated" ON public.sbfp_financial_accomplishment;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.sbfp_financial_accomplishment;
DROP POLICY IF EXISTS "Enable update for authenticated" ON public.sbfp_financial_accomplishment;
DROP POLICY IF EXISTS "Enable delete for authenticated" ON public.sbfp_financial_accomplishment;

CREATE POLICY "Enable read for authenticated" ON public.sbfp_financial_accomplishment
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.sbfp_financial_accomplishment
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.sbfp_financial_accomplishment
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated" ON public.sbfp_financial_accomplishment
  FOR DELETE TO authenticated USING (true);

