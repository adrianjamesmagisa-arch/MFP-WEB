const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
  const p = path.join(__dirname, '../.env.local')
  if (!fs.existsSync(p)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(p, 'utf8')
      .split(/\n/)
      .map(l => {
        const t = l.trim()
        if (!t || t.startsWith('#') || !t.includes('=')) return null
        const i = t.indexOf('=')
        return [t.slice(0, i).trim(), t.slice(i + 1).trim()]
      })
      .filter(Boolean),
  )
}

const env = loadEnvLocal()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

const TABLES = [
  'mfp_data',
  'mfp_program_dropoffs',
  'mfp_program_procurement',
  'mfp_program_months',
  'sbfp_dropoff_points',
  'sbfp_data',
  'sbfp_monitoring',
  'sbfp_activities',
  'sbfp_summary',
  'sbfp_budget',
  'sbfp_ppmp_items',
  'sbfp_staff_hiring',
  'sbfp_school_years',
]

async function purgeTable(supabase, table) {
  let total = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .or('year.neq.2026,year.is.null')
      .select('*')
      .limit(500)
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return { skipped: true, total: 0 }
      }
      throw new Error(`${table}: ${error.message}`)
    }
    const n = data?.length ?? 0
    total += n
    if (n === 0) break
    if (n < 500) break
  }
  return { skipped: false, total }
}

async function main() {
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(2)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  console.log('Purging rows where year is not 2026 (service role)…')

  for (const table of TABLES) {
    const { skipped, total } = await purgeTable(supabase, table)
    if (skipped) console.log(`  ${table}: skipped (table missing)`)
    else console.log(`  ${table}: removed ${total} row(s)`)
  }

  console.log('Done.')
}

main().catch(e => {
  console.error(e.message || e)
  process.exit(1)
})
