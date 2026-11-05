import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

export type ProgressProcurementRow = {
  region?: string | null
  sdo?: string | null
  center?: string | null
  procurement_status?: string | null
  milk_type?: string | null
  packs_to_deliver?: number | string | null
  delivery_start?: string | null
  delivery_end?: string | null
  delivery_schedule?: string | null
  created_at?: string | null
  reportStatus?: string
  reportDelivered?: number
  reportSdoKey?: string
}

export type ProgressPpmpRow = {
  center: string
  category: string
  status?: string | null
  item_name?: string | null
  amount?: number | string | null
  sort_order?: number | null
}

export type ProgressHiringRow = {
  center: string
  position?: string | null
  status?: string | null
  sort_order?: number | null
}

export type ProgressFinanceRow = {
  center: string
  allotment?: number | string | null
  obligation?: number | string | null
  disbursement?: number | string | null
}

export type ProgressReportPayload = {
  monthLabel: string
  monthEnd: string
  schoolYear: string
  dbYear: number
  centers?: string[]
  procurements: ProgressProcurementRow[]
  ppmp: ProgressPpmpRow[]
  hiring: ProgressHiringRow[]
  finance: ProgressFinanceRow[]
}

const money = (value: unknown) =>
  (Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const whole = (value: number) => Math.round(value).toLocaleString('en-PH')
const xmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

function replaceCellText(cell: string, value: unknown): string {
  const text = xmlEscape(value).replace(/\n/g, '</w:t><w:br/><w:t>')
  let found = false
  let next = cell.replace(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_match, attrs = '') => {
    if (!found) {
      found = true
      return `<w:t${attrs}>${text}</w:t>`
    }
    return `<w:t${attrs}></w:t>`
  })
  if (!found) {
    next = next.replace(/(<w:p(?:\s[^>]*)?>)/, `$1<w:r><w:t>${text}</w:t></w:r>`)
  }
  return next
}

function replaceRowCells(row: string, values: unknown[]): string {
  let index = 0
  return row.replace(/<w:tc(?=[\s>])[\s\S]*?<\/w:tc>/g, cell =>
    replaceCellText(cell, values[index++] ?? ''),
  )
}

function replaceTable(xml: string, tableIndex: number, bodyRows: unknown[][], totalRow?: unknown[]): string {
  let index = -1
  return xml.replace(/<w:tbl(?=[\s>])[\s\S]*?<\/w:tbl>/g, table => {
    index += 1
    if (index !== tableIndex) return table
    const rows = table.match(/<w:tr(?=[\s>])[\s\S]*?<\/w:tr>/g) || []
    if (rows.length < 2) return table
    const header = rows[0]
    const bodyTemplate = rows[1]
    const totalTemplate = totalRow && rows.length > 2 ? rows[rows.length - 1] : null
    const generated = bodyRows.map(values => replaceRowCells(bodyTemplate, values))
    if (totalRow && totalTemplate) generated.push(replaceRowCells(totalTemplate, totalRow))
    const replacement = [header, ...generated].join('')
    return table.replace(/<w:tr(?=[\s>])[\s\S]*?<\/w:tr>/g, '').replace('</w:tbl>', `${replacement}</w:tbl>`)
  })
}

function replaceParagraphContaining(xml: string, needle: string, replacement: string): string {
  let replaced = false
  return xml.replace(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g, paragraph => {
    if (replaced) return paragraph
    const textParts = Array.from(paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g), match => match[1])
    if (!textParts.join('').includes(needle)) return paragraph
    replaced = true
    let first = true
    return paragraph.replace(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_match, attrs = '') => {
      if (first) {
        first = false
        return `<w:t${attrs}>${xmlEscape(replacement)}</w:t>`
      }
      return `<w:t${attrs}></w:t>`
    })
  })
}

function dateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function displayCenter(center: string): string {
  const value = center.trim()
  if (/^PCC\s+(?:at|NHQ\b)/i.test(value)) return value
  return /^NHQ/i.test(value) ? 'PCC NHQ' : `PCC at ${value.replace(/\s*\(.*\)$/, '')}`
}

function amount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function procurementSchedule(row: ProgressProcurementRow): string {
  if (row.delivery_schedule?.trim()) return row.delivery_schedule.trim()
  const displayDate = (value?: string | null) => {
    const match = value?.trim().match(/^(\d{4})-(\d{2})-\d{2}$/)
    if (!match) return value?.trim() || ''
    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
    return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  }
  const start = displayDate(row.delivery_start)
  const end = displayDate(row.delivery_end)
  if (start && end) return start === end ? start : `${start} to ${end}`
  return start || end || '—'
}

function updateNarrative(xml: string, payload: ProgressReportPayload, summary: {
  sdoCount: number; deliveredSdos: number; ongoingDelivery: number; forDelivery: number
  ongoingProcurement: number; ongoingForAward: number; preparation: number; failed: number; completed: number; deliveredPacks: number; totalPacks: number
  ppmp: Record<string, { amount: number; rows: number }>
  hiringTotal: number; hiringFilled: number; hiringOpen: number
  allotment: number; obligation: number; disbursement: number
}): string {
  const { monthLabel, monthEnd, schoolYear } = payload
  const cutoff = dateLabel(monthEnd)
  const reportYear = monthEnd.slice(0, 4)
  const generated = new Date()
  const generatedIso = `${generated.getFullYear()}-${String(generated.getMonth() + 1).padStart(2, '0')}-${String(generated.getDate()).padStart(2, '0')}`
  const paragraphs: Array<[string, string]> = [
    ['Milk Feeding Program Progress Report as of', `Milk Feeding Program Progress Report as of ${cutoff}`],
    ['The implementation status of the Milk Feeding Component', `This report presents SBFP Milk Feeding Component records for SY ${schoolYear}, with delivery quantities filtered through ${cutoff}. Planned packs, schedules, and procurement statuses are the latest saved values because the system does not keep monthly history for those fields. Completion checks use the selected month-end. PPMP, COS hiring, and financial tables also show latest saved records rather than historical monthly snapshots.`],
    ['A total of ninety-three (93) SDOs are covered', `A total of ${whole(summary.sdoCount)} SDOs are covered by milk procurement and delivery through PCC-NIAS NHQ and its Regional R&D Stations. Through ${cutoff}, ${whole(summary.deliveredSdos)} SDOs have recorded deliveries totaling ${whole(summary.deliveredPacks)} milk packs. Latest saved procurement statuses show ${whole(summary.preparation)} SDOs in preparation, ${whole(summary.ongoingProcurement)} in ongoing procurement, ${whole(summary.ongoingForAward)} ongoing (for award), ${whole(summary.forDelivery)} awarded for delivery, ${whole(summary.ongoingDelivery)} in ongoing delivery, ${whole(summary.failed)} failed, and ${whole(summary.completed)} completed. Total planned packs are ${whole(summary.totalPacks)}.`],
    ['Batch 1 covers August to September 2026', 'Each SDO selected a delivery batch based on its feeding schedule and the DepEd school calendar. The batching scheme aligns procurement, production, and delivery with the scheduled feeding periods and supports timely implementation of the program.'],
    ['Table 1 presents the status of milk procurement including their respective delivery batches', `Table 1 lists the latest saved milk procurement records. Delivered packs are filtered through ${cutoff}; planned quantities, schedules, and procurement statuses are the latest saved values. Completion checks respect the selected month-end.`],
    ['Table 2 presents the status of procurement of office supplies', `Table 2 presents the latest saved office supplies procurement records. The recorded amount is ₱${money(summary.ppmp.office_supplies?.amount)} across ${summary.ppmp.office_supplies?.rows || 0} items. These values are the current records and are not a historical month-end snapshot.`],
    ['Table 3 presents the status of the procurement intended for the conduct of training', `Table 3 presents the latest saved training procurement records. The recorded amount is ₱${money(summary.ppmp.training?.amount)} across ${summary.ppmp.training?.rows || 0} items. These values are the current records and are not a historical month-end snapshot.`],
    ['The status of the procurement of furniture and fixtures', `The latest saved furniture and fixtures procurement records total ₱${money(summary.ppmp.fixtures?.amount)} across ${summary.ppmp.fixtures?.rows || 0} items. These values are the current records and are not a historical month-end snapshot.`],
    ['The table presents the status of hiring of Contract of Service (COS) personnel', `The latest saved COS hiring table contains ${whole(summary.hiringTotal)} positions across participating centers. ${whole(summary.hiringFilled)} positions are marked filled and ${whole(summary.hiringOpen)} are marked for hiring. These records are current and are not a historical month-end snapshot.`],
    ['Of the total positions, thirty (30) have already been filled', `Of the latest saved COS positions, ${whole(summary.hiringFilled)} are marked filled and ${whole(summary.hiringOpen)} are marked for hiring.`],
    ['Financial Accomplishment (As of July 31, 2026)', `Financial Accomplishment (Latest Saved Values; Report Month ${monthLabel} ${reportYear})`],
    ['Table 5. MFP Financial Accomplishment', 'Table 6. MFP Financial Accomplishment'],
    ['Table 5 presents the status of fund utilization', 'Table 6 presents the status of fund utilization'],
    ['A total allotment of ₱1,121,141,000.00 is intended', `The latest saved financial records show total allotment of ₱${money(summary.allotment)}, obligations of ₱${money(summary.obligation)}, and disbursements of ₱${money(summary.disbursement)}. Financial records are current center/year values and are not historical month-end snapshots.`],
    ['As of the reporting period, total obligations amounted to', `The latest saved financial records show obligations of ₱${money(summary.obligation)} and disbursements of ₱${money(summary.disbursement)}. Financial records are current center/year values and are not historical month-end snapshots.`],
  ]
  for (const [needle, replacement] of paragraphs) xml = replaceParagraphContaining(xml, needle, replacement)
  xml = replaceParagraphContaining(xml, '4 November 2026', dateLabel(generatedIso))
  xml = xml.replace(/October 2026/g, `${monthLabel} ${reportYear}`)
  xml = xml.replace(/October 30, 2026/g, cutoff).replace(/October 31, 2026/g, cutoff)
  xml = xml.replace(/FY 2026/g, `FY ${payload.dbYear}`)
  xml = xml.replace(/OP-L03-\d{2}-\d{4}/g, `OP-L03-${monthEnd.slice(5, 7)}-${monthEnd.slice(0, 4)}`)
  return xml
}

export function buildSbfpProgressDocx(templateBytes: Uint8Array, payload: ProgressReportPayload): Uint8Array {
  const files = unzipSync(templateBytes)
  const documentBytes = files['word/document.xml']
  if (!documentBytes) throw new Error('The SBFP report template is missing its Word document content.')
  let xml = strFromU8(documentBytes)

  const visible = payload.procurements.filter(row => row.sdo?.trim() && row.center?.trim())
  const sdoKeyFor = (row: ProgressProcurementRow) => row.reportSdoKey || `${row.center}|${row.sdo}`
  const uniqueSdos = new Set(visible.map(sdoKeyFor))
  const byStatus = new Map<string, number>()
  const sdoStatuses = new Map<string, string>()
  const rows = visible.map(row => {
    const delivered = Math.max(0, Number(row.reportDelivered) || 0)
    const packs = Math.max(0, amount(row.packs_to_deliver))
    const status = row.reportStatus || row.procurement_status || '—'
    const sdoKey = sdoKeyFor(row)
    if (!sdoStatuses.has(sdoKey)) sdoStatuses.set(sdoKey, status)
    const rawMilk = row.milk_type?.trim() || ''
    const milk = ({ PM: 'Pasteurized', SM: 'Sterilized', CM: 'Commercial' } as Record<string, string>)[rawMilk.toUpperCase()] || rawMilk
    const packsLabel = `${whole(packs)}${milk ? ` (${milk})` : ''}`
    return [row.region || '—', row.sdo, status, packsLabel, procurementSchedule(row), whole(delivered), whole(Math.max(0, packs - delivered))]
  })
  sdoStatuses.forEach(status => byStatus.set(status, (byStatus.get(status) || 0) + 1))
  const deliveredPacks = visible.reduce((sum, row) => sum + Math.max(0, Number(row.reportDelivered) || 0), 0)
  const totalPacks = visible.reduce((sum, row) => sum + Math.max(0, amount(row.packs_to_deliver)), 0)
  const totalRow = [
    'TOTAL', `${uniqueSdos.size} SDOs`,
    `For Preparation - ${byStatus.get('For Preparation') || 0}\nOngoing Procurement - ${byStatus.get('Ongoing Procurement') || 0}\nOngoing (For Award) - ${byStatus.get('Ongoing (For Award)') || 0}\nAwarded (For Delivery) - ${byStatus.get('Awarded (For Delivery)') || 0}\nAwarded (Ongoing Delivery) - ${byStatus.get('Awarded (Ongoing Delivery)') || 0}\nCompleted - ${byStatus.get('Completed') || 0}\nFailed - ${byStatus.get('Failed') || 0}`,
    `${whole(totalPacks)} packs to deliver; ${whole(deliveredPacks)} delivered; ${whole(Math.max(0, totalPacks - deliveredPacks))} balance`,
  ]
  xml = replaceTable(xml, 0, rows, totalRow)

  const categories = ['office_supplies', 'training', 'fixtures']
  const centers = Array.from(new Set([
    ...(payload.centers || []),
    ...payload.finance.map(row => row.center),
    ...payload.ppmp.map(row => row.center),
  ])).sort((a, b) => a.localeCompare(b))
  const ppmpSummary: Record<string, { amount: number; rows: number }> = {}
  categories.forEach((category, offset) => {
    const categoryRows = payload.ppmp.filter(row => row.category === category && (row.item_name?.trim() || amount(row.amount) || row.status?.trim()))
    ppmpSummary[category] = {
      amount: categoryRows.reduce((sum, row) => sum + amount(row.amount), 0),
      rows: categoryRows.length,
    }
    const body = centers.map(center => {
      const items = categoryRows.filter(row => row.center === center)
      const sum = items.reduce((total, row) => total + amount(row.amount), 0)
      const statuses = Array.from(new Set(items.map(row => row.status?.trim()).filter(Boolean)))
      return [displayCenter(center), items.length ? money(sum) : '—', statuses.length === 1 ? statuses[0] : statuses.length ? 'Multiple statuses' : '—']
    })
    xml = replaceTable(xml, offset + 1, body)
  })

  const hiringRows = payload.hiring.filter(row => row.position?.trim() || row.status?.trim())
  const hiringTableRows = hiringRows.map(row => [displayCenter(row.center), row.position || '—', '—', row.status || '—'])
  xml = replaceTable(xml, 4, hiringTableRows)

  const financeRows = payload.finance
  const financeTableRows = financeRows.map(row => [
    displayCenter(row.center), money(row.allotment), money(row.obligation), money(row.disbursement),
  ])
  xml = replaceTable(xml, 5, financeTableRows)

  const sdoStatusCounts = Array.from(sdoStatuses.values()).reduce<Record<string, number>>((out, status) => {
    out[status] = (out[status] || 0) + 1
    return out
  }, {})
  const sumFinance = (field: 'allotment' | 'obligation' | 'disbursement') => financeRows.reduce((sum, row) => sum + amount(row[field]), 0)
  const summary = {
    sdoCount: uniqueSdos.size,
    deliveredSdos: new Set(visible.filter(row => Number(row.reportDelivered) > 0).map(sdoKeyFor)).size,
    ongoingDelivery: sdoStatusCounts['Awarded (Ongoing Delivery)'] || 0,
    forDelivery: sdoStatusCounts['Awarded (For Delivery)'] || 0,
    ongoingProcurement: sdoStatusCounts['Ongoing Procurement'] || 0,
    ongoingForAward: sdoStatusCounts['Ongoing (For Award)'] || 0,
    preparation: sdoStatusCounts['For Preparation'] || 0,
    failed: sdoStatusCounts['Failed'] || 0,
    completed: sdoStatusCounts['Completed'] || 0,
    deliveredPacks,
    totalPacks,
    ppmp: ppmpSummary,
    hiringTotal: hiringRows.length,
    hiringFilled: hiringRows.filter(row => /filled/i.test(row.status || '')).length,
    hiringOpen: hiringRows.filter(row => /hiring/i.test(row.status || '')).length,
    allotment: sumFinance('allotment'),
    obligation: sumFinance('obligation'),
    disbursement: sumFinance('disbursement'),
  }
  xml = updateNarrative(xml, payload, summary)
  xml = xml.replace(/No\. of Milk Packs Delivered as of [^<]*/g, `No. of Milk Packs Delivered as of ${xmlEscape(payload.monthLabel)} ${payload.monthEnd.slice(0, 4)}`)
  files['word/document.xml'] = strToU8(xml)
  return zipSync(files, { level: 6 })
}
