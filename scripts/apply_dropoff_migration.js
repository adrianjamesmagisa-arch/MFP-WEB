/**
 * Apply drop-off points migration.
 * Uses DATABASE_URL / SUPABASE_DB_URL when available; otherwise prints SQL.
 *
 * Usage: node scripts/apply_dropoff_migration.js
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\n/).forEach(line => {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) return
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (!process.env[k]) process.env[k] = v
  })
}

const sqlPath = path.join(__dirname, '../supabase/migrations/20260904000003_sbfp_dropoff_points.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

async function main() {
  if (!dbUrl) {
    console.log('No DATABASE_URL / SUPABASE_DB_URL set.')
    console.log('Paste this into Supabase → SQL Editor → Run:\n')
    console.log(sql)
    process.exit(0)
  }
  const pg = require('pg')
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('✅ Drop-off migration applied')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
