/**
 * Parse Office Supplies / Fixtures / Training PPMP + Staff Hiring
 * from each center sheet in SBFP FY 2026 Monitoring.xlsx
 */
const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.join(__dirname, '..', '.env.local')
fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
  if (!line || line.startsWith('#') || !line.includes('=')) return
  const i = line.indexOf('=')
  const k = line.slice(0, i).trim()
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  if (!process.env[k]) process.env[k] = v
})

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const EXCEL = 'C:/pcc folder/PCC/Data processing/SBFP FY 2026_Monitoring.xlsx'
const CENTERS = ['UPLB', 'CSU', 'DMMMSU', 'MMSU', 'CLSU', 'WVSU', 'LCSF', 'USF', 'VSU', 'MLPC', 'CMU', 'USM']

function excelDateToISO(serial) {
  if (serial == null || typeof serial !== 'number' || !Number.isFinite(serial)) return null
  if (serial < 45300 || serial > 47500) return null
  const d = xlsx.SSF.parse_date_code(serial)
  if (!d || d.y < 2024 || d.y > 2030) return null
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
}

function normStatus(s) {
  const u = String(s || '').trim()
  if (!u) return ''
  const map = {
    'FOR HIRING': 'For Hiring',
    'FILLED UP': 'Filled Up',
    'HIRED': 'Hired',
    'FOR PREPARATION': 'For Preparation',
    'ONGOING': 'Ongoing Procurement',
    'DONE': 'Completed',
    'COMPLETED': 'Completed',
    'FAILED': 'Failed',
    'CANCELLED': 'Cancelled',
  }
  return map[u.toUpperCase()] || u
}

function findRow(rows, pred) {
  for (let i = 0; i < rows.length; i++) {
    if (pred(rows[i], i)) return i
  }
  return -1
}

function cellStr(row, i) {
  return String(row?.[i] ?? '').trim()
}

function parsePpmp(rows, titleRe, category) {
  const titleIdx = findRow(rows, r => titleRe.test(r.slice(0, 6).map(x => String(x || '')).join(' ')))
  if (titleIdx < 0) return []
  const headerIdx = findRow(rows.slice(titleIdx, titleIdx + 4), r =>
    String(r[0] || '').toUpperCase() === 'STATUS' || String(r[1] || '').toUpperCase() === 'STATUS'
  )
  if (headerIdx < 0) return []
  const start = titleIdx + headerIdx + 1
  const out = []
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]
    const a = cellStr(r, 0)
    const b = cellStr(r, 1)
    const c = r[2]
    if (b.toUpperCase() === 'TOTAL' || a.toUpperCase() === 'TOTAL') break
    if (/TOTAL FUND IN PPMP|STAFF HIRING/i.test(`${a} ${b}`)) break
    if (!a && !b && !(Number(c) > 0)) continue
    if (!b && !a) continue
    out.push({
      category,
      status: normStatus(a),
      item_name: b,
      amount: Number(c) || 0,
      mode_of_procurement: cellStr(r, 3) || null,
      date_received: excelDateToISO(r[4]),
      pr_number: cellStr(r, 5) || null,
      ors_date: excelDateToISO(r[6]),
      po_number: cellStr(r, 7) || null,
      remarks: cellStr(r, 8) || null,
    })
  }
  return out
}

function parseHiring(rows) {
  let header = -1
  let statusCol = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || []
    for (let c = 0; c <= 4; c++) {
      if (String(r[c] || '').toUpperCase() === 'STATUS' && String(r[c + 1] || '').toUpperCase().includes('POSITION')) {
        header = i
        statusCol = c
        break
      }
    }
    if (header >= 0) break
  }
  if (header < 0) return []
  const out = []
  for (let i = header + 1; i < Math.min(header + 20, rows.length); i++) {
    const r = rows[i] || []
    const status = cellStr(r, statusCol)
    const position = cellStr(r, statusCol + 1)
    const salary = r[statusCol + 2]
    if (/TOTAL FUND IN PPMP|OFFICE SUPPLIES|TRAINING|FIXTURE/i.test(`${status} ${position}`)) break
    if (!status && !position && !(Number(salary) > 0)) {
      if (out.length && !status && !position) continue
      continue
    }
    if (!position && !status) continue
    out.push({
      status: normStatus(status),
      position,
      base_salary: Number(salary) || 0,
      remarks: cellStr(r, statusCol + 3) || null,
    })
  }
  return out
}

async function main() {
  const wb = xlsx.readFile(EXCEL)
  let ppmpCount = 0
  let hireCount = 0

  for (const center of CENTERS) {
    const sh = wb.Sheets[center]
    if (!sh) continue
    const rows = xlsx.utils.sheet_to_json(sh, { header: 1, raw: true, defval: '' })
    const items = [
      ...parsePpmp(rows, /OFFICE SUPPLIES TOTAL FUND IN PPMP/i, 'office_supplies'),
      ...parsePpmp(rows, /FIXTURES TOTAL FUND IN PPMP/i, 'fixtures'),
      ...parsePpmp(rows, /TRAINING TOTAL FUND IN PPMP/i, 'training'),
    ]
    const hiring = parseHiring(rows)

    await supabase.from('sbfp_data').delete().eq('center', center).eq('year', 2026).eq('milk_type', '__PPMP__')
    await supabase.from('sbfp_data').delete().eq('center', center).eq('year', 2026).eq('milk_type', '__HIRING__')

    if (items.length) {
      const payload = items.map(r => ({
        year: 2026,
        center,
        region: 'PPMP',
        sdo: r.item_name || '—',
        procurement_status: r.status || 'For Preparation',
        packs_to_deliver: 0,
        packs_delivered: 0,
        milk_type: '__PPMP__',
        delivery_schedule: r.category,
        amount: r.amount || 0,
        mode_of_procurement: r.mode_of_procurement,
        pr_date_received: r.date_received,
        pr_number: r.pr_number,
        ors_date: r.ors_date,
        po_number: r.po_number,
        remarks: r.remarks,
        include_in_report: false,
        contract_amount: 0,
        beneficiaries_pm: 0,
      }))
      const { error } = await supabase.from('sbfp_data').insert(payload)
      if (error) console.log(center, 'PPMP ERROR', error.message)
      else {
        ppmpCount += items.length
        console.log(center, 'PPMP', items.length)
      }
    } else {
      console.log(center, 'PPMP 0')
    }

    if (hiring.length) {
      const payload = hiring.map(r => ({
        year: 2026,
        center,
        region: 'HIRING',
        sdo: r.position || '—',
        procurement_status: r.status || 'For Hiring',
        packs_to_deliver: 0,
        packs_delivered: 0,
        milk_type: '__HIRING__',
        delivery_schedule: 'staff_hiring',
        amount: r.base_salary || 0,
        remarks: r.remarks,
        include_in_report: false,
        contract_amount: 0,
        beneficiaries_pm: 0,
      }))
      const { error } = await supabase.from('sbfp_data').insert(payload)
      if (error) console.log(center, 'HIRING ERROR', error.message)
      else {
        hireCount += hiring.length
        console.log(center, 'HIRING', hiring.length, hiring.map(h => h.position).join(', '))
      }
    }
  }

  console.log('Done. PPMP rows', ppmpCount, 'hiring rows', hireCount)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
