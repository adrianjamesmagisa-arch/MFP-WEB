'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PCC_CENTERS } from '@/lib/types'
import { parseSnapshotDate, sumGrossIncomeRawMilk } from '@/lib/sbfp-raw-milk'
import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import { normalizeSdoName } from '@/lib/sbfp-dropoff-sync'
import { calcMilkFormulations, litersPerPackForMilkType, packagingSizeForMilkType, normalizeMilkTypeCode } from '@/lib/mfp-formulas'
import { APP_YEAR_STRINGS } from '@/lib/app-years'
import { mfpCenterAliases, sbfpCenterAliases, centerDisplayLabel } from '@/lib/center-aliases'
import { Download, Filter, Printer, ZoomIn, ZoomOut, Maximize2, AlignCenter } from 'lucide-react'

const NAVY      = '#002C65'
const HDR_NAVY  = '#12476A'
const HDR_LOGO  = '#13547E'
const CHART_BG  = '#F3FBFE'
const WHITE     = '#FFFFFF'
const BGD_GRAD  = 'linear-gradient(to bottom, #d6eaf8 0%, #ffffff 40%, #ffffff 70%, #d5e5ec 100%)'

const ARTBOARD_WIDTH  = 1414
const ARTBOARD_HEIGHT = 2000
const ZOOM_STEP = 0.05
const MIN_ZOOM  = 0.20
const MAX_ZOOM  = 1.50

type ZoomMode = 'fit-page' | 'fit-width' | 'custom'

const YEARS  = APP_YEAR_STRINGS
const MONTHS = [
  ['1','January'],['2','February'],['3','March'],['4','April'],
  ['5','May'],['6','June'],['7','July'],['8','August'],
  ['9','September'],['10','October'],['11','November'],['12','December'],
]

const formatCount = (value: unknown): string => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return Math.round(number).toLocaleString('en-US')
}
function cur(v: number) { return '\u20b1' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function curOrBlank(v: number | null | undefined) {
  if (v == null) return '—'
  return cur(v)
}

const MILK_LABEL: Record<string, string> = {
  PM: 'Pasteurized Milk', SM: 'Sterilized Milk', SMP: 'Skim Milk Powder', Karabao: 'Karabao Milk',
}

interface Stats {
  grossIncome: number | null; grossRevenue: number; dswdCenters: number
  totalBene: number; beneByFunder: Record<string, number>
  totalPacks: number; packsByFunder: Record<string, number>
  volumeByType: Record<string, number>; packsBySize: Record<string, number>
  coopCount: number; districtCount: number; divisionCount: number
  provinceCount: number; schoolCount: number
  accomplishment: number
}

function FittedText({ text, maxWidth, maxSize = 62, minSize = 44, weight = 900, color = WHITE, className = '' }: {
  text: string; maxWidth: number; maxSize?: number; minSize?: number; weight?: number; color?: string; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    let size = maxSize
    el.style.fontSize = `${size}px`
    while (el.scrollWidth > el.clientWidth && size > minSize) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
  }, [text, maxWidth, maxSize, minSize])
  return (
    // overflow:visible is critical — html2canvas clips glyphs (₱, tall numerals, descenders)
    // that extend outside an overflow:hidden box even though the screen looks fine.
    // The fitting loop uses scrollWidth vs clientWidth (horizontal) so visible doesn't break it.
    <div ref={ref} className={className} style={{ width: maxWidth, fontWeight: weight, color, whiteSpace: 'nowrap', lineHeight: 1.05, letterSpacing: '-1px', textAlign: 'center', overflow: 'visible', margin: '0 auto', paddingBottom: '3px' }}>
      {text}
    </div>
  )
}

function BarChart({ data }: { data: Record<string, number> }) {
  // Always show core milk types so Sterilized Milk is never dropped when filtered “All”
  const preferred = ['PM', 'SM', 'SMP', 'Karabao'] as const
  const entries: [string, number][] = preferred.map(k => [k, Number(data[k]) || 0])
  for (const [k, v] of Object.entries(data)) {
    if (!preferred.includes(k as typeof preferred[number]) && (Number(v) || 0) > 0) {
      entries.push([k, Number(v) || 0])
    }
  }
  const maxVal = Math.max(...entries.map(([, v]) => v), 1)
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal || 1)))
  const yMax = Math.ceil((maxVal || 1) / mag) * mag
  const steps = 4
  const vW = 622, vH = 342, PL = 70, PB = 48, PT = 60, PR = 20
  const cW = vW - PL - PR, cH = vH - PT - PB
  const bGap = cW / entries.length
  const bW = bGap * 0.55
  const fmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
      <text x={vW / 2} y={35} textAnchor="middle" fontSize={24} fontWeight="900" fill={HDR_NAVY}>MILK UTILIZED</text>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const val = (yMax / steps) * i
        const y = PT + cH - (val / yMax) * cH
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={vW - PR} y2={y} stroke="#d1d5db" strokeWidth={1} />
            <text x={PL - 10} y={y + 5} textAnchor="end" fontSize={12} fill="#4b5563">{fmt.format(val)}</text>
          </g>
        )
      })}
      {entries.map(([type, val], i) => {
        // Keep a visible stub for small types so SM isn’t lost next to huge PM totals
        const bH = val > 0 ? Math.max((val / yMax) * cH, 8) : 2
        const x = PL + i * bGap + (bGap - bW) / 2
        const y = PT + cH - bH
        const label = MILK_LABEL[type] ?? type
        return (
          <g key={type}>
            <rect x={x} y={y} width={bW} height={bH} fill={NAVY} opacity={val > 0 ? 1 : 0.25} />
            <text x={x + bW / 2} y={y - 8} textAnchor="middle" fontSize={10} fontWeight="bold" fill={NAVY}>{formatCount(val)}</text>
            <text x={x + bW / 2} y={PT + cH + 18} textAnchor="middle" fontSize={11} fill="#374151" fontWeight="600">{label}</text>
          </g>
        )
      })}
    </svg>
  )
}

function HBar({ data }: { data: Record<string, number> }) {
  const categories = ['180 ML CAN/POUCH', '200 POUCH', '500 ML', '1 LITER BOTTLE']
  const entries = categories.map(cat => [cat, data[cat] || 0] as const)
  const maxVal = Math.max(...entries.map(([, v]) => v), 1)
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal || 1)))
  const yMax = Math.ceil((maxVal || 1) / mag) * mag
  const vW = 644, vH = 355, rowH = 50, labelW = 160, numW = 60, PR = 30, PT = 60
  const barAreaW = vW - labelW - numW - PR
  const fmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
      <text x={vW / 2} y={35} textAnchor="middle" fontSize={24} fontWeight="900" fill={WHITE}>PACKAGING AND SIZE</text>
      {entries.map(([type, val], i) => {
        const bW = (val / yMax) * barAreaW
        const y = PT + i * rowH + 5
        const label = (MILK_LABEL[type] ?? type).toUpperCase()
        return (
          <g key={type}>
            <text x={labelW - 15} y={y + 20} textAnchor="end" fontSize={13} fill={WHITE} fontWeight="600">{label}</text>
            <rect x={labelW} y={y} width={Math.max(bW, 2)} height={30} fill={WHITE} />
            <text x={labelW + Math.max(bW, 2) + 10} y={y + 20} fontSize={13} fill={WHITE} fontWeight="600">{formatCount(val)}</text>
          </g>
        )
      })}
      <line x1={labelW} y1={PT + entries.length * rowH + 10} x2={vW - PR} y2={PT + entries.length * rowH + 10} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
      {Array.from({ length: 7 }, (_, i) => {
        const v = (yMax / 6) * i
        const x = labelW + (v / yMax) * barAreaW
        return (
          <g key={i}>
            <line x1={x} y1={PT + entries.length * rowH + 10} x2={x} y2={PT + entries.length * rowH + 15} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
            <text x={x + 15} y={PT + entries.length * rowH + 25} fontSize={11} fill="rgba(255,255,255,0.9)" transform={`rotate(-45 ${x + 15} ${PT + entries.length * rowH + 25})`} textAnchor="end" fontWeight="500">{fmt.format(v)}</text>
          </g>
        )
      })}
    </svg>
  )
}

const ALL_CENTERS_VALUE = '__ALL_CENTERS__'

const FUNDER_OPTIONS: [string, string][] = [
  ['', 'All Funders'],
  ['DepEd', 'DepEd'],
  ['DSWD', 'DSWD'],
  ['LDS', 'LDS'],
  ['LGU', 'LGU'],
]

/** Match DB funded_by values to the filter (DepEd vs DEPED, etc.). */
function matchesFunderFilter(dbValue: unknown, funder: string): boolean {
  if (!funder) return true
  const n = String(dbValue || '').trim().toLowerCase().replace(/\s+/g, '')
  const f = funder.toLowerCase().replace(/\s+/g, '')
  if (f === 'deped') return n === 'deped' || n === 'depéd'
  if (f === 'lgu') return n === 'lgu' || n === 'lgus'
  return n === f
}

/** SBFP KPIs are DepEd school feeding — include only for All / DepEd funder filter. */
function includeSbfpForFunder(funder: string): boolean {
  return !funder || funder === 'DepEd'
}

/** Blank until Year is chosen — avoids loading the full “All Centers / All Years” dump on open. */
function hasActivePimdFilters(_center: string, year: string, _month: string) {
  return Boolean(year)
}

export default function PIMDReportPage() {
  const supabase = createClient()
  const [center, setCenter] = useState(ALL_CENTERS_VALUE)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [funder, setFunder] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [isEncoder, setIsEncoder] = useState(false)
  const [showReference, setShowReference] = useState(false)

  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-page')
  const [customScale, setCustomScale] = useState(1)
  const [displayScale, setDisplayScale] = useState(0.5)
  const [isCapturing, setIsCapturing] = useState(false)
  // Preview modal state
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)

  const viewerRef = useRef<HTMLDivElement>(null)

  const getFilename = useCallback(() => {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '-')
    const cLabel = center === ALL_CENTERS_VALUE ? 'All-Centers' : sanitize(center || 'All-Centers')
    const yLabel = year || 'All-Years'
    const mLabel = month ? (MONTHS.find(([v]) => v === month)?.[1] ?? month) : 'All-Months'
    const fLabel = funder || 'All-Funders'
    return `Milk_Feeding_Program_Factsheet_${cLabel}_${fLabel}_${yLabel}_${sanitize(mLabel)}.pdf`
  }, [center, year, month, funder])

  const recalcScale = useCallback(() => {
    if (!viewerRef.current) return
    const rect = viewerRef.current.getBoundingClientRect()
    const aw = rect.width
    const ah = window.innerHeight - rect.top - 16
    if (zoomMode === 'fit-page') {
      const s = Math.min((aw - 32) / ARTBOARD_WIDTH, (ah - 32) / ARTBOARD_HEIGHT, 1)
      setDisplayScale(Math.max(s, MIN_ZOOM))
    } else if (zoomMode === 'fit-width') {
      const s = Math.min((aw - 32) / ARTBOARD_WIDTH, 1)
      setDisplayScale(Math.max(s, MIN_ZOOM))
    } else {
      setDisplayScale(customScale)
    }
  }, [zoomMode, customScale])

  useEffect(() => {
    const ro = new ResizeObserver(() => recalcScale())
    if (viewerRef.current) ro.observe(viewerRef.current)
    window.addEventListener('resize', recalcScale)
    recalcScale()
    return () => { ro.disconnect(); window.removeEventListener('resize', recalcScale) }
  }, [recalcScale])

  useEffect(() => { if (!loading) setTimeout(recalcScale, 100) }, [loading, recalcScale])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('compare') === '1') setShowReference(true)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('role,center').eq('id', user.id).single().then(({ data }) => {
        if (!data) return
        if (data.role === 'encoder') {
          setIsEncoder(true)
          const cc = data.center === 'NHQGP (NIZ)' ? 'NIZ' : (data.center || ALL_CENTERS_VALUE)
          setCenter(cc)
        }
      })
    })
  }, [])

  useEffect(() => {
    if (!hasActivePimdFilters(center, year, month)) {
      setStats(null)
      setLoading(false)
      return
    }
    fetchData()
  }, [center, year, month, funder])

  async function fetchData() {
    setLoading(true)
    setStats(null)
    
    // Fetch ALL rows in paginated batches.
    // Supabase API max rows per request is typically 1000 — using a larger PAGE_SIZE
    // previously stopped after the first batch (1000 < 10000) and dropped SM/Karabao rows.
    const PAGE_SIZE = 1000
    const selectCols = 'beneficiaries,milk_packs,milk_cost,total_funds_transferred,funded_by,center,province,division,municipality,elementary_school,milk_type,total_volume_requirements,supplier_id,date_started,date_completed,target_milk_packs_to_deliver,total_milk_packs_delivered,raw_milk_liters,price,feeding_days'
    let allRows: any[] = []
    let offset = 0
    let hasMore = true
    while (hasMore) {
      let q = supabase.from('mfp_data').select(selectCols).range(offset, offset + PAGE_SIZE - 1)
      if (center && center !== ALL_CENTERS_VALUE) {
        const aliases = mfpCenterAliases(center)
        q = aliases.length === 1 ? q.eq('center', aliases[0]) : q.in('center', aliases)
      }
      if (year) q = q.eq('year', parseInt(year))
      // Prefer exact DB spellings; DepEd is stored as "DepEd"
      if (funder === 'DepEd') q = q.eq('funded_by', 'DepEd')
      else if (funder === 'DSWD') q = q.eq('funded_by', 'DSWD')
      else if (funder === 'LDS') q = q.eq('funded_by', 'LDS')
      else if (funder === 'LGU') q = q.eq('funded_by', 'LGU')
      const { data: batch } = await q
      if (batch && batch.length > 0) {
        allRows = allRows.concat(batch)
        offset += batch.length
        if (batch.length < PAGE_SIZE) hasMore = false
      } else {
        hasMore = false
      }
    }
    let rows = allRows
    // Safety net if DB casing differs
    if (funder) {
      rows = rows.filter(r => matchesFunderFilter(r.funded_by, funder))
    }
    if (month && rows.length) {
      const m = parseInt(month)
      rows = rows.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
    }

    // Shared SBFP month helpers (delivery start/end/snapshots)
    const monthMatches = (value: unknown, m: number, y?: number) => {
      if (value == null || value === '') return false
      const d = value instanceof Date ? value : new Date(String(value))
      if (!Number.isNaN(d.getTime())) {
        if (d.getMonth() + 1 !== m) return false
        if (y && d.getFullYear() !== y) return false
        return true
      }
      const s = String(value)
      const parsed = Date.parse(s.replace(/(\d+)(st|nd|rd|th)/i, '$1'))
      if (!Number.isNaN(parsed)) {
        const pd = new Date(parsed)
        if (pd.getMonth() + 1 !== m) return false
        if (y && pd.getFullYear() !== y) return false
        return true
      }
      const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      const lower = s.toLowerCase()
      const mi = monthNames.findIndex(n => lower.includes(n))
      if (mi < 0 || mi + 1 !== m) return false
      if (y) {
        const yr = s.match(/20\d{2}/)
        if (yr && parseInt(yr[0], 10) !== y) return false
      }
      return true
    }
    const rowActiveInMonth = (r: any, m: number, y?: number) => {
      if (monthMatches(r.delivery_start, m, y) || monthMatches(r.delivery_end, m, y)) return true
      const startD = parseSnapshotDate(r.delivery_start)
      const endD = parseSnapshotDate(r.delivery_end)
      if (startD && endD) {
        const year = y ?? startD.getFullYear()
        const cursor = new Date(year, m - 1, 15).getTime()
        const spanStart = new Date(startD.getFullYear(), startD.getMonth(), 1).getTime()
        const spanEnd = new Date(endD.getFullYear(), endD.getMonth() + 1, 0).getTime()
        if (cursor >= spanStart && cursor <= spanEnd) return true
      }
      const snaps = Array.isArray(r.delivery_snapshots) ? r.delivery_snapshots : []
      if (snaps.some((snap: any) =>
        (Number(snap?.packs) || 0) > 0 && monthMatches(snap?.date, m, y)
      )) return true
      const monthly = r.monthly_packs_delivered
      if (monthly && typeof monthly === 'object' && !Array.isArray(monthly)) {
        const packs = Number((monthly as Record<string, unknown>)[String(m)]) || 0
        if (packs > 0) return true
      }
      return false
    }

    let sbfpScoped: any[] = []
    let sbfpAll: any[] = []  // all SDOs, NOT filtered by month — used for accomplishment %
    let completedSdoKeys = new Set<string>()
    if (includeSbfpForFunder(funder)) {
      let sq = supabase
        .from('sbfp_data')
        .select('sdo,procurement_status,contract_amount,amount,packs_to_deliver,packs_delivered,delivery_start,delivery_end,delivery_snapshots,milk_type,remarks,monthly_packs_delivered,raw_milk_prices,raw_milk_month,include_in_report')
      if (center && center !== ALL_CENTERS_VALUE) {
        const aliases = sbfpCenterAliases(center)
        sq = aliases.length === 1 ? sq.eq('center', aliases[0]) : sq.in('center', aliases)
      }
      if (year) sq = sq.eq('year', parseInt(year))
      const { data: sbfpRows } = await sq
      if (sbfpRows && sbfpRows.length > 0) {
        sbfpAll = excludeAuxSbfp(sbfpRows)   // save full list before month filter
        sbfpScoped = sbfpAll
        if (month) {
          const m = parseInt(month)
          const yNum = year ? parseInt(year) : undefined
          sbfpScoped = sbfpScoped.filter(r => rowActiveInMonth(r, m, yNum))
        }
        for (const r of sbfpScoped) {
          const st = String(r.procurement_status || '').toUpperCase()
          if (st === 'COMPLETED' || st === 'DONE') {
            const key = normalizeSdoName(r.sdo || '')
            if (key) completedSdoKeys.add(key)
          }
        }
      }
    }

    // GROSS REVENUE OF THE MILK FEEDING PROGRAM (client formula):
    //   = total of SBFP Contract Amount (Excel column L)
    const grossRevenue = sbfpScoped.reduce((s, r) => {
      const contract = Number(r.contract_amount) || 0
      const amount = Number(r.amount) || 0
      return s + (contract > 0 ? contract : amount)
    }, 0)

    // GROSS INCOME FROM THE RAW MILK:
    //   Each month: only packs completed that month × that month’s Raw ₱/L
    //   Raw Milk used (L) = (packs / 5) × 0.2
    //   Month filter = that month only; otherwise sum of all months on the row
    const monthNum = month ? parseInt(month, 10) : null
    const yNum = year ? parseInt(year, 10) : undefined
    const grossIncome = sumGrossIncomeRawMilk(sbfpScoped, monthNum, { year: yNum })

    // Quantity cards/charts: for DepEd/SBFP use FULL values of Completed SDOs only
    // (those SDOs ARE the accomplishment %). Do not multiply again by the %.
    const useCompletedOnly = includeSbfpForFunder(funder) && completedSdoKeys.size > 0
    const qtyRows = useCompletedOnly
      ? rows.filter(r => completedSdoKeys.has(normalizeSdoName(r.division || '')))
      : rows

    const rowPacks = (r: any) => {
      const direct = Number(r.milk_packs) || 0
      if (direct > 0) return direct
      const calc = calcMilkFormulations(
        Number(r.beneficiaries) || 0,
        Number(r.feeding_days) || 0,
        r.milk_type || 'PM',
      )
      return calc?.milkPacks || 0
    }

    const totalBene = qtyRows.reduce((s, r) => s + (r.beneficiaries || 0), 0)
    const totalPacks = qtyRows.reduce((s, r) => s + rowPacks(r), 0)
    const beneByFunder: Record<string, number> = {}
    const packsByFunder: Record<string, number> = {}
    const volumeByType: Record<string, number> = {}
    const packsBySize: Record<string, number> = {}
    qtyRows.forEach(r => {
      const rawF = r.funded_by || ''
      const f = rawF === 'DepEd' ? 'DEPED' : rawF === 'LDS' ? 'LDS' : rawF === 'DSWD' ? 'DSWD' : rawF ? rawF.toUpperCase() : 'OTHERS'
      const packs = rowPacks(r)
      beneByFunder[f] = (beneByFunder[f] || 0) + (r.beneficiaries || 0)
      packsByFunder[f] = (packsByFunder[f] || 0) + packs
      const t = normalizeMilkTypeCode(r.milk_type || 'PM')
      const litersPerPack = litersPerPackForMilkType(t)
      // Prefer stored volume when it matches milk-type factor; else recompute packs × L/pack
      const storedVol = Number(r.total_volume_requirements) || 0
      const expectedVol = packs > 0 ? packs * litersPerPack : 0
      const vol = expectedVol > 0 ? expectedVol : storedVol
      volumeByType[t] = (volumeByType[t] || 0) + vol
      // SM always 180 ml; PM/CM → 200 pouch
      const size = packagingSizeForMilkType(t)
      packsBySize[size] = (packsBySize[size] || 0) + packs
    })
    // Accomplishment % comes from SBFP FY 2026 Monitoring (sbfp_monitoring),
    // not from the MFP masterlist AD/AE columns.
    // Formula: sum(latest_delivered) / sum(target_packs) * 100
    // DONE rows are stored with latest_delivered = target (100%).
    // FAILED rows are excluded from both sums.
    // SBFP accomplishment only applies for All / DepEd funder filter.
    // Fallback: if sbfp_monitoring has no rows for this center (e.g. NHQ not seeded),
    // compute from sbfp_data packs_to_deliver / totalPacksDelivered instead.
    const useSbfpMonitoring = includeSbfpForFunder(funder) && (!year || year === '2026')
    let accomplishment = 0
    if (useSbfpMonitoring) {
      let mq = supabase
        .from('sbfp_monitoring')
        .select('target_packs,latest_delivered,del_aug18,del_aug31,del_sep30,del_oct31,status')
        .eq('year', 2026)
      if (center && center !== ALL_CENTERS_VALUE) {
        const aliases = sbfpCenterAliases(center)
        mq = aliases.length === 1 ? mq.eq('center', aliases[0]) : mq.in('center', aliases)
      }
      const { data: monRows, error: monErr } = await mq
      if (!monErr && monRows?.length) {
        // Primary path: use pre-computed monitoring snapshot data
        const usable = monRows.filter(r => String(r.status || '').toUpperCase() !== 'FAILED')
        const totalTarget = usable.reduce((s, r) => s + (r.target_packs || 0), 0)
        const totalDelivered = usable.reduce((s, r) => {
          if (!month) return s + (r.latest_delivered || 0)
          const m = parseInt(month, 10)
          const snaps = [r.del_aug18 || 0, r.del_aug31 || 0, r.del_sep30 || 0, r.del_oct31 || 0]
          let latest = 0
          if (m >= 10) latest = snaps[3] || snaps[2] || snaps[1] || snaps[0]
          else if (m === 9) latest = snaps[2] || snaps[1] || snaps[0]
          else if (m === 8) latest = snaps[1] || snaps[0]
          if (String(r.status || '').toUpperCase() === 'DONE' && latest === 0) {
            latest = r.target_packs || 0
          }
          return s + latest
        }, 0)
        accomplishment = totalTarget > 0
          ? Math.min(Math.round((totalDelivered / totalTarget) * 1000) / 10, 100)
          : 0
      } else if (sbfpAll.length > 0) {
        // Fallback: center not in sbfp_monitoring (e.g. NHQ) — compute from sbfp_data live.
        // IMPORTANT: use sbfpAll (unfiltered by month) for target, exactly like the
        // sbfp_monitoring primary path which counts ALL SDOs toward the denominator.
        // Month only affects which delivered snapshot value is picked, not which SDOs count.
        const { totalPacksDelivered: tpd } = await import('@/lib/sbfp-raw-milk')
        const usable = sbfpAll.filter(r =>
          String(r.procurement_status || '').toUpperCase() !== 'FAILED'
        )
        const totalTarget = usable.reduce((s, r) => s + (Number(r.packs_to_deliver) || 0), 0)
        const totalDelivered = usable.reduce((s, r) => s + tpd(r), 0)
        accomplishment = totalTarget > 0
          ? Math.min(Math.round((totalDelivered / totalTarget) * 1000) / 10, 100)
          : 0
      }
    } else {
      const totalTarget = rows.reduce((s, r) => s + (r.target_milk_packs_to_deliver || 0), 0)
      const totalDelivered = rows.reduce((s, r) => s + (r.total_milk_packs_delivered || 0), 0)
      accomplishment = totalTarget > 0
        ? Math.min(Math.round((totalDelivered / totalTarget) * 1000) / 10, 100)
        : 0
    }

    setStats({
      grossIncome, grossRevenue,
      dswdCenters: new Set(rows.filter(r => r.funded_by === 'DSWD').map(r => r.center)).size,
      totalBene,
      beneByFunder,
      totalPacks,
      packsByFunder,
      volumeByType,
      packsBySize,
      coopCount: new Set(qtyRows.map(r => r.supplier_id).filter(Boolean)).size,
      districtCount: new Set(qtyRows.map(r => r.municipality).filter(Boolean)).size,
      divisionCount: new Set(qtyRows.map(r => normalizeSdoName(r.division || '')).filter(Boolean)).size,
      provinceCount: new Set(qtyRows.map(r => r.province).filter(Boolean)).size,
      schoolCount: new Set(qtyRows.map(r => r.elementary_school).filter(Boolean)).size,
      accomplishment,
    })
    setLoading(false)
  }

  const zoomIn  = () => { const n = Math.min(displayScale + ZOOM_STEP, MAX_ZOOM); setCustomScale(n); setZoomMode('custom') }
  const zoomOut = () => { const n = Math.max(displayScale - ZOOM_STEP, MIN_ZOOM); setCustomScale(n); setZoomMode('custom') }
  const set100  = () => { setCustomScale(1); setZoomMode('custom') }

  async function waitForAssets() {
    await document.fonts.ready
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('#pimd-factsheet img'))
    await Promise.all(images.map(async img => {
      if (!img.complete) await new Promise<void>(res => {
        img.addEventListener('load', () => res(), { once: true })
        img.addEventListener('error', () => res(), { once: true })
      })
      try { await img.decode() } catch { /* ok */ }
    }))
    await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
  }

  // ─── Ref for Preview Reset ───────────────────────────────
  const previewBodyRef = useRef<HTMLDivElement>(null)

  // ─── Fetch the active center & options ────────────────────────────
  const openPreviewModal = async () => {
    if (isCapturing || !stats) return
    setIsCapturing(true)
    try {
      await waitForAssets()
      const root = document.getElementById('pimd-visible-capture-root') as HTMLElement
      if (!root) throw new Error('PIMD visible capture root was not found.')

      const { toBlob } = await import('html-to-image')
      const blob = await toBlob(root, {
        pixelRatio: Math.max(4, Math.ceil(window.devicePixelRatio * 2)),
        cacheBust: true,
        backgroundColor: undefined,
      })

      if (!blob) throw new Error('Capture returned null blob.')
      const src = URL.createObjectURL(blob)
      
      // Mandatory Debug PNG download
      const a = document.createElement('a')
      a.href = src
      a.download = 'pimd-exact-visible-capture-debug.png'
      a.click()

      setPreviewBlob(blob)
      setPreviewSrc(src)
      
      requestAnimationFrame(() => {
        if (previewBodyRef.current) {
          previewBodyRef.current.scrollTop = 0
          previewBodyRef.current.scrollLeft = 0
        }
      })
    } catch (err) {
      console.error(err)
      alert('Capture failed. Please try again.')
    } finally { setIsCapturing(false) }
  }

  const closePreviewModal = () => {
    if (previewSrc) URL.revokeObjectURL(previewSrc)
    setPreviewSrc(null)
    setPreviewBlob(null)
  }

  const handleDownloadPDF = async () => {
    if (!previewBlob) return
    try {
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(previewBlob)
      })
      
      const img = new Image()
      img.src = dataUrl
      await new Promise<void>(res => { img.onload = () => res() })
      
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 1
      
      const availableWidth = pageWidth - margin * 2
      const availableHeight = pageHeight - margin * 2
      const imageRatio = img.width / img.height
      
      let imageWidth = availableWidth
      let imageHeight = imageWidth / imageRatio
      
      if (imageHeight > availableHeight) {
        imageHeight = availableHeight
        imageWidth = imageHeight * imageRatio
      }
      
      const x = (pageWidth - imageWidth) / 2
      const y = (pageHeight - imageHeight) / 2
      
      pdf.addImage(dataUrl, 'PNG', x, y, imageWidth, imageHeight, undefined, 'FAST')
      pdf.save(getFilename())
    } catch (err) {
      console.error(err)
      alert('PDF export failed. Please try again.')
    }
  }

  const handlePrint = () => {
    if (!previewSrc) return
    const pw = window.open('', '_blank')
    if (!pw) { alert('Please allow popups for this site.'); return }

    pw.document.write(`<!doctype html>
<html>
<head>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; overflow: hidden; background: white;  /* ─── Preview Modal Fixes ─── */
  .pimd-modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center; z-index: 99999;
  }
  .pimd-modal-box {
    background: white; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
    display: flex; flexDirection: column;
    width: min(900px, 96vw);
    height: min(96vh, 1080px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
  }
  .pimd-modal-header {
    padding: 1rem 1.25rem; border-bottom: 1px solid #e2e8f0;
    display: flex; justify-content: space-between; align-items: center;
  }
  .pimd-modal-preview {
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    overflow: auto; /* Allow scrolling if user zooms */
    padding: 12px;
    background: #e6e9ee;
  }
  .pimd-modal-preview img {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
  }
  .pimd-modal-footer {
    padding: 1rem 1.25rem; border-top: 1px solid #e2e8f0; background: #f8fafc;
    display: flex; justify-content: space-between; align-items: center;
    position: relative;
    z-index: 2;
  } { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
  <div class="page">
    <img id="pimd-image" />
  </div>
</body>
</html>`)
    pw.document.close()

    const pImg = pw.document.getElementById('pimd-image') as HTMLImageElement | null
    if (pImg) {
      pImg.onload = () => {
        pw.focus()
        pw.print()
        setTimeout(() => pw.close(), 500)
      }
      pImg.src = previewSrc
    } else {
      setTimeout(() => { pw.focus(); pw.print(); pw.close() }, 800)
    }
  }

  const reportScopeLabel = (() => {
    const centerPart = center === ALL_CENTERS_VALUE
      ? 'ALL CENTERS'
      : centerDisplayLabel(center || 'ALL CENTERS').toUpperCase()
    if (!funder) return centerPart
    return `${centerPart} · ${funder.toUpperCase()}`
  })()

  const tbBtn = (active: boolean) => ({
    background: active ? NAVY : 'transparent', border: 'none', cursor: 'pointer',
    padding: '4px 8px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 700 as const,
    color: active ? WHITE : NAVY, whiteSpace: 'nowrap' as const,
    display: 'flex', alignItems: 'center', gap: 4,
  })

  const CSS = `
    .pimd-on-navy-text {
      color: #ffffff !important;
      -webkit-text-fill-color: #ffffff !important;
      opacity: 1 !important;
      mix-blend-mode: normal !important;
      filter: none !important;
      text-shadow: none !important;
    }
    .pimd-viewer{width:100%;min-width:0;display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:16px;box-sizing:border-box;background:#e5e7eb;border-radius:8px}
    .pimd-viewer.fp{overflow:hidden;align-items:center}
    .pimd-scaled-slot{position:relative;flex:0 0 auto}
    .pimd-artboard{position:absolute;left:0;top:0;overflow:hidden;box-sizing:border-box;font-family:Montserrat,Inter,Arial,sans-serif;transform-origin:top left}
    .pimd-artboard *{box-sizing:border-box;font-family:inherit}
    .pimd-transparent-asset{display:block;max-width:100%;width:100%;height:100%;object-fit:contain;background:transparent!important;border:0;box-shadow:none}
    .pimd-asset-wrapper{position:absolute;background:transparent!important;border:0;box-shadow:none;overflow:visible}
    .pimd-reference-overlay{position:absolute;left:0;top:0;object-fit:fill;pointer-events:none;opacity:0.5;z-index:9999}
    .box-title{color:white;font-size:25px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .box-val{color:white;font-size:68px;font-weight:900;letter-spacing:-1px;line-height:1}
    .abs-card{position:absolute;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .pimd-header-main{position:absolute;left:0;top:86px;width:1089px;height:270px;padding:0;display:block;overflow:visible}
    .pimd-header-logos{position:absolute;left:1090px;top:114px;width:324px;height:213px}
    .pimd-gross-income{position:absolute;left:67px;top:424px;width:928px;height:151px;padding:0 40px}
    .pimd-accomplishment{position:absolute;left:1022px;top:424px;width:325px;height:151px}
    .pimd-gross-revenue{position:absolute;left:71px;top:594px;width:927px;height:150px;padding:0 40px}
    .pimd-dswd-centers{position:absolute;left:1023px;top:594px;width:321px;height:148px;border-radius:20px;overflow:hidden}
    .pimd-beneficiary-frame{position:absolute;left:67px;top:779px;width:1280px;height:293px;background:transparent;border:7px solid rgb(0,83,123);border-radius:64px}
    .pimd-beneficiary-total-card{position:absolute;left:102px;top:813px;width:596px;height:136px;border-radius:18px;padding:0}
    .pimd-milk-packs-card{position:absolute;left:716px;top:813px;width:597px;height:136px;border-radius:18px;padding:0}
    .pimd-milk-utilized-panel{position:absolute;left:63px;top:1129px;width:622px;height:342px;border-radius:40px;box-shadow:0 7px 28px rgba(0,0,0,0.05)}
    .pimd-packaging-panel{position:absolute;left:714px;top:1122px;width:644px;height:355px;border-radius:40px}
    .pimd-bottom-left-blue-block{position:absolute;left:0;top:1524px;width:435px;height:135px;z-index:2}
    .pimd-cooperative-suppliers{position:absolute;left:451px;top:1524px;width:256px;height:135px;padding:0 20px;z-index:4}
    .pimd-districts{position:absolute;left:719px;top:1523px;width:639px;height:73px;flex-direction:row;justify-content:space-between;padding:0 40px;z-index:4}
    .pimd-sdo-card-background{position:absolute;left:719px;top:1606px;width:343px;height:312px;z-index:20}
    .pimd-sdo-card-content{position:absolute;left:719px;top:1606px;width:343px;height:312px;padding:0 30px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:40;pointer-events:none}
    .pimd-provinces{position:absolute;left:1073px;top:1605px;width:285px;height:150px;padding:0 20px;z-index:4}
    .pimd-schools{position:absolute;left:1073px;top:1765px;width:285px;height:151px;padding:0 20px;z-index:4}
    .ztbtn:hover{background:#e2e8f0!important}
    @media print{
      .no-print{display:none!important}
      body{background:white!important;margin:0!important}
      .pimd-on-navy-text { color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; opacity: 1 !important; }
      #pimd-factsheet { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    .pimd-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(4px)}
    .pimd-modal-box{background:white;border-radius:16px;box-shadow:0 32px 80px rgba(0,0,0,0.5);display:flex;flex-direction:column;max-width:680px;width:100%;max-height:calc(100vh - 48px);overflow:hidden}
    .pimd-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1.5px solid #e2e8f0;flex-shrink:0}
    .pimd-modal-preview{flex:1;overflow:auto;background:#f8fafc;display:flex;align-items:flex-start;justify-content:center;padding:16px}
    .pimd-modal-preview img{display:block;max-width:100%;height:auto;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,0.18)}
    .pimd-modal-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1.5px solid #e2e8f0;flex-shrink:0}
  `

  const viewerTop = viewerRef.current ? Math.round(viewerRef.current.getBoundingClientRect().top) : 220

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <style>{CSS}</style>

      {/* Filter bar */}
      <div className="no-print" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: NAVY, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Filter size={15} /> Filters:
        </span>
        {!isEncoder && (
          <select value={center} onChange={e => setCenter(e.target.value)}
            style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.83rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
            <option value={ALL_CENTERS_VALUE}>All Centers</option>
            {PCC_CENTERS.map(cc => { const v = cc === 'NHQGP (NIZ)' ? 'NIZ' : cc; return <option key={v} value={v}>{cc}</option> })}
          </select>
        )}
        <select value={year} onChange={e => setYear(e.target.value)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.83rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
          <option value="">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.83rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
          <option value="">All Months</option>
          {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={funder} onChange={e => setFunder(e.target.value)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.83rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}
          title="Filter by funding agency">
          {FUNDER_OPTIONS.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={openPreviewModal} disabled={isCapturing || !stats}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: isCapturing ? '#6b7280' : NAVY, color: WHITE, fontWeight: 700, fontSize: '0.83rem', cursor: isCapturing ? 'wait' : 'pointer', boxShadow: '0 2px 8px rgba(15,37,87,0.25)', opacity: !stats ? 0.5 : 1 }}>
            <Download size={14} /> {isCapturing ? 'Capturing…' : 'Download PDF'}
          </button>
          <button onClick={openPreviewModal} disabled={isCapturing || !stats}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: 8, border: `1.5px solid ${NAVY}`, background: 'white', color: NAVY, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', opacity: !stats ? 0.5 : 1 }}>
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Zoom toolbar */}
      <div className="no-print" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 4, background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', width: 'fit-content', fontSize: '0.78rem', color: NAVY }}>
        <button className="ztbtn" aria-label="Zoom out" onClick={zoomOut} title="Zoom Out" style={tbBtn(false)}><ZoomOut size={13} /></button>
        <span style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, padding: '0 4px' }}>{Math.round(displayScale * 100)}%</span>
        <button className="ztbtn" aria-label="Zoom in" onClick={zoomIn} title="Zoom In" style={tbBtn(false)}><ZoomIn size={13} /></button>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 2px' }} />
        <button className="ztbtn" aria-label="Fit Page" onClick={() => setZoomMode('fit-page')} title="Fit complete infographic in viewport" style={tbBtn(zoomMode === 'fit-page')}><Maximize2 size={12} />Fit Page</button>
        <button className="ztbtn" aria-label="Fit Width" onClick={() => setZoomMode('fit-width')} title="Fit to available width" style={tbBtn(zoomMode === 'fit-width')}><AlignCenter size={12} />Fit Width</button>
        <button className="ztbtn" aria-label="100%" onClick={set100} title="View at 100% native size" style={tbBtn(zoomMode === 'custom' && customScale === 1)}>100%</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '5rem', color: '#64748b' }}>Loading data…</div>
      ) : !stats ? (
        <div style={{
          textAlign: 'center', padding: '5rem 2rem', color: '#64748b',
          background: 'white', border: '1.5px dashed #cbd5e1', borderRadius: 12,
        }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1.05rem', marginBottom: 8 }}>
            Select filters to generate the factsheet
          </div>
          <div style={{ fontSize: '0.9rem', maxWidth: 420, margin: '0 auto', lineHeight: 1.45 }}>
            Choose a year above to load the report. Center and month are optional refinements.
          </div>
        </div>
      ) : (
        <div ref={viewerRef}
          className={`pimd-viewer no-print${zoomMode === 'fit-page' ? ' fp' : ''}`}
          style={{ height: zoomMode === 'fit-page' ? `calc(100vh - ${viewerTop}px - 16px)` : 'auto', minHeight: '300px' }}>
          <div id="pimd-visible-capture-root" className="pimd-scaled-slot"
            style={{ width: `${ARTBOARD_WIDTH * displayScale}px`, height: `${ARTBOARD_HEIGHT * displayScale}px` }}>
            <section id="pimd-factsheet" className="pimd-artboard"
              style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT, minWidth: ARTBOARD_WIDTH, minHeight: ARTBOARD_HEIGHT, background: BGD_GRAD, transform: `scale(${displayScale})` }}>

              {showReference && <img className="pimd-reference-overlay" src="/__pimd_reference__/inforgraphic-template.png" alt="" style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }} data-html2canvas-ignore="true" />}

              <div className="pimd-header-main" style={{ background: HDR_NAVY }} />
              
              <h1 className="pimd-header-title pimd-on-navy-text" style={{ position: 'absolute', margin: 0, padding: 0, fontSize: '64px', fontWeight: 900, lineHeight: 0.84, letterSpacing: '-1px', left: '52px', top: '132px', textAlign: 'left', whiteSpace: 'nowrap', zIndex: 10 }}>
                <span style={{ display: 'block' }}>MILK FEEDING PROGRAM</span>
                <span style={{ display: 'block' }}>FACTSHEET</span>
              </h1>
              
              <div className="pimd-header-rule" style={{ position: 'absolute', left: '49px', top: '258px', width: '868px', height: '2px', background: WHITE, zIndex: 10 }} />
              
              <div className="pimd-header-scope pimd-on-navy-text" style={{ position: 'absolute', left: '52px', top: '283px', fontSize: '29px', fontWeight: 400, lineHeight: 1, whiteSpace: 'nowrap', zIndex: 10 }}>
                {reportScopeLabel}
              </div>

              <div className="pimd-header-logos" style={{ background: HDR_LOGO }}>
                <div className="pimd-asset-wrapper" style={{ left: '40px', top: '53px', width: '124px', height: '108px' }}>
                  <img src="/assets/pimd-infographic/06_DA_PCC_LOGO_TRANSPARENT.png" alt="DA Logo" className="pimd-transparent-asset" />
                </div>
                <div className="pimd-asset-wrapper" style={{ left: '164px', top: '40px', width: '123px', height: '129px' }}>
                  <img src="/assets/pimd-infographic/04_BAGONG_PILIPINAS_TRANSPARENT.png" alt="Bagong Pilipinas" className="pimd-transparent-asset" />
                </div>
              </div>

              <div className="abs-card pimd-gross-income" style={{ background: NAVY }}>
                <div className="box-title pimd-on-navy-text" style={{ marginBottom: '10px' }}>GROSS INCOME FROM THE RAW MILK</div>
                <FittedText text={curOrBlank(stats.grossIncome)} maxWidth={840} maxSize={62} minSize={44} className="pimd-on-navy-text" />
              </div>

              <div className="abs-card pimd-accomplishment" style={{ background: NAVY, padding: 0 }}>
                <div className="pimd-accomplishment-content" style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', alignItems: 'center', justifyItems: 'center', padding: '12px 10px 10px' }}>
                  <div className="pimd-accomplishment-label pimd-on-navy-text" style={{ margin: 0, textAlign: 'center', lineHeight: 1.08, fontSize: '19px' }}>MILK FEEDING PROGRAM<br />ACCOMPLISHMENT</div>
                  <div className="pimd-accomplishment-value pimd-on-navy-text" style={{ alignSelf: 'center', display: 'block', margin: 0, padding: '0 0 5px', fontSize: '62px', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'visible', textAlign: 'center' }}>{stats.accomplishment.toFixed(1)}%</div>
                </div>
              </div>

              <div className="abs-card pimd-gross-revenue" style={{ background: NAVY }}>
                <div className="box-title pimd-on-navy-text" style={{ marginBottom: '10px' }}>GROSS REVENUE OF THE MILK FEEDING PROGRAM</div>
                <FittedText text={cur(stats.grossRevenue)} maxWidth={840} maxSize={62} minSize={44} className="pimd-on-navy-text" />
              </div>

              <div className="pimd-dswd-centers" style={{ background: NAVY }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div className="box-title pimd-on-navy-text" style={{ fontSize: '18px', lineHeight: 1.15, padding: '0 48px', width: '100%', textAlign: 'center' }}>NO. OF CHILD<br />DEVELOPMENT<br />CENTERS UNDER DSWD</div>
                  <div style={{ width: '100%', marginTop: '4px', textAlign: 'center' }}><FittedText text={formatCount(stats.dswdCenters)} maxWidth={200} maxSize={64} minSize={44} className="pimd-on-navy-text" /></div>
                </div>
                <img src="/assets/pimd-infographic/01_DSWD_LOGO_TRANSPARENT.png" alt="DSWD" style={{ position: 'absolute', right: '16px', bottom: '16px', objectFit: 'contain', background: 'transparent', width: '41px', height: '36px', zIndex: 5 }} />
              </div>

              <div className="pimd-beneficiary-frame">
                <div style={{ position: 'absolute', top: '190px', left: 0, width: '640px', display: 'flex', alignItems: 'center' }}>
                  {(['DSWD','DEPED','LDS','OTHERS'] as const).map(f => {
                    const w = (f === 'DSWD' || f === 'DEPED') ? '32%' : '18%'
                    return (
                      <div key={f} style={{ textAlign: 'center', width: w }}>
                        <div style={{ color: NAVY, fontWeight: 900, fontSize: '28px', lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: '-0.5px' }}>{formatCount(stats.beneByFunder[f] || 0)}</div>
                        <div style={{ color: NAVY, fontWeight: 700, fontSize: '20px' }}>{f}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ position: 'absolute', top: '178px', left: '636px', width: '8px', height: '75px', background: NAVY }} />
                <div style={{ position: 'absolute', top: '190px', left: '644px', width: '636px', display: 'flex', alignItems: 'center' }}>
                  {(['DSWD','DEPED','LDS','OTHERS'] as const).map(f => {
                    const w = (f === 'DSWD' || f === 'DEPED') ? '32%' : '18%'
                    return (
                      <div key={f} style={{ textAlign: 'center', width: w }}>
                        <div style={{ color: NAVY, fontWeight: 900, fontSize: '28px', lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: '-0.5px' }}>{formatCount(stats.packsByFunder[f] || 0)}</div>
                        <div style={{ color: NAVY, fontWeight: 700, fontSize: '20px' }}>{f}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="pimd-beneficiary-total-card" style={{ background: NAVY, overflow: 'visible' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '14px', pointerEvents: 'none' }}>
                  <div className="box-title pimd-on-navy-text" style={{ width: '100%', padding: '0 12px', textAlign: 'center', fontWeight: 800, lineHeight: 1.05, fontSize: '21px' }}>TOTAL NUMBER OF CHILDREN BENEFICIARIES</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                    <FittedText text={formatCount(stats.totalBene)} maxWidth={346} maxSize={50} minSize={42} className="pimd-on-navy-text" />
                  </div>
                </div>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '100px', top: '878px', width: '105px', height: '72px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/03_TWO_CHILDREN_TRANSPARENT.png" alt="Children" className="pimd-transparent-asset" />
              </div>

              <div className="pimd-milk-packs-card" style={{ background: NAVY, overflow: 'visible' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '14px', pointerEvents: 'none' }}>
                  <div className="box-title pimd-on-navy-text" style={{ width: '100%', padding: '0 12px', textAlign: 'center', fontWeight: 800, lineHeight: 1.05, fontSize: '19px' }}>MILK PACKS DISTRIBUTED TO CHILDREN<br />BENEFICIARIES</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                    <FittedText text={formatCount(stats.totalPacks)} maxWidth={346} maxSize={48} minSize={42} className="pimd-on-navy-text" />
                  </div>
                </div>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '1206px', top: '871px', width: '104px', height: '78px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/05_THREE_CHILDREN_ILLUSTRATION_TRANSPARENT.png" alt="Children" className="pimd-transparent-asset" />
              </div>

              <div className="pimd-milk-utilized-panel" style={{ background: CHART_BG }}><BarChart data={stats.volumeByType} /></div>
              <div className="pimd-packaging-panel" style={{ background: NAVY }}><HBar data={stats.packsBySize} /></div>
              <div className="pimd-asset-wrapper" style={{ left: '727px', top: '1409px', width: '66px', height: '76px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/02_MILKY_BOY_TRANSPARENT.png" alt="Milky Boy" className="pimd-transparent-asset" />
              </div>

              <div className="pimd-bottom-left-blue-block" style={{ background: NAVY }} />
              <div className="pimd-asset-wrapper" style={{ left: '33px', top: '1465px', width: '788px', height: '534px', zIndex: 30 }}>
                <img src="/assets/pimd-infographic/08_THREE_CHILDREN_DRINKING_MILK_TRANSPARENT.png" alt="Children drinking" className="pimd-transparent-asset" style={{ objectPosition: 'bottom left', pointerEvents: 'none' }} />
              </div>

              <div className="abs-card pimd-cooperative-suppliers" style={{ background: NAVY, padding: 0 }}>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', alignItems: 'center', justifyItems: 'center', padding: '12px 10px 10px' }}>
                  <div className="box-title pimd-on-navy-text" style={{ fontSize: '18px', textAlign: 'center', margin: 0, lineHeight: 1.1 }}>NO. OF COOPERATIVE<br />MILK SUPPLIERS</div>
                  <div className="pimd-cooperative-value pimd-on-navy-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, paddingBottom: '6px', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'visible' }}><FittedText text={formatCount(stats.coopCount)} maxWidth={200} maxSize={64} minSize={44} className="pimd-on-navy-text" /></div>
                </div>
              </div>

              <div className="abs-card pimd-districts" style={{ background: NAVY, flexDirection: 'row', justifyContent: 'space-between', padding: '0 40px' }}>
                <div className="box-title pimd-on-navy-text" style={{ fontSize: '23px', margin: 0, textAlign: 'left' }}>NO. OF LEGISLATIVE<br />DISTRICTS SUPPLIED</div>
                <div className="box-val pimd-on-navy-text" style={{ fontSize: '56px', margin: 0, paddingBottom: '4px' }}>{formatCount(stats.districtCount)}</div>
              </div>

              <div className="pimd-sdo-card-background" style={{ background: NAVY }}>
                <div className="pimd-sdo-content" style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateRows: '82px minmax(0, 1fr) 58px', justifyItems: 'center', alignItems: 'center' }}>
                  <div className="pimd-sdo-label pimd-on-navy-text" style={{ gridRow: 1, alignSelf: 'center', textAlign: 'center', lineHeight: 1.12, fontSize: '24px', pointerEvents: 'auto' }}>NO. OF SCHOOL<br />DIVISION OFFICE</div>
                  <div className="pimd-sdo-value pimd-on-navy-text" style={{ gridRow: 2, alignSelf: 'center', margin: 0, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'visible', pointerEvents: 'auto' }}><FittedText text={formatCount(stats.divisionCount)} maxWidth={250} maxSize={110} minSize={44} className="pimd-on-navy-text" /></div>
                  <img src="/assets/pimd-infographic/07_DEPED_LOGO_TRANSPARENT.png" alt="DepEd" className="pimd-deped-logo" style={{ gridRow: 3, alignSelf: 'center', width: 'auto', maxWidth: '98px', maxHeight: '46px', objectFit: 'contain', background: 'transparent' }} />
                </div>
              </div>

              <div className="abs-card pimd-provinces" style={{ background: NAVY }}>
                <div className="box-title pimd-on-navy-text" style={{ fontSize: '19px' }}>NO. OF PROVINCES<br />SUPPLIED</div>
                <div style={{ marginTop: '15px' }}><FittedText text={formatCount(stats.provinceCount)} maxWidth={240} maxSize={70} minSize={44} className="pimd-on-navy-text" /></div>
              </div>

              <div className="abs-card pimd-schools" style={{ background: NAVY }}>
                <div className="box-title pimd-on-navy-text" style={{ fontSize: '19px' }}>NO. OF SCHOOLS<br />SUPPLIED</div>
                <div style={{ marginTop: '15px' }}><FittedText text={formatCount(stats.schoolCount)} maxWidth={240} maxSize={70} minSize={44} className="pimd-on-navy-text" /></div>
              </div>

            </section>
          </div>
        </div>
      )}

      {/* ── Preview Modal ───────────────────────────────────────────────── */}
      {previewSrc && (
        <div className="pimd-modal-backdrop no-print" onClick={closePreviewModal}>
          <div className="pimd-modal-box" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="pimd-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: NAVY }} />
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: NAVY }}>
                  Milk Feeding Program Factsheet
                </span>
              </div>
              <button onClick={closePreviewModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.4rem', lineHeight: 1, padding: '0 4px' }}
                aria-label="Close preview">
                ×
              </button>
            </div>

            {/* Preview image */}
            <div className="pimd-modal-preview" ref={previewBodyRef}>
              <img src={previewSrc} alt="Factsheet preview" onLoad={() => {
                requestAnimationFrame(() => {
                  if (previewBodyRef.current) {
                    previewBodyRef.current.scrollTop = 0
                    previewBodyRef.current.scrollLeft = 0
                  }
                })
              }} />
            </div>

            {/* Footer buttons */}
            <div className="pimd-modal-footer">
              <span style={{ marginRight: 'auto', fontSize: '0.78rem', color: '#94a3b8' }}>
                1 sheet of paper
              </span>
              <button onClick={closePreviewModal}
                style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handlePrint}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.2rem', borderRadius: 8, border: `1.5px solid ${NAVY}`, background: 'white', color: NAVY, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer' }}>
                <Printer size={14} /> Print
              </button>
              <button onClick={handleDownloadPDF}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.4rem', borderRadius: 8, border: 'none', background: NAVY, color: WHITE, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,37,87,0.25)' }}>
                <Download size={14} /> Download PDF
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
