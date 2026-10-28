import {
  PROGRAM_DROPOFF_ENCODER_COLUMNS,
  PROGRAM_PROCUREMENT_ENCODER_COLUMNS,
} from '@/lib/encoder-selects'
import type { ProgramDropoffRow, ProgramProcurementRow } from '@/lib/program-dropoff-sync'
import type { SbfpReportSourceRow } from '@/lib/sbfp-report-sync'
import {
  baseSdoName,
  inferSbfpMilkType,
  MILK_SORT,
  normalizeSbfpMilkType,
  normalizeSdoName,
  sdoLotNumber,
  uniqueSdoCountKey,
} from '@/lib/sbfp-dropoff-sync'
import { sbfpCenterAliases } from '@/lib/center-aliases'
import { REPORT_MIN_YEAR } from '@/lib/app-years'

export type ProgramReportId = 'lgu' | 'dswd'

export interface ProgramReportMeta {
  id: ProgramReportId
  shortLabel: string
  masterTabLabel: string
  entitySingular: string
  entityPlural: string
  filteredKpiLabel: string
  searchLabel: string
  searchPlaceholder: string
  printTitle: string
  senatePrintTitle: string
  cdpBannerTitle: string
  majorSubtitle: string
  majorEntityCountLabel: string
}

export const PROGRAM_REPORT_META: Record<ProgramReportId, ProgramReportMeta> = {
  lgu: {
    id: 'lgu',
    shortLabel: 'LGU',
    masterTabLabel: 'LGU Masterlist',
    entitySingular: 'LGU / Province',
    entityPlural: 'LGUs',
    filteredKpiLabel: 'Filtered LGUs',
    searchLabel: 'Search LGU',
    searchPlaceholder: 'Search LGU or PO...',
    printTitle: 'Local Government Unit (LGU) Feeding Program — Milk Procurement Monitoring Report',
    senatePrintTitle: 'LGU Milk Component — PCC Procurement & Delivery Monitoring Figures',
    cdpBannerTitle: 'LOCAL GOVERNMENT UNIT (LGU) MILK FEEDING PROGRAM',
    majorSubtitle: 'Local Government Unit (LGU) Feeding Program – Milk Proponent',
    majorEntityCountLabel: 'No. of LGUs / Provinces',
  },
  dswd: {
    id: 'dswd',
    shortLabel: 'DSWD',
    masterTabLabel: 'DSWD Masterlist',
    entitySingular: 'Province',
    entityPlural: 'Provinces',
    filteredKpiLabel: 'Filtered Provinces',
    searchLabel: 'Search Province',
    searchPlaceholder: 'Search province or PO...',
    printTitle: 'DSWD Supplementary Feeding Program — Milk Procurement Monitoring Report',
    senatePrintTitle: 'DSWD Supplementary Feeding Program — PCC Milk Component Figures',
    cdpBannerTitle:
      'SUPPLEMENTARY FEEDING PROGRAM FUNDED BY THE DEPARTMENT OF SOCIAL WELFARE AND DEVELOPMENT (DSWD)',
    majorSubtitle: 'DSWD Supplementary Feeding Program – Milk Proponent',
    majorEntityCountLabel: 'No. of Provinces',
  },
}

// Philippine regional display order
const REGION_ORDER: Record<string, number> = {
  CAR: 1,
  I: 2,
  II: 3,
  III: 4,
  'IV-A': 5,
  IVA: 5,
  CALABARZON: 5,
  'IV-B': 6,
  IVB: 6,
  MIMAROPA: 6,
  V: 7,
  NCR: 8,
  VI: 9,
  VII: 10,
  NIR: 11,
  VIII: 12,
  IX: 13,
  X: 14,
  XI: 15,
  XII: 16,
  CARAGA: 17,
  BARMM: 18,
}

export function regionSortKey(region: string): number {
  return REGION_ORDER[region?.toUpperCase()] ?? 99
}

export function getIslandCluster(region: string): 'Luzon' | 'Visayas' | 'Mindanao' | 'Unknown' {
  const r = (region || '').toUpperCase().trim()
  if (
    [
      'NCR',
      'NATIONAL CAPITAL REGION',
      'CAR',
      'CORDILLERA ADMINISTRATIVE REGION',
      'I',
      'II',
      'III',
      'IV-A',
      'IVA',
      'CALABARZON',
      'IV-B',
      'IVB',
      'MIMAROPA',
      'V',
    ].includes(r)
  ) {
    return 'Luzon'
  }
  if (['VI', 'VII', 'VIII', 'NIR'].includes(r)) return 'Visayas'
  if (['IX', 'X', 'XI', 'XII', 'XIII', 'CARAGA', 'BARMM'].includes(r)) return 'Mindanao'
  return 'Unknown'
}

type ProgramProcurementWithCoop = ProgramProcurementRow & {
  cooperatives?: { name?: string | null } | Array<{ name?: string | null }> | null
}

function extractCoopName(raw: ProgramProcurementWithCoop['cooperatives']): string | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0]?.name ?? null
  return raw.name ?? null
}

/**
 * Converts `mfp_program_procurement` (+ optional `mfp_program_dropoffs` beneficiaries fallback)
 * into `SbfpReportSourceRow[]` sorted by Region → Area → Milk Type → Lot.
 */
function toDateStr(v: string | Date | null | undefined): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString().slice(0, 10) : v
}

export function normalizeProgramProcurementRows(
  procs: ProgramProcurementWithCoop[],
  dropoffs: ProgramDropoffRow[],
): SbfpReportSourceRow[] {
  const dropoffBeneficiariesByProcId = new Map<string, number>()
  const dropoffRegionByProcId = new Map<string, string>()
  for (const d of dropoffs) {
    if (!d.procurement_id || d.include_in_masterlist === false) continue
    const ben = Number(d.beneficiaries) || 0
    if (ben > 0) {
      dropoffBeneficiariesByProcId.set(
        d.procurement_id,
        (dropoffBeneficiariesByProcId.get(d.procurement_id) || 0) + ben,
      )
    }
    const reg = String(d.region || '').trim()
    if (reg && reg !== '—' && !dropoffRegionByProcId.has(d.procurement_id)) {
      dropoffRegionByProcId.set(d.procurement_id, reg)
    }
  }

  const rows: SbfpReportSourceRow[] = procs.map(r => {
    const areaName = String(r.label || r.province || '').trim()
    const directBen = Number(r.beneficiaries) || 0
    const fallbackBen = dropoffBeneficiariesByProcId.get(r.id) || 0
    const region = String(r.region || '').trim() || dropoffRegionByProcId.get(r.id) || ''
    const coopName = extractCoopName(r.cooperatives)
    return {
      id: r.id,
      year: r.year,
      center: r.center,
      region,
      sdo: areaName,
      procurement_status: r.procurement_status ?? 'For Preparation',
      include_in_report: r.include_in_report !== false,
      amount: r.amount ?? null,
      milk_type: r.milk_type ?? 'PM',
      pack_unit_price: r.pack_unit_price ?? null,
      mode_of_procurement: r.mode_of_procurement ?? null,
      pr_date_received: toDateStr(r.pr_date_received),
      pr_number: r.pr_number ?? null,
      ors_date: toDateStr(r.ors_date),
      po_number: r.po_number ?? null,
      batch: r.batch ?? null,
      beneficiaries_pm: directBen > 0 ? directBen : fallbackBen,
      beneficiaries_sm: 0,
      beneficiaries_cm: 0,
      contract_amount: r.contract_amount ?? null,
      delivery_start: toDateStr(r.delivery_start),
      delivery_end: toDateStr(r.delivery_end),
      packs_to_deliver: r.packs_to_deliver ?? null,
      packs_delivered: r.packs_delivered ?? null,
      status_of_payment: r.status_of_payment ?? null,
      remarks: r.remarks ?? null,
      supplier_id: r.supplier_id ?? null,
      delivery_snapshots: r.delivery_snapshots as SbfpReportSourceRow['delivery_snapshots'],
      monthly_packs_delivered:
        r.monthly_packs_delivered as SbfpReportSourceRow['monthly_packs_delivered'],
      raw_milk_prices: r.raw_milk_prices as SbfpReportSourceRow['raw_milk_prices'],
      payment_entries: r.payment_entries ?? null,
      cooperatives: coopName ? { name: coopName } : null,
    }
  })

  // Fill in missing region from sibling rows with the same base area name in the same center
  const areaRegionMap = new Map<string, string>()
  for (const r of rows) {
    const base = baseSdoName(r.sdo || '')
    const reg = String(r.region || '').trim()
    if (base && reg && reg !== '—') {
      const mapKey = `${String(r.center || '').toLowerCase()}|${normalizeSdoName(base)}`
      if (!areaRegionMap.has(mapKey)) areaRegionMap.set(mapKey, reg)
    }
  }
  const withInferredRegion = rows.map(r => {
    if (r.region && r.region !== '—') return r
    const mapKey = `${String(r.center || '').toLowerCase()}|${normalizeSdoName(r.sdo || '')}`
    const inferredReg = areaRegionMap.get(mapKey)
    return inferredReg ? { ...r, region: inferredReg } : r
  })

  return withInferredRegion.sort((a, b) => {
    const rA = regionSortKey(a.region || '')
    const rB = regionSortKey(b.region || '')
    if (rA !== rB) return rA - rB
    const kA = uniqueSdoCountKey(a.sdo, a.center)
    const kB = uniqueSdoCountKey(b.sdo, b.center)
    if (kA !== kB) return kA.localeCompare(kB)
    const mA =
      MILK_SORT[normalizeSbfpMilkType(a.milk_type) || inferSbfpMilkType(a.sdo) || ''] || 9
    const mB =
      MILK_SORT[normalizeSbfpMilkType(b.milk_type) || inferSbfpMilkType(b.sdo) || ''] || 9
    if (mA !== mB) return mA - mB
    const lA = sdoLotNumber(a.sdo || '')
    const lB = sdoLotNumber(b.sdo || '')
    if (lA !== lB) return lA - lB
    return (a.sdo || '').localeCompare(b.sdo || '')
  })
}

export async function fetchProgramReportRowsForYear(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  programId: ProgramReportId,
  dbYear: number,
  lockedCenter: string | null,
): Promise<SbfpReportSourceRow[]> {
  let procQuery = supabase
    .from('mfp_program_procurement')
    .select(`${PROGRAM_PROCUREMENT_ENCODER_COLUMNS}, cooperatives:supplier_id(name)`)
    .eq('program', programId)
    .eq('year', dbYear)

  let dropQuery = supabase
    .from('mfp_program_dropoffs')
    .select(PROGRAM_DROPOFF_ENCODER_COLUMNS)
    .eq('program', programId)
    .eq('year', dbYear)

  if (lockedCenter) {
    const aliases = sbfpCenterAliases(lockedCenter)
    if (aliases.length === 1) {
      procQuery = procQuery.eq('center', aliases[0])
      dropQuery = dropQuery.eq('center', aliases[0])
    } else if (aliases.length > 1) {
      procQuery = procQuery.in('center', aliases)
      dropQuery = dropQuery.in('center', aliases)
    }
  }

  const [{ data: procs, error: procErr }, { data: drops }] = await Promise.all([
    procQuery,
    dropQuery,
  ])
  if (procErr) {
    console.error(`Error fetching ${programId.toUpperCase()} report data:`, procErr)
    return []
  }
  return normalizeProgramProcurementRows(
    (procs || []) as unknown as ProgramProcurementWithCoop[],
    (drops || []) as unknown as ProgramDropoffRow[],
  )
}

export async function fetchProgramReportRowsForYears(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  programId: ProgramReportId,
  years: number[],
  lockedCenter: string | null,
): Promise<SbfpReportSourceRow[]> {
  const validYears = years.filter(y => Number.isFinite(y) && y >= REPORT_MIN_YEAR)
  if (validYears.length === 0) return []

  let procQuery = supabase
    .from('mfp_program_procurement')
    .select(`${PROGRAM_PROCUREMENT_ENCODER_COLUMNS}, cooperatives:supplier_id(name)`)
    .eq('program', programId)
    .in('year', validYears)

  let dropQuery = supabase
    .from('mfp_program_dropoffs')
    .select(PROGRAM_DROPOFF_ENCODER_COLUMNS)
    .eq('program', programId)
    .in('year', validYears)

  if (lockedCenter) {
    const aliases = sbfpCenterAliases(lockedCenter)
    if (aliases.length === 1) {
      procQuery = procQuery.eq('center', aliases[0])
      dropQuery = dropQuery.eq('center', aliases[0])
    } else if (aliases.length > 1) {
      procQuery = procQuery.in('center', aliases)
      dropQuery = dropQuery.in('center', aliases)
    }
  }

  const [{ data: procs, error: procErr }, { data: drops }] = await Promise.all([
    procQuery,
    dropQuery,
  ])
  if (procErr) {
    console.error(`Error fetching ${programId.toUpperCase()} multi-year data:`, procErr)
    return []
  }
  return normalizeProgramProcurementRows(
    (procs || []) as unknown as ProgramProcurementWithCoop[],
    (drops || []) as unknown as ProgramDropoffRow[],
  )
}

export type ColType = 'text' | 'num' | 'cur' | 'pct' | 'dec'

export interface TabExportData {
  sheetName: string
  filename: string
  headers: string[]
  rows: Array<Array<string | number>>
  colTypes: ColType[]
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>,
) {
  const csvRows = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map(row =>
      row
        .map(val => {
          if (val === null || val === undefined) return '""'
          return `"${String(val).replace(/"/g, '""')}"`
        })
        .join(','),
    ),
  ]
  const csvContent =
    'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvRows.join('\r\n'))
  const downloadAnchor = document.createElement('a')
  downloadAnchor.setAttribute('href', csvContent)
  downloadAnchor.setAttribute('download', filename)
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  document.body.removeChild(downloadAnchor)
}

type StyledCell = {
  v?: string | number
  t?: string
  z?: string
  s?: Record<string, unknown>
}

type StyledWorksheet = Record<string, unknown> & {
  '!ref'?: string
  '!cols'?: Array<{ wch: number }>
  '!rows'?: Array<{ hpt: number }>
  '!freeze'?: { xSplit: number; ySplit: number }
  '!views'?: Array<{ state: string; ySplit: number; showGridLines: boolean }>
}

type XlsxModule = {
  utils: {
    aoa_to_sheet: (data: Array<Array<string | number>>) => StyledWorksheet
    decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } }
    encode_cell: (pos: { r: number; c: number }) => string
    book_new: () => unknown
    book_append_sheet: (wb: unknown, ws: StyledWorksheet, name: string) => void
  }
  writeFile: (wb: unknown, filename: string) => void
}

async function loadXlsx(): Promise<XlsxModule> {
  const mod = (await import('xlsx-js-style')) as unknown as { default?: XlsxModule } & XlsxModule
  return mod.default || mod
}

function buildStyledSheet(
  XLSX: XlsxModule,
  hdrs: string[],
  dataRows: Array<Array<string | number>>,
  colTypes: ColType[],
): StyledWorksheet {
  const ws = XLSX.utils.aoa_to_sheet([hdrs, ...dataRows])
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const lastR = range.e.r
  const hasTotal =
    dataRows.length > 0 &&
    String(dataRows[dataRows.length - 1][0] ?? '')
      .toUpperCase()
      .startsWith('TOTAL')

  const getColAlign = (C: number): 'left' | 'center' | 'right' => {
    const ct = colTypes[C] || 'text'
    if (ct === 'num' || ct === 'cur' || ct === 'pct' || ct === 'dec') return 'right'
    const hdr = (hdrs[C] || '').trim().toLowerCase()
    if (
      hdr === '#' ||
      hdr === 'no.' ||
      hdr === 'region' ||
      hdr === 'center' ||
      hdr === 'batch' ||
      hdr === 'milk type' ||
      hdr === 'status' ||
      hdr === 'procurement status' ||
      hdr === 'payment status' ||
      hdr.includes('date')
    ) {
      return 'center'
    }
    return 'left'
  }

  const XL_FMT: Record<ColType, string | undefined> = {
    text: undefined,
    num: '#,##0',
    cur: '\u20B1#,##0',
    pct: '0.0"%"',
    dec: '#,##0.0',
  }

  const rowHeights: Array<{ hpt: number }> = []

  for (let R = range.s.r; R <= range.e.r; R++) {
    const isHeader = R === 0
    const isTotal = hasTotal && R === lastR
    const isEvenData = !isHeader && !isTotal && (R - 1) % 2 === 0

    if (isHeader) rowHeights.push({ hpt: 28 })
    else if (isTotal) rowHeights.push({ hpt: 25 })
    else rowHeights.push({ hpt: 20 })

    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      if (!ws[addr]) ws[addr] = { v: '', t: 's' }
      const cell = ws[addr] as StyledCell
      const ct = colTypes[C] || 'text'
      const hdr = (hdrs[C] || '').toLowerCase()

      if (isHeader) {
        cell.s = {
          font: { bold: true, color: { rgb: '1E293B' }, sz: 10.5, name: 'Calibri' },
          fill: { patternType: 'solid', fgColor: { rgb: 'E2E8F0' } },
          border: {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'medium', color: { rgb: '94A3B8' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
          alignment: {
            horizontal: getColAlign(C),
            vertical: 'center',
            wrapText: true,
          },
        }
      } else if (isTotal) {
        const totalAlign = C === 0 ? 'center' : getColAlign(C)
        let totalFontColor = '1E3A8A'
        if (hdr.includes('delivered pack') || hdr.includes('delivered volume')) {
          totalFontColor = '047857'
        } else if (hdr.includes('packs to deliver') || hdr.includes('contracted volume')) {
          totalFontColor = '1E40AF'
        } else if (hdr === 'coops') {
          totalFontColor = '0F766E'
        }
        cell.s = {
          font: { bold: true, color: { rgb: totalFontColor }, sz: 10.5, name: 'Calibri' },
          fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
          border: {
            top: { style: 'medium', color: { rgb: '3B82F6' } },
            bottom: { style: 'double', color: { rgb: '1E3A8A' } },
            left: { style: 'thin', color: { rgb: '93C5FD' } },
            right: { style: 'thin', color: { rgb: '93C5FD' } },
          },
          alignment: { horizontal: totalAlign, vertical: 'center' },
        }
        if (XL_FMT[ct] && typeof cell.v === 'number') cell.z = XL_FMT[ct]
      } else {
        const align = getColAlign(C)
        let cellFontColor = '1E293B'
        let isBold = C === 0 && (ct === 'text' || ct === 'num')
        const numVal = typeof cell.v === 'number' ? cell.v : Number(cell.v)
        if (!Number.isNaN(numVal) && numVal > 0) {
          if (
            hdr.includes('delivered pack') ||
            hdr.includes('delivered volume') ||
            hdr.includes('volume delivered')
          ) {
            cellFontColor = '047857'
            isBold = true
          } else if (hdr.includes('packs to deliver') || hdr.includes('contracted volume')) {
            cellFontColor = '1E40AF'
            isBold = true
          } else if (hdr === 'coops') {
            cellFontColor = '0F766E'
            isBold = true
          } else if (hdr === 'done' || hdr === 'completed') {
            cellFontColor = '047857'
            isBold = true
          } else if (hdr === 'failed') {
            cellFontColor = 'B91C1C'
            isBold = true
          }
        }
        cell.s = {
          font: { sz: 10, name: 'Calibri', bold: isBold, color: { rgb: cellFontColor } },
          fill: { patternType: 'solid', fgColor: { rgb: isEvenData ? 'FFFFFF' : 'F8FAFC' } },
          border: {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
          alignment: { horizontal: align, vertical: 'center' },
        }
        if (XL_FMT[ct] && typeof cell.v === 'number') cell.z = XL_FMT[ct]
      }
    }
  }

  const colWidths: number[] = []
  for (let C = range.s.c; C <= range.e.c; C++) {
    const ct = colTypes[C] || 'text'
    let minW = 10
    if (ct === 'cur') minW = 15
    else if (ct === 'num') minW = 11
    else if (ct === 'pct') minW = 11
    else if (ct === 'dec') minW = 14
    let max = (hdrs[C] || '').length
    for (let R = range.s.r; R <= range.e.r; R++) {
      const c2 = ws[XLSX.utils.encode_cell({ r: R, c: C })] as StyledCell | undefined
      if (c2 && c2.v != null) {
        const len = String(c2.v).length
        if (len > max) max = len
      }
    }
    colWidths.push(Math.max(minW, Math.min(max + 3, 45)))
  }

  ws['!cols'] = colWidths.map(w => ({ wch: w }))
  ws['!rows'] = rowHeights
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  ws['!views'] = [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  return ws
}

export async function exportSingleTabWorkbook(data: TabExportData): Promise<void> {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  const ws = buildStyledSheet(XLSX, data.headers, data.rows, data.colTypes)
  XLSX.utils.book_append_sheet(wb, ws, data.sheetName)
  XLSX.writeFile(wb, data.filename)
}

export async function exportMultiTabWorkbook(
  filename: string,
  tabs: TabExportData[],
): Promise<void> {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  for (const data of tabs) {
    const ws = buildStyledSheet(XLSX, data.headers, data.rows, data.colTypes)
    XLSX.utils.book_append_sheet(wb, ws, data.sheetName)
  }
  XLSX.writeFile(wb, filename)
}
