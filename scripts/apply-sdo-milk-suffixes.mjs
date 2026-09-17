/**
 * Apply composeSdoWithMilkType to all non-aux sbfp_data rows.
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local — do not log secrets.
 *
 *   node scripts/apply-sdo-milk-suffixes.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    env[m[1]] = v
  }
  return env
}

function normalizeSbfpMilkType(value) {
  const s = String(value || '').trim().toUpperCase()
  if (s === 'PM' || s.startsWith('PASTEUR')) return 'PM'
  if (s === 'SM' || s.startsWith('STERIL')) return 'SM'
  if (s === 'CM' || s.startsWith('COMMERCIAL') || s === 'COM') return 'CM'
  if (s === 'SMP') return 'PM'
  return null
}

function inferSbfpMilkType(...parts) {
  const blob = parts.filter(Boolean).join(' ').toUpperCase()
  if (!blob.trim()) return null
  if (/\(CM\)/.test(blob) || /\bCM\b/.test(blob) || /COMMERCIAL/.test(blob)) return 'CM'
  if (/\(SM\)/.test(blob) || /\bSM\b/.test(blob) || /STERIL/.test(blob)) return 'SM'
  if (/\(PM\)/.test(blob) || /\bPM\b/.test(blob) || /PASTEUR/.test(blob)) return 'PM'
  return null
}

function stripMilkTypeFromSdoName(value) {
  return String(value || '')
    .replace(/^\d+\.\s*/g, '')
    .replace(/^sdo\s+/i, '')
    .replace(/\s*\((PM|SM|SMP|CM|SPM|Sterilized|Pasteurized|Commercial)[^)]*\)\s*/gi, ' ')
    .replace(/\s*[-–—]?\s*(PM|SM|SMP|CM|SPM)\b/gi, ' ')
    .replace(/\s*[-–—]?\s*\d+\s*Feeding\s*Days?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-–—]+$/g, '')
    .trim()
}

function composeSdoWithMilkType(sdoOrBase, milkType) {
  const base = stripMilkTypeFromSdoName(String(sdoOrBase || ''))
  const milk = normalizeSbfpMilkType(milkType)
  if (!base) return ''
  if (!milk) return base
  return `${base} - ${milk}`
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await supabase
  .from('sbfp_data')
  .select('id,sdo,milk_type')
  .not('milk_type', 'eq', '__PPMP__')
  .not('milk_type', 'eq', '__HIRING__')
  .range(0, 4999)

if (error) {
  console.error('Fetch failed:', error.message)
  process.exit(1)
}

const rows = (data || []).filter(r => String(r.sdo || '').trim())
let updated = 0
let skipped = 0
const samples = []

for (const r of rows) {
  const inferred = inferSbfpMilkType(r.sdo)
  const milk = normalizeSbfpMilkType(r.milk_type) || inferred
  const nextSdo = composeSdoWithMilkType(r.sdo, milk)
  const nextMilk = milk || r.milk_type
  if (!nextSdo || (nextSdo === r.sdo && nextMilk === r.milk_type)) {
    skipped++
    continue
  }
  const patch = { sdo: nextSdo }
  if (nextMilk && nextMilk !== r.milk_type) patch.milk_type = nextMilk
  const { error: upErr } = await supabase.from('sbfp_data').update(patch).eq('id', r.id)
  if (upErr) {
    console.error('Update failed', r.id, upErr.message)
    process.exit(1)
  }
  updated++
  if (samples.length < 12) samples.push(`${r.sdo} → ${nextSdo}`)
}

console.log(`Updated ${updated}, unchanged ${skipped}, total ${rows.length}`)
for (const s of samples) console.log(' ', s)
