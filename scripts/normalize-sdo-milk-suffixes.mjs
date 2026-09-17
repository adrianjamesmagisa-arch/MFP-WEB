/**
 * One-shot: rewrite sbfp_data.sdo to "{base} - {PM|SM|CM}" from milk_type.
 * Usage: node scripts/normalize-sdo-milk-suffixes.mjs < rows.json
 * Or: node scripts/normalize-sdo-milk-suffixes.mjs --sql  (prints UPDATE SQL from stdin JSON array)
 */

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

function esc(s) {
  return String(s).replace(/'/g, "''")
}

const chunks = []
process.stdin.setEncoding('utf8')
process.stdin.on('data', c => chunks.push(c))
process.stdin.on('end', () => {
  const rows = JSON.parse(chunks.join('') || '[]')
  const updates = []
  for (const r of rows) {
    const inferred = inferSbfpMilkType(r.sdo)
    const milk = normalizeSbfpMilkType(r.milk_type) || inferred
    const nextSdo = composeSdoWithMilkType(r.sdo, milk)
    const nextMilk = milk || r.milk_type
    if (!nextSdo) continue
    if (nextSdo === r.sdo && nextMilk === r.milk_type) continue
    updates.push({ id: r.id, from: r.sdo, to: nextSdo, milk: nextMilk, milkChanged: nextMilk !== r.milk_type })
  }
  console.error(`Will update ${updates.length} of ${rows.length} rows`)
  for (const u of updates.slice(0, 15)) {
    console.error(`  ${u.from} → ${u.to}${u.milkChanged ? ` (milk=${u.milk})` : ''}`)
  }
  if (updates.length > 15) console.error(`  … +${updates.length - 15} more`)

  // Single UPDATE with FROM values
  const values = updates
    .map(u => `('${u.id}'::uuid, '${esc(u.to)}', '${esc(u.milk)}')`)
    .join(',\n\t')
  const sql = `UPDATE sbfp_data AS d
SET
\tsdo = v.sdo,
\tmilk_type = v.milk_type
FROM (
\tVALUES
\t${values}
) AS v(id, sdo, milk_type)
WHERE d.id = v.id
\tAND d.milk_type IS DISTINCT FROM '__PPMP__'
\tAND d.milk_type IS DISTINCT FROM '__HIRING__';`
  process.stdout.write(sql)
})
