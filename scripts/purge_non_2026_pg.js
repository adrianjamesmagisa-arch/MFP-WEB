const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

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
const dbUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  env.DATABASE_URL ||
  env.SUPABASE_DB_URL

const sqlPath = path.join(__dirname, 'purge_non_2026_data.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

const COUNT_QUERIES = [
  ['mfp_data', 'SELECT count(*)::int AS n FROM public.mfp_data WHERE year IS NULL OR year <> 2026'],
  ['mfp_program_dropoffs', 'SELECT count(*)::int AS n FROM public.mfp_program_dropoffs WHERE year IS NULL OR year <> 2026'],
  ['mfp_program_procurement', 'SELECT count(*)::int AS n FROM public.mfp_program_procurement WHERE year IS NULL OR year <> 2026'],
  ['sbfp_data', 'SELECT count(*)::int AS n FROM public.sbfp_data WHERE year IS NULL OR year <> 2026'],
  ['sbfp_dropoff_points', 'SELECT count(*)::int AS n FROM public.sbfp_dropoff_points WHERE year IS NULL OR year <> 2026'],
]

async function main() {
  if (!dbUrl) {
    console.error('NO_DATABASE_URL: add DATABASE_URL to .env.local or set env var, then re-run.')
    console.error('Or paste scripts/purge_non_2026_data.sql into Supabase → SQL Editor.')
    process.exit(2)
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()

  console.log('Rows to remove (year <> 2026):')
  for (const [name, q] of COUNT_QUERIES) {
    try {
      const { rows } = await client.query(q)
      console.log(`  ${name}: ${rows[0]?.n ?? '?'}`)
    } catch (e) {
      console.log(`  ${name}: (table missing or error)`)
    }
  }

  await client.query(sql)
  console.log('Purge complete — only year 2026 data remains in year-scoped tables.')
  await client.end()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
