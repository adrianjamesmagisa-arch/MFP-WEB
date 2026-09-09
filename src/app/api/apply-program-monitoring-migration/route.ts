import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BASE_SQL = join(process.cwd(), 'supabase/migrations/20260907120000_mfp_program_monitoring.sql')
const EXPAND_SQL = join(process.cwd(), 'supabase/migrations/20260907130000_mfp_program_procurement_expand.sql')
const MONTH_SQL = join(process.cwd(), 'supabase/migrations/20260909140000_mfp_program_months.sql')

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error: procErr } = await supabase.from('mfp_program_procurement').select('id').limit(1)
  const { error: dropErr } = await supabase.from('mfp_program_dropoffs').select('id').limit(1)
  const { error: mfpErr } = await supabase.from('mfp_data').select('source_program_dropoff_id').limit(1)
  const { error: expandErr } = await supabase.from('mfp_program_procurement').select('beneficiaries').limit(1)
  const { error: monthErr } = await supabase.from('mfp_program_months').select('id').limit(1)
  const ready = !procErr && !dropErr && !mfpErr && !expandErr && !monthErr
  let sql: string | null = null
  if (!ready) {
    const chunks: string[] = []
    if ((procErr || dropErr || mfpErr) && existsSync(BASE_SQL)) chunks.push(readFileSync(BASE_SQL, 'utf8'))
    if (expandErr && existsSync(EXPAND_SQL)) chunks.push(readFileSync(EXPAND_SQL, 'utf8'))
    if (monthErr && existsSync(MONTH_SQL)) chunks.push(readFileSync(MONTH_SQL, 'utf8'))
    sql = chunks.join('\n\n') || (existsSync(BASE_SQL) ? readFileSync(BASE_SQL, 'utf8') : '')
  }
  return NextResponse.json({
    status: ready ? 'OK' : 'ACTION_REQUIRED',
    errors: {
      procErr: procErr?.message,
      dropErr: dropErr?.message,
      mfpErr: mfpErr?.message,
      expandErr: expandErr?.message,
      monthErr: monthErr?.message,
    },
    sql,
    hint: ready
      ? 'Program monitoring schema is ready.'
      : 'Paste sql into Supabase Dashboard → SQL Editor, then refresh monitoring pages.',
  })
}
