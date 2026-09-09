import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SQL_PATH = join(process.cwd(), 'supabase/migrations/20260904000003_sbfp_dropoff_points.sql')
const SUPPLIER_SQL_PATH = join(process.cwd(), 'supabase/migrations/20260909120000_sbfp_supplier_id.sql')

function loadSql() {
  return existsSync(SQL_PATH) ? readFileSync(SQL_PATH, 'utf8') : ''
}

function loadSupplierSql() {
  return existsSync(SUPPLIER_SQL_PATH)
    ? readFileSync(SUPPLIER_SQL_PATH, 'utf8')
    : 'ALTER TABLE public.sbfp_data ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.cooperatives(id) ON DELETE SET NULL;'
}

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error: dropErr } = await supabase.from('sbfp_dropoff_points').select('id,feeding_days').limit(1)
  const { error: mfpErr } = await supabase.from('mfp_data').select('source_dropoff_id').limit(1)
  const { error: supplierErr } = await supabase.from('sbfp_data').select('supplier_id').limit(1)
  const feedingSql = existsSync(join(process.cwd(), 'supabase/migrations/20260904000004_sbfp_dropoff_feeding_days.sql'))
    ? readFileSync(join(process.cwd(), 'supabase/migrations/20260904000004_sbfp_dropoff_feeding_days.sql'), 'utf8')
    : 'ALTER TABLE public.sbfp_dropoff_points ADD COLUMN IF NOT EXISTS feeding_days INTEGER NOT NULL DEFAULT 0;'
  const needFeeding = !!dropErr?.message?.includes('feeding_days')
  const needSupplier = !!supplierErr
  const ready = !dropErr && !mfpErr && !supplierErr
  let sql: string | null = null
  if (!ready) {
    if (needSupplier && !dropErr && !mfpErr) sql = loadSupplierSql()
    else if (needFeeding) sql = feedingSql
    else sql = [loadSql(), needSupplier ? loadSupplierSql() : ''].filter(Boolean).join('\n\n')
  }
  return NextResponse.json({
    status: ready ? 'OK' : 'ACTION_REQUIRED',
    dropoffError: dropErr?.message || null,
    mfpError: mfpErr?.message || null,
    supplierError: supplierErr?.message || null,
    sql,
    hint: ready
      ? 'Drop-off schema is ready.'
      : 'Paste sql into Supabase Dashboard → SQL Editor, then refresh.',
  })
}

export async function POST() {
  return NextResponse.json({
    status: 'ACTION_REQUIRED',
    message:
      'DDL cannot run from the app without DATABASE_URL. Paste the sql from GET into Supabase SQL Editor.',
    sql: loadSql(),
  }, { status: 400 })
}
