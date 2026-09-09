const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8').split(/\n/).map(l => {
    const t = l.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) return null
    const i = t.indexOf('=')
    return [t.slice(0, i).trim(), t.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }).filter(Boolean)
)

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/20260909140000_mfp_program_months.sql'),
  'utf8',
)

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || env.DATABASE_URL || env.SUPABASE_DB_URL
if (!dbUrl) {
  console.log('NO_DATABASE_URL')
  process.exit(2)
}

async function main() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('OK applied mfp_program_months')
}

main().catch(e => {
  console.error(e.message || e)
  process.exit(1)
})
