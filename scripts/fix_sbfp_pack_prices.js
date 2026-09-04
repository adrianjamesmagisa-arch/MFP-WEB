const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\n/).map(l => {
    const t = l.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) return null
    const i = t.indexOf('=')
    return [t.slice(0, i).trim(), t.slice(i + 1).trim()]
  }).filter(Boolean),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

function inferMilk(sdo, amount, packs, current) {
  const s = String(sdo || '')
  if (/\(CM\)|\bCM\b|COMMERCIAL/i.test(s)) return 'CM'
  if (/\(SM\)|STERIL/i.test(s)) return 'SM'
  if (/\(PM\)|PASTEUR/i.test(s)) return 'PM'
  const amt = Number(amount) || 0
  const p = Number(packs) || 0
  if (amt > 0 && p > 0) {
    const p25 = Math.round(amt / 25)
    const p30 = Math.round(amt / 30)
    if (p === p30) return 'SM'
    if (p === p25) return 'PM'
  }
  if (current === 'SM' || current === 'PM' || current === 'CM') return current
  return 'PM'
}

;(async () => {
  const { error: probe } = await sb.from('sbfp_data').select('pack_unit_price').limit(1)
  if (probe) {
    console.log('MISSING COLUMN — run in Supabase SQL Editor:')
    console.log('ALTER TABLE public.sbfp_data ADD COLUMN IF NOT EXISTS pack_unit_price NUMERIC;')
    console.log('probe error:', probe.message)
  } else {
    console.log('pack_unit_price OK')
  }

  const { data, error } = await sb
    .from('sbfp_data')
    .select('id,sdo,milk_type,amount,packs_to_deliver,center')
    .eq('year', 2026)
  if (error) {
    console.error(error)
    process.exit(1)
  }

  let fixed = 0
  for (const r of data || []) {
    if (r.milk_type === '__PPMP__' || r.milk_type === '__HIRING__') continue
    const milk = inferMilk(r.sdo, r.amount, r.packs_to_deliver, r.milk_type)
    const amt = Number(r.amount) || 0
    let packs = Number(r.packs_to_deliver) || 0
    if (amt > 0 && milk === 'PM') packs = Math.round(amt / 25)
    if (amt > 0 && milk === 'SM') packs = Math.round(amt / 30)

    const sameType = r.milk_type === milk
    const samePacks = milk === 'CM' || r.packs_to_deliver === packs
    if (sameType && samePacks) continue

    const patch = { milk_type: milk }
    if (!probe) patch.pack_unit_price = null
    if (milk !== 'CM' && amt > 0) patch.packs_to_deliver = packs

    const { error: updErr } = await sb.from('sbfp_data').update(patch).eq('id', r.id)
    if (updErr) {
      console.log('err', r.center, r.sdo, updErr.message)
    } else {
      fixed++
      if (r.center === 'NHQ') {
        console.log(
          'NHQ',
          r.sdo,
          r.milk_type,
          '->',
          milk,
          r.packs_to_deliver,
          '->',
          patch.packs_to_deliver ?? r.packs_to_deliver,
        )
      }
    }
  }
  console.log('updated', fixed)
})()
