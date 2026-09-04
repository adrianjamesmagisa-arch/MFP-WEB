import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MONTHLY_RAW_MILK_SQL = `ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS monthly_packs_delivered JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_milk_prices JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_milk_month TEXT;`;

const PPMP_SQL = `
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
ALTER TABLE public.sbfp_ppmp_items ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.sbfp_staff_hiring ENABLE ROW LEVEL SECURITY;
`;

const DROPOFF_SQL = `
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
CREATE INDEX IF NOT EXISTS sbfp_dropoff_points_center_year_idx ON public.sbfp_dropoff_points (center, year);
CREATE INDEX IF NOT EXISTS sbfp_dropoff_points_sbfp_data_id_idx ON public.sbfp_dropoff_points (sbfp_data_id);
CREATE UNIQUE INDEX IF NOT EXISTS sbfp_dropoff_points_unique_school_idx ON public.sbfp_dropoff_points (center, year, sdo, dropoff_name);
ALTER TABLE public.sbfp_dropoff_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfp_data ADD COLUMN IF NOT EXISTS source_dropoff_id UUID REFERENCES public.sbfp_dropoff_points(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mfp_data_source_dropoff_id_uidx ON public.mfp_data (source_dropoff_id) WHERE source_dropoff_id IS NOT NULL;
`;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "public" } }
  );

  const { error: testErr } = await supabase
    .from("sbfp_data")
    .select("monthly_packs_delivered,raw_milk_prices,raw_milk_month")
    .limit(1);

  const colMissing =
    !!testErr?.message &&
    (testErr.message.includes("monthly_packs_delivered") ||
      testErr.message.includes("raw_milk_prices") ||
      testErr.message.includes("raw_milk_month") ||
      testErr.message.includes("column"));

  const { error: ppmpErr } = await supabase.from("sbfp_ppmp_items").select("id").limit(1)
  const { error: hireErr } = await supabase.from("sbfp_staff_hiring").select("id").limit(1)
  const ppmpMissing = !!(ppmpErr?.message || hireErr?.message)

  const { error: dropErr } = await supabase.from("sbfp_dropoff_points").select("id").limit(1)
  const { error: mfpLinkErr } = await supabase.from("mfp_data").select("source_dropoff_id").limit(1)
  const dropoffMissing = !!(dropErr?.message || mfpLinkErr?.message)

  if (colMissing || ppmpMissing || dropoffMissing) {
    return NextResponse.json({
      status: "ACTION_REQUIRED",
      message:
        "Please run this SQL in your Supabase Dashboard > SQL Editor:",
      sql: [
        colMissing ? MONTHLY_RAW_MILK_SQL : "",
        ppmpMissing ? PPMP_SQL : "",
        dropoffMissing ? DROPOFF_SQL : "",
      ].filter(Boolean).join("\n"),
    });
  }

  return NextResponse.json({
    status: "OK",
    message:
      "SBFP monthly raw milk, PPMP / hiring, and drop-off points tables are ready.",
  });
}
