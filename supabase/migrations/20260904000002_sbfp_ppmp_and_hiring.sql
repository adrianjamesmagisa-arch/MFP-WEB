-- Line-item PPMP tables from each center Excel sheet
-- (Office Supplies / Fixtures-ICT / Training) plus Staff Hiring Status.

CREATE TABLE IF NOT EXISTS public.sbfp_ppmp_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  center TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT,
  item_name TEXT,
  amount NUMERIC DEFAULT 0,
  mode_of_procurement TEXT,
  date_received DATE,
  pr_number TEXT,
  ors_date DATE,
  po_number TEXT,
  remarks TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS sbfp_ppmp_items_center_year_idx
  ON public.sbfp_ppmp_items (center, year, category, sort_order);

ALTER TABLE public.sbfp_ppmp_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read for authenticated" ON public.sbfp_ppmp_items;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.sbfp_ppmp_items;
DROP POLICY IF EXISTS "Enable update for authenticated" ON public.sbfp_ppmp_items;
DROP POLICY IF EXISTS "Enable delete for authenticated" ON public.sbfp_ppmp_items;

CREATE POLICY "Enable read for authenticated" ON public.sbfp_ppmp_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.sbfp_ppmp_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.sbfp_ppmp_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated" ON public.sbfp_ppmp_items
  FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.sbfp_staff_hiring (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  center TEXT NOT NULL,
  status TEXT,
  position TEXT,
  base_salary NUMERIC DEFAULT 0,
  remarks TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS sbfp_staff_hiring_center_year_idx
  ON public.sbfp_staff_hiring (center, year, sort_order);

ALTER TABLE public.sbfp_staff_hiring ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read for authenticated" ON public.sbfp_staff_hiring;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.sbfp_staff_hiring;
DROP POLICY IF EXISTS "Enable update for authenticated" ON public.sbfp_staff_hiring;
DROP POLICY IF EXISTS "Enable delete for authenticated" ON public.sbfp_staff_hiring;

CREATE POLICY "Enable read for authenticated" ON public.sbfp_staff_hiring
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.sbfp_staff_hiring
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.sbfp_staff_hiring
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated" ON public.sbfp_staff_hiring
  FOR DELETE TO authenticated USING (true);
