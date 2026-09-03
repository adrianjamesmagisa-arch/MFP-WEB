/**
 * Apply sbfp_school_years migration via Supabase SQL if DATABASE_URL is set.
 * Otherwise prints the SQL for the Dashboard SQL Editor.
 *
 * Usage:
 *   node scripts/apply-school-years-migration.mjs
 *   DATABASE_URL=postgres://... node scripts/apply-school-years-migration.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return
    const i = trimmed.indexOf('=')
    const key = trimmed.slice(0, i).trim()
    const val = trimmed.slice(i + 1).trim()
    if (!process.env[key]) process.env[key] = val
  })
}

const sqlPath = resolve(__dirname, '../supabase/migrations/20260903000003_create_sbfp_school_years.sql')
const sql = readFileSync(sqlPath, 'utf8')
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.log('No DATABASE_URL / SUPABASE_DB_URL set.')
  console.log('Paste this into Supabase → SQL Editor → Run:\n')
  console.log(sql)
  process.exit(0)
}

const { default: pg } = await import('pg').catch(() => ({ default: null }))
if (!pg) {
  console.error('Install pg: npm i pg')
  console.log(sql)
  process.exit(1)
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query(sql)
await client.end()
console.log('✅ Migration applied')
