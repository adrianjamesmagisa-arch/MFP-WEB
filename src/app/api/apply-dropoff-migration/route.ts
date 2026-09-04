import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SQL_PATH = join(process.cwd(), 'supabase/migrations/20260904000003_sbfp_dropoff_points.sql')

function loadSql() {
  return existsSync(SQL_PATH) ? readFileSync(SQL_PATH, 'utf8') : ''
}

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error: dropErr } = await supabase.from('sbfp_dropoff_points').select('id,feeding_days').limit(1)
  const { error: mfpErr } = await supabase.from('mfp_data').select('source_dropoff_id').limit(1)
  const ready = !dropErr && !mfpErr
  const feedingSql = existsSync(join(process.cwd(), 'supabase/migrations/20260904000004_sbfp_dropoff_feeding_days.sql'))
    ? readFileSync(join(process.cwd(), 'supabase/migrations/20260904000004_sbfp_dropoff_feeding_days.sql'), 'utf8')
    : 'ALTER TABLE public.sbfp_dropoff_points ADD COLUMN IF NOT EXISTS feeding_days INTEGER NOT NULL DEFAULT 0;'
  const needFeeding = !!dropErr?.message?.includes('feeding_days')
  return NextResponse.json({
    status: ready ? 'OK' : 'ACTION_REQUIRED',
    dropoffError: dropErr?.message || null,
    mfpError: mfpErr?.message || null,
    sql: ready ? null : (needFeeding ? feedingSql : loadSql()),
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
