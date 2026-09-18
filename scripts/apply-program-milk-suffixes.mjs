/**
 * Apply composeSdoWithMilkType to mfp_program_procurement label + province.
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 *   node scripts/apply-program-milk-suffixes.mjs
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
  .from('mfp_program_procurement')
  .select('id,label,province,milk_type')
  .range(0, 4999)

if (error) {
  console.error('Fetch failed:', error.message)
  process.exit(1)
}

let updated = 0
let skipped = 0
const samples = []

for (const r of data || []) {
  const raw = String(r.label || r.province || '').trim()
  if (!raw) {
    skipped++
    continue
  }
  const inferred = inferSbfpMilkType(raw)
  const milk = normalizeSbfpMilkType(r.milk_type) || inferred
  const nextLabel = composeSdoWithMilkType(raw, milk)
  const nextMilk = milk || r.milk_type
  if (!nextLabel || (nextLabel === r.label && nextLabel === r.province && nextMilk === r.milk_type)) {
    skipped++
    continue
  }
  const patch = { label: nextLabel, province: nextLabel }
  if (nextMilk && nextMilk !== r.milk_type) patch.milk_type = nextMilk
  const { error: upErr } = await supabase.from('mfp_program_procurement').update(patch).eq('id', r.id)
  if (upErr) {
    console.error('Update failed', r.id, upErr.message)
    process.exit(1)
  }
  updated++
  if (samples.length < 12) samples.push(`${raw} → ${nextLabel}`)
}

console.log(`Updated ${updated}, unchanged ${skipped}, total ${(data || []).length}`)
for (const s of samples) console.log(' ', s)
