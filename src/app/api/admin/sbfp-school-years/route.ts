import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * One-shot helper: attempt to create sbfp_school_years via service role.
 * If the table is missing, returns the SQL to paste in Supabase SQL Editor.
 */
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 })
  }

  const sql = `
CREATE TABLE IF NOT EXISTS public.sbfp_school_years (
  year INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.sbfp_school_years ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Enable read for authenticated" ON public.sbfp_school_years FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Enable insert for authenticated" ON public.sbfp_school_years FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Enable update for authenticated" ON public.sbfp_school_years FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Enable delete for authenticated" ON public.sbfp_school_years FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.sbfp_school_years (year, label, is_active) VALUES
  (2025, '2025-2026', true),
  (2026, '2026-2027', true)
ON CONFLICT (year) DO UPDATE SET label = EXCLUDED.label, is_active = EXCLUDED.is_active;
`.trim()

  const sb = createClient(url, key)
  const { data, error } = await sb.from('sbfp_school_years').upsert([
    { year: 2025, label: '2025-2026', is_active: true },
    { year: 2026, label: '2026-2027', is_active: true },
  ], { onConflict: 'year' }).select()

  if (!error) {
    return NextResponse.json({ ok: true, rows: data })
  }

  return NextResponse.json({
    ok: false,
    message: 'Table missing — run this SQL in Supabase SQL Editor',
    error: error.message,
    sql,
  }, { status: 503 })
}
