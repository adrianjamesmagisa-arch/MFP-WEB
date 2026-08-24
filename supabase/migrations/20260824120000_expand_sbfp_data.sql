-- Expand sbfp_data with full column set from Excel
ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS pcc_assisted_supplier TEXT,
  ADD COLUMN IF NOT EXISTS nda_assisted_supplier TEXT,
  ADD COLUMN IF NOT EXISTS beneficiaries_pm INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beneficiaries_sm INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beneficiaries_cm INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feeding_days INTEGER,
  ADD COLUMN IF NOT EXISTS amount BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mode_of_procurement TEXT,
  ADD COLUMN IF NOT EXISTS pr_number TEXT,
  ADD COLUMN IF NOT EXISTS pr_date_received DATE,
  ADD COLUMN IF NOT EXISTS ors_date DATE,
  ADD COLUMN IF NOT EXISTS po_number TEXT,
  ADD COLUMN IF NOT EXISTS batch TEXT,
  ADD COLUMN IF NOT EXISTS contract_amount BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_start DATE,
  ADD COLUMN IF NOT EXISTS delivery_end DATE,
  ADD COLUMN IF NOT EXISTS status_of_payment TEXT,
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS moa_date_received DATE,
  ADD COLUMN IF NOT EXISTS moa_date_signed_pcc DATE,
  ADD COLUMN IF NOT EXISTS moa_date_signed_sdo DATE,
  ADD COLUMN IF NOT EXISTS moa_notarized_date DATE,
  ADD COLUMN IF NOT EXISTS moa_released_to_sdo DATE,
  ADD COLUMN IF NOT EXISTS noa_date DATE,
  ADD COLUMN IF NOT EXISTS ntp_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_snapshots JSONB DEFAULT '[]'::jsonb;

-- STATUS OF ACTIVITIES table
CREATE TABLE IF NOT EXISTS public.sbfp_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  activity TEXT NOT NULL,
  status TEXT,
  remarks TEXT,
  activity_date DATE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.sbfp_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated" ON public.sbfp_activities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.sbfp_activities
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.sbfp_activities
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated" ON public.sbfp_activities
  FOR DELETE TO authenticated USING (true);

-- SUMMARY TARGET MILK PROD table
CREATE TABLE IF NOT EXISTS public.sbfp_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  center TEXT NOT NULL,
  jan_dec_target_milk_volume BIGINT DEFAULT 0,
  target_milk_packs BIGINT DEFAULT 0,
  equivalent_volume NUMERIC DEFAULT 0,
  shortage_surplus NUMERIC DEFAULT 0,
  pct_covered NUMERIC DEFAULT 0,
  jul_dec_projected_volume BIGINT DEFAULT 0,
  milk_packs_can_produce BIGINT DEFAULT 0,
  shortage_surplus_packs NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(year, center)
);

ALTER TABLE public.sbfp_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated" ON public.sbfp_summary
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.sbfp_summary
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.sbfp_summary
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated" ON public.sbfp_summary
  FOR DELETE TO authenticated USING (true);

-- BUDGET BREAKDOWN table
CREATE TABLE IF NOT EXISTS public.sbfp_budget (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  center TEXT NOT NULL,
  milk_supplies BIGINT DEFAULT 0,
  office_professional BIGINT DEFAULT 0,
  traveling_expenses BIGINT DEFAULT 0,
  office_supplies BIGINT DEFAULT 0,
  training_expenses BIGINT DEFAULT 0,
  furniture_fixtures BIGINT DEFAULT 0,
  total BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(year, center)
);

ALTER TABLE public.sbfp_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated" ON public.sbfp_budget
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.sbfp_budget
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.sbfp_budget
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated" ON public.sbfp_budget
  FOR DELETE TO authenticated USING (true);
