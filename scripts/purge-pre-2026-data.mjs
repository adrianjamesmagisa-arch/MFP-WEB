/**
 * Delete MFP + SBFP rows before calendar year 2026 / before SY 2026-2027.
 * Run: node scripts/purge-pre-2026-data.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
    })
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const MIN = 2026

async function countLt(table) {
  const { count, error } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true })
    .lt('year', MIN)
  if (error) {
    console.warn(`count ${table}:`, error.message)
    return null
  }
  return count
}

async function deleteLt(table) {
  const before = await countLt(table)
  console.log(`${table}: ${before ?? '?'} rows with year < ${MIN}`)
  if (before === 0) return { table, deleted: 0 }

  // Delete in batches by fetching ids (safer with RLS/service role)
  let deleted = 0
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('id')
      .lt('year', MIN)
      .limit(500)
    if (error) {
      // Tables without id (e.g. school years keyed by year)
      const { error: e2, count } = await sb
        .from(table)
        .delete({ count: 'exact' })
        .lt('year', MIN)
      if (e2) {
        console.error(`delete ${table}:`, e2.message)
        return { table, deleted, error: e2.message }
      }
      return { table, deleted: count ?? deleted }
    }
    if (!data?.length) break
    const ids = data.map(r => r.id)
    const { error: delErr } = await sb.from(table).delete().in('id', ids)
    if (delErr) {
      console.error(`delete batch ${table}:`, delErr.message)
      return { table, deleted, error: delErr.message }
    }
    deleted += ids.length
    console.log(`  … deleted ${deleted}`)
  }
  return { table, deleted }
}

async function deleteSchoolYears() {
  const { error, count } = await sb
    .from('sbfp_school_years')
    .delete({ count: 'exact' })
    .lt('year', MIN)
  if (error) {
    console.warn('sbfp_school_years:', error.message)
    return
  }
  console.log(`sbfp_school_years: deleted ${count ?? 0} (year < ${MIN})`)
  await sb.from('sbfp_school_years').upsert(
    [{ year: 2026, label: '2026-2027', is_active: true }],
    { onConflict: 'year' }
  )
}

const tables = [
  'mfp_data',
  'sbfp_data',
  'sbfp_monitoring',
  'sbfp_summary',
  'sbfp_budget',
  'sbfp_activities',
]

console.log(`Purging year < ${MIN} …`)
for (const t of tables) {
  console.log(await deleteLt(t))
}
await deleteSchoolYears()

// Verify remaining
for (const t of ['mfp_data', 'sbfp_data']) {
  const { count: oldC } = await sb.from(t).select('*', { count: 'exact', head: true }).lt('year', MIN)
  const { count: newC } = await sb.from(t).select('*', { count: 'exact', head: true }).gte('year', MIN)
  console.log(`${t} remaining: year<${MIN}=${oldC} year>=${MIN}=${newC}`)
}
console.log('Done.')
