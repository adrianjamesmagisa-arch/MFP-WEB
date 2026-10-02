const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8').split(/\n/).map(l => {
    const t = l.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) return null
    const i = t.indexOf('=')
    return [t.slice(0, i).trim(), t.slice(i + 1).trim()]
  }).filter(Boolean)
)

const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260904000003_sbfp_dropoff_points.sql'), 'utf8')

// If DATABASE_URL was added to env since last check
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || env.DATABASE_URL || env.SUPABASE_DB_URL
if (!dbUrl) {
  console.log('Still no DATABASE_URL. Writing SQL to scripts/APPLY_DROPOFF_MIGRATION.sql')
  fs.writeFileSync(path.join(__dirname, 'APPLY_DROPOFF_MIGRATION.sql'), sql)
  process.exit(2)
}

async function main() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('Migration applied for', ref)
}

main().catch(e => { console.error(e); process.exit(1) })
