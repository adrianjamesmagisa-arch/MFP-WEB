'use client'

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Printer, Download, Filter, Search, RotateCcw, Table, BarChart2, Layers, Building2, FileSpreadsheet, CircleDollarSign, ClipboardList, MapPinned, FileDown } from 'lucide-react'
import { SBFP_DATA_ENCODER_COLUMNS } from '@/lib/encoder-selects'
import * as XLSX from 'xlsx-js-style'
import { dbYearToSchoolYear, FALLBACK_SCHOOL_YEARS, schoolYearToDbYear } from '@/lib/sbfp-year'
import {
  defaultDeliveredPackRange,
  mapSbfpRowToReportView,
  reportCenterFilterOptions,
  reportCenterLabel,
  rowHasDeliveryInMonth,
  rowMatchesReportCenterFilter,
  rowMatchesSbfpStatusFilter,
  resolveDeliveredPacksForReport,
  sbfpRowVisibleInReportDefault,
  sbfpStatusBucket,
  senateMetricsForRow,
  addSbfpSenateMetrics,
  emptySbfpSenateMetrics,
  officialSbfpStatusLabel,
  SBFP_PROCUREMENT_STATUSES,
  SBFP_STATUS_FILTER_OPTIONS,
  type SbfpReportSourceRow,
  type SbfpSenateMetrics,
  type SbfpProcurementStatus,
} from '@/lib/sbfp-report-sync'
import { uniqueSdoCountKey } from '@/lib/sbfp-dropoff-sync'
import { excludeAuxSbfp, isSbfpAuxRow } from '@/lib/sbfp-aux'
import { sbfpCenterAliases, sbfpNavCenter } from '@/lib/center-aliases'
import { milkTypeLabel } from '@/lib/sbfp-pack-price'

// Philippine regional display order
const REGION_ORDER: Record<string, number> = {
  CAR: 1, I: 2, II: 3, III: 4,
  'IV-A': 5, IVA: 5, CALABARZON: 5,
  'IV-B': 6, IVB: 6, MIMAROPA: 6,
  V: 7, NCR: 8, VI: 9, VII: 10,
  NIR: 11, VIII: 12, IX: 13, X: 14,
  XI: 15, XII: 16, CARAGA: 17, BARMM: 18,
}

function regionSortKey(region: string): number {
  return REGION_ORDER[region?.toUpperCase()] ?? 99
}

/** Philippine peso — use Unicode escape so builds never lose the glyph as "?". */
const PESO = '\u20B1'
const fmtPeso = (n: number) =>
  `${PESO}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
const fmtL = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const fmtPct = (n: number) => `${n.toFixed(1)}%`

type ReportTab =
  | 'master'
  | 'region_summary'
  | 'center_summary'
  | 'status_matrix'
  | 'senate_perf'
  | 'senate_status'
  | 'senate_region'
  | 'senate_center'
  | 'senate_sdo'
  | 'senate_delivery'

const th: CSSProperties = { border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'right', whiteSpace: 'normal', lineHeight: 1.2 }
const thC: CSSProperties = { ...th, textAlign: 'center' }
const tdR: CSSProperties = { border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right' }
const tdC: CSSProperties = { border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }
const grpTh: CSSProperties = {
  border: '1px solid #cbd5e1',
  padding: '6px 8px',
  textAlign: 'center',
  fontSize: '0.7rem',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: '#fff',
}

const DELIVERY_MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const

const IMPLEMENTATION_STATUS_COLORS: Record<SbfpProcurementStatus, string> = {
  'For Preparation': '#92400e',
  'Ongoing Procurement': '#1e40af',
  'Ongoing (For Award)': '#1e3a8a',
  'Awarded (For Delivery)': '#5b21b6',
  'Awarded (Ongoing Delivery)': '#3730a3',
  'Completed': '#065f46',
  'Failed': '#991b1b',
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  'For Preparation':            { bg: '#fef3c7', color: '#92400e' },
  'Ongoing':                    { bg: '#dbeafe', color: '#1e40af' },
  'Ongoing Procurement':        { bg: '#dbeafe', color: '#1e40af' },
  'Ongoing (For Award)':        { bg: '#bfdbfe', color: '#1e3a8a' },
  'Awarded (For Delivery)':     { bg: '#ede9fe', color: '#5b21b6' },
  'Awarded (Ongoing Delivery)': { bg: '#e0e7ff', color: '#3730a3' },
  'Completed':                  { bg: '#d1fae5', color: '#065f46' },
  'Failed':                     { bg: '#fee2e2', color: '#991b1b' },
}

export default function SbfpSpreadsheetReport() {
  const [records, setRecords]               = useState<any[]>([])
  const [loading, setLoading]               = useState(true)
  const [year, setYear]                     = useState(String(schoolYearToDbYear(FALLBACK_SCHOOL_YEARS[0])))
  const [schoolYearOptions, setSchoolYearOptions] = useState<string[]>([...FALLBACK_SCHOOL_YEARS])
  const initialDbYear = schoolYearToDbYear(FALLBACK_SCHOOL_YEARS[0])
  const initialDeliveredRange = defaultDeliveredPackRange(initialDbYear)
  const [deliveredFrom, setDeliveredFrom] = useState(initialDeliveredRange.from)
  const [deliveredTo, setDeliveredTo] = useState(initialDeliveredRange.to)
  /** When false: list all SDOs; delivered column uses full SY (Aug 1 – today). */
  const [deliveredDateFilterEnabled, setDeliveredDateFilterEnabled] = useState(false)
  const [filterRegion, setFilterRegion]     = useState('ALL')
  const [filterCenter, setFilterCenter]     = useState('ALL')
  const [filterStatus, setFilterStatus]     = useState('ALL')
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [filterMonth, setFilterMonth]       = useState('')
  const [searchQuery, setSearchQuery]       = useState('')
  const [activeTab, setActiveTab]           = useState<ReportTab>('master')
  /** When set, center filter is locked to the encoder's assigned center. */
  const [lockedCenter, setLockedCenter]     = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,center')
        .eq('id', user.id)
        .single()
      if (profile?.role === 'encoder' && profile.center) {
        const label = reportCenterLabel(sbfpNavCenter(profile.center) || profile.center)
        setLockedCenter(label)
        setFilterCenter(label)
      }
    })()
  }, [])

  useEffect(() => {
    supabase
      .from('sbfp_school_years')
      .select('year, label, is_active')
      .then(({ data }) => {
        const labels = (data || [])
          .filter(r => r.is_active !== false)
          .sort((a, b) => (a.year || 0) - (b.year || 0))
          .map(r => r.label || dbYearToSchoolYear(r.year))
        if (labels.length > 0) setSchoolYearOptions(labels)
      })
  }, [])

  useEffect(() => {
    setLoading(true)
    let query = supabase
      .from('sbfp_data')
      .select(SBFP_DATA_ENCODER_COLUMNS)
      .eq('year', parseInt(year, 10))
    if (lockedCenter) {
      const aliases = sbfpCenterAliases(lockedCenter)
      if (aliases.length === 1) query = query.eq('center', aliases[0])
      else if (aliases.length > 1) query = query.in('center', aliases)
    }
    query.then(({ data, error }) => {
      if (error) {
        console.error('Error fetching SBFP data:', error)
        setRecords([])
      } else {
        const rows = excludeAuxSbfp((data || []) as unknown as SbfpReportSourceRow[])
        const sorted = rows.sort((a, b) => {
          const rA = regionSortKey(a.region || ''), rB = regionSortKey(b.region || '')
          if (rA !== rB) return rA - rB
          const kA = uniqueSdoCountKey(a.sdo, a.center)
          const kB = uniqueSdoCountKey(b.sdo, b.center)
          if (kA !== kB) return kA.localeCompare(kB)
          return (a.sdo || '').localeCompare(b.sdo || '')
        })
        setRecords(sorted)
      }
      setLoading(false)
    })
  }, [year, lockedCenter])

  useEffect(() => {
    const dbY = parseInt(year, 10)
    if (!Number.isFinite(dbY)) return
    const { from, to } = defaultDeliveredPackRange(dbY)
    setDeliveredFrom(from)
    setDeliveredTo(to)
  }, [year])

  // Extract distinct centers and regions
  const distinctCenters = useMemo(
    () => reportCenterFilterOptions(records as SbfpReportSourceRow[]),
    [records],
  )

  const distinctRegions = useMemo(() => {
    const set = new Set<string>()
    records.forEach(r => {
      if (isSbfpAuxRow(r)) return
      const region = String(r.region || '').trim()
      if (!region) return
      // Aux worksheets sometimes stash "HIRING" / "PPMP" in the region column.
      if (/^(hiring|ppmp)$/i.test(region)) return
      set.add(region)
    })
    return Array.from(set).sort((a, b) => regionSortKey(a) - regionSortKey(b))
  }, [records])

  const distinctStatuses = SBFP_STATUS_FILTER_OPTIONS.filter(o => o.value !== 'ALL')

  const dbYearNum = parseInt(year, 10)

  const effectiveDeliveredRange = useMemo(() => {
    if (Number.isFinite(dbYearNum) && !deliveredDateFilterEnabled) {
      return defaultDeliveredPackRange(dbYearNum)
    }
    const to = deliveredTo >= deliveredFrom ? deliveredTo : deliveredFrom
    return { from: deliveredFrom, to }
  }, [dbYearNum, deliveredDateFilterEnabled, deliveredFrom, deliveredTo])

  // Filter records
  const filteredRecords = useMemo(() => {
    const { from: rangeFrom, to: rangeTo } = effectiveDeliveredRange
    return records.filter(r => {
      // In Report rows + Failed (so status filter/counts work). Checkbox still shows all excluded.
      if (!includeExcluded && !sbfpRowVisibleInReportDefault(r as SbfpReportSourceRow)) return false
      if (filterRegion !== 'ALL' && r.region !== filterRegion) return false
      if (!rowMatchesReportCenterFilter(r as SbfpReportSourceRow, filterCenter)) return false
      if (!rowMatchesSbfpStatusFilter(r.procurement_status, filterStatus)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchSdo = (r.sdo || '').toLowerCase().includes(q)
        const matchCenter = (r.center || '').toLowerCase().includes(q)
        const matchRegion = (r.region || '').toLowerCase().includes(q)
        const matchPo = (r.po_number || '').toLowerCase().includes(q)
        const matchPr = (r.pr_number || '').toLowerCase().includes(q)
        if (!matchSdo && !matchCenter && !matchRegion && !matchPo && !matchPr) return false
      }
      if (filterMonth) {
        const month = parseInt(filterMonth, 10)
        const dbYear = parseInt(year, 10)
        if (
          Number.isFinite(month) &&
          Number.isFinite(dbYear) &&
          !rowHasDeliveryInMonth(r as SbfpReportSourceRow, month, dbYear)
        ) {
          return false
        }
      }
      if (
        deliveredDateFilterEnabled &&
        Number.isFinite(dbYearNum) &&
        rangeFrom &&
        rangeTo
      ) {
        const delivered = resolveDeliveredPacksForReport(r as SbfpReportSourceRow, {
          deliveredFromIso: rangeFrom,
          deliveredToIso: rangeTo,
          dbYear: dbYearNum,
        })
        if (delivered <= 0) return false
      }
      return true
    })
  }, [
    records,
    filterRegion,
    filterCenter,
    filterStatus,
    searchQuery,
    filterMonth,
    year,
    includeExcluded,
    deliveredDateFilterEnabled,
    effectiveDeliveredRange,
    dbYearNum,
  ])

  const viewRows = useMemo(() => {
    const dbY = Number.isFinite(dbYearNum) ? dbYearNum : undefined
    const { from, to } = effectiveDeliveredRange
    return (records as SbfpReportSourceRow[]).map(r =>
      mapSbfpRowToReportView(r, {
        deliveredFromIso: from,
        deliveredToIso: to,
        dbYear: dbY,
      }),
    )
  }, [records, effectiveDeliveredRange, dbYearNum])

  const getViewForSource = useCallback(
    (sourceId: string | undefined) => viewRows.find(v => v.source.id === sourceId),
    [viewRows],
  )

  const rowSenate = useCallback(
    (r: SbfpReportSourceRow): SbfpSenateMetrics => {
      const view = getViewForSource(r.id)
      return senateMetricsForRow(r, {
        packs_to_deliver: view?.packs_to_deliver ?? 0,
        delivered_packs: view?.delivered_packs ?? 0,
        contract_amount: view?.contract_amount ?? (Number(r.contract_amount) || 0),
      })
    },
    [getViewForSource],
  )

  // Summary statistics
  const stats = useMemo(() => {
    let metrics = emptySbfpSenateMetrics()
    let totalAmount = 0
    let totalBeneficiaries = 0
    const statusCounts: Record<string, number> = {}
    const statusMetrics: Record<string, SbfpSenateMetrics> = {}

    filteredRecords.forEach(r => {
      const m = rowSenate(r)
      metrics = addSbfpSenateMetrics(metrics, m)
      totalAmount += Number(r.amount) || 0
      totalBeneficiaries += Number(r.beneficiaries_pm) || 0
      const bucket = sbfpStatusBucket(r.procurement_status)
      statusCounts[bucket] = (statusCounts[bucket] || 0) + 1
      statusMetrics[bucket] = addSbfpSenateMetrics(statusMetrics[bucket] || emptySbfpSenateMetrics(), m)
    })

    const coopIds = new Set(
      filteredRecords
        .map(r => String(r.supplier_id || '').trim())
        .filter(Boolean),
    )

    // Unique SDOs: PM/SM/lots = one; Pangasinan I Dist 2+3 = one; same name at two centers = two.
    const uniqueSdoKeys = filteredRecords
      .map(r => uniqueSdoCountKey(r.sdo, r.center))
      .filter(Boolean)
    
    const uniqueSdos = new Set(uniqueSdoKeys)

    // DEBUG: Always log to see what's being counted
    if (typeof window !== 'undefined' && uniqueSdos.size > 0) {
      console.log('🔍 SDO COUNT DEBUG:', uniqueSdos.size, '(expected 93)')
      console.log('All unique SDO keys:', Array.from(uniqueSdos).sort())
      
      // Group by SDO to see duplicates
      const bySdo = new Map<string, string[]>()
      filteredRecords.forEach(r => {
        const key = uniqueSdoCountKey(r.sdo, r.center)
        const sdo = String(r.sdo || '').trim()
        if (!bySdo.has(key)) bySdo.set(key, [])
        if (!bySdo.get(key)!.includes(sdo)) bySdo.get(key)!.push(sdo)
      })
      const multipleNames = Array.from(bySdo.entries())
        .filter(([_, names]) => names.length > 1)
        .map(([key, names]) => ({ key, names }))
      if (multipleNames.length > 0) {
        console.log('SDOs with multiple name variations:', multipleNames)
      }
      
      if (uniqueSdos.size !== 93) {
        console.warn(`⚠️ MISMATCH: Got ${uniqueSdos.size} SDOs instead of 93 (difference: ${uniqueSdos.size - 93})`)
      }
    }

    return {
      count: uniqueSdos.size,
      rowCount: filteredRecords.length,
      totalPacks: metrics.targetPacks,
      totalDelivered: metrics.deliveredPacks,
      totalContractAmt: metrics.contractAmt,
      totalPaid: metrics.paidAmt,
      totalRemainingPay: metrics.remainingPay,
      totalContractedL: metrics.contractedL,
      totalDeliveredL: metrics.deliveredL,
      totalUndeliveredL: metrics.undeliveredL,
      totalValueDelivered: metrics.valueDelivered,
      totalRemainingContract: metrics.remainingContract,
      totalAmount,
      totalBeneficiaries,
      totalCoops: coopIds.size,
      pctDelivered: metrics.pctDelivered,
      statusCounts,
      statusMetrics,
    }
  }, [filteredRecords, rowSenate])

  type GroupAgg = SbfpSenateMetrics & {
    sdoCount: number
    sdoKeys: Set<string>
    beneficiaries: number
    coopIds: Set<string>
    forPrep: number
    ongoing: number
    awardedDelivery: number
    awardedOngoing: number
    completed: number
    failed: number
  }

  const bumpStatus = (entry: GroupAgg, status: string | null | undefined) => {
    const bucket = sbfpStatusBucket(status)
    if (bucket === 'prep') entry.forPrep++
    else if (bucket === 'ongoing') entry.ongoing++
    else if (bucket === 'awarded_delivery') entry.awardedDelivery++
    else if (bucket === 'awarded_ongoing') entry.awardedOngoing++
    else if (bucket === 'completed') entry.completed++
    else if (bucket === 'failed') entry.failed++
    else entry.forPrep++
  }

  const emptyGroup = (): GroupAgg => ({
    ...emptySbfpSenateMetrics(),
    sdoCount: 0,
    sdoKeys: new Set(),
    beneficiaries: 0,
    coopIds: new Set(),
    forPrep: 0,
    ongoing: 0,
    awardedDelivery: 0,
    awardedOngoing: 0,
    completed: 0,
    failed: 0,
  })

  const addRowToGroup = (entry: GroupAgg, r: SbfpReportSourceRow) => {
    const sdoKey = uniqueSdoCountKey(r.sdo, r.center)
    if (sdoKey && !entry.sdoKeys.has(sdoKey)) {
      entry.sdoKeys.add(sdoKey)
      entry.sdoCount++
    }
    entry.beneficiaries += Number(r.beneficiaries_pm) || 0
    const coopId = String(r.supplier_id || '').trim()
    if (coopId) entry.coopIds.add(coopId)
    const next = addSbfpSenateMetrics(entry, rowSenate(r))
    Object.assign(entry, next)
    bumpStatus(entry, r.procurement_status)
  }

  // Regional Aggregations
  const regionalSummary = useMemo(() => {
    const map = new Map<string, GroupAgg & { region: string }>()
    filteredRecords.forEach(r => {
      const reg = r.region || 'UNASSIGNED'
      if (!map.has(reg)) map.set(reg, { region: reg, ...emptyGroup() })
      addRowToGroup(map.get(reg)!, r)
    })
    return Array.from(map.values())
      .map(r => ({ ...r, coopCount: r.coopIds.size }))
      .sort((a, b) => regionSortKey(a.region) - regionSortKey(b.region))
  }, [filteredRecords, rowSenate])

  // Center Aggregations (same columns as regional summary)
  const centerSummary = useMemo(() => {
    const map = new Map<string, GroupAgg & { center: string }>()
    filteredRecords.forEach(r => {
      const centerKey = reportCenterLabel(r.center)
      const label = centerKey === '—' ? 'UNASSIGNED' : centerKey
      if (!map.has(label)) map.set(label, { center: label, ...emptyGroup() })
      addRowToGroup(map.get(label)!, r)
    })
    return Array.from(map.values())
      .map(r => ({ ...r, coopCount: r.coopIds.size }))
      .sort((a, b) => a.center.localeCompare(b.center))
  }, [filteredRecords, rowSenate])

  const sdoSenateRows = useMemo(() => {
    const mapped = filteredRecords
      .map(r => {
        const m = rowSenate(r)
        return {
          id: String(r.id || `${r.sdo}-${r.region}`),
          sdoKey: uniqueSdoCountKey(r.sdo, r.center),
          region: String(r.region || '—'),
          center: reportCenterLabel(r.center),
          sdo: String(r.sdo || '—'),
          milkType: milkTypeLabel(r.milk_type),
          status: officialSbfpStatusLabel(r.procurement_status),
          beneficiaries: Number(r.beneficiaries_pm) || 0,
          remarks: String(r.remarks || '').trim(),
          ...m,
          number: 0,
          sdoSpan: 0,
        }
      })
      .sort((a, b) => {
        const byRegion = regionSortKey(a.region) - regionSortKey(b.region)
        if (byRegion) return byRegion
        const byCenter = a.center.localeCompare(b.center)
        if (byCenter) return byCenter
        return a.sdo.localeCompare(b.sdo)
      })

    // One No. per unique SDO: Cavite PM/SM/CM share one number (merged cell).
    let geoNum = 0
    let i = 0
    while (i < mapped.length) {
      const key = mapped[i].sdoKey || `__row_${i}`
      let span = 1
      while (i + span < mapped.length && (mapped[i + span].sdoKey || `__row_${i + span}`) === key) span++
      geoNum++
      mapped[i] = { ...mapped[i], number: geoNum, sdoSpan: span }
      for (let j = 1; j < span; j++) mapped[i + j] = { ...mapped[i + j], number: geoNum, sdoSpan: 0 }
      i += span
    }
    return mapped
  }, [filteredRecords, rowSenate])

  const deliveryDetailsRows = useMemo(() => {
    const mapped = filteredRecords
      .map(r => {
        const m = rowSenate(r)
        const contractValue = Number(r.amount) || 0
        const contractedVolumeLiters = m.contractedL // Already calculated in liters
        const volumeDelivered = m.deliveredL // Already calculated in liters
        const amountPaid = m.paidAmt // From senate metrics
        const deliveryRate = m.pctDelivered // Already calculated percentage
        const isCompleted = r.procurement_status === 'Completed' || deliveryRate >= 100
        
        return {
          id: String(r.id || `${r.sdo}-${r.region}`),
          sdoKey: uniqueSdoCountKey(r.sdo, r.center),
          sdo: String(r.sdo || '—'),
          region: String(r.region || '—'),
          center: reportCenterLabel(r.center),
          contractValue,
          contractedVolumeLiters,
          volumeDelivered,
          amountPaid,
          deliveryRate,
          status: isCompleted ? 'Completed' : 'Ongoing',
          procurementStatus: officialSbfpStatusLabel(r.procurement_status),
          number: 0,
          sdoSpan: 0,
        }
      })
      .sort((a, b) => {
        const byRegion = regionSortKey(a.region) - regionSortKey(b.region)
        if (byRegion) return byRegion
        const byCenter = a.center.localeCompare(b.center)
        if (byCenter) return byCenter
        return a.sdo.localeCompare(b.sdo)
      })

    // Apply same grouping logic as SDO Worksheet: same SDO = same number
    let geoNum = 0
    let i = 0
    while (i < mapped.length) {
      const key = mapped[i].sdoKey || `__row_${i}`
      let span = 1
      while (i + span < mapped.length && (mapped[i + span].sdoKey || `__row_${i + span}`) === key) span++
      geoNum++
      mapped[i] = { ...mapped[i], number: geoNum, sdoSpan: span }
      for (let j = 1; j < span; j++) mapped[i + j] = { ...mapped[i + j], number: geoNum, sdoSpan: 0 }
      i += span
    }
    return mapped
  }, [filteredRecords, rowSenate])

  const implSummary = useMemo(() => {
    const emptyEntry = () => ({
      ...emptySbfpSenateMetrics(),
      sdoCount: 0,
      sdoKeys: new Set<string>(),
    })
    const buckets = Object.fromEntries(
      SBFP_PROCUREMENT_STATUSES.map(status => [status, emptyEntry()]),
    ) as Record<SbfpProcurementStatus, ReturnType<typeof emptyEntry>>
    const reasons: Array<{
      id: string
      sdo: string
      region: string
      center: string
      status: SbfpProcurementStatus
      undeliveredL: number
      remainingContract: number
      remarks: string
    }> = []

    // Track which status each unique SDO belongs to (use the highest priority status)
    const sdoToStatus = new Map<string, SbfpProcurementStatus>()
    filteredRecords.forEach(r => {
      const sdoKey = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      if (!sdoKey) return
      const status = officialSbfpStatusLabel(r.procurement_status)
      const existingStatus = sdoToStatus.get(sdoKey)
      if (!existingStatus) {
        sdoToStatus.set(sdoKey, status)
      } else {
        // If SDO has multiple statuses, use the one with highest priority
        const existingIdx = SBFP_PROCUREMENT_STATUSES.indexOf(existingStatus)
        const newIdx = SBFP_PROCUREMENT_STATUSES.indexOf(status)
        if (newIdx < existingIdx) {
          sdoToStatus.set(sdoKey, status)
        }
      }
    })

    filteredRecords.forEach(r => {
      const m = rowSenate(r)
      const status = officialSbfpStatusLabel(r.procurement_status)
      const entry = buckets[status]
      Object.assign(entry, addSbfpSenateMetrics(entry, m))
      
      // Only count SDO in this status bucket if this is its assigned status
      const sdoKey = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      if (sdoKey && sdoToStatus.get(sdoKey) === status && !entry.sdoKeys.has(sdoKey)) {
        entry.sdoKeys.add(sdoKey)
        entry.sdoCount++
      }
      
      reasons.push({
        id: String(r.id || `${r.sdo}-${r.region}`),
        sdo: String(r.sdo || '—'),
        region: String(r.region || '—'),
        center: reportCenterLabel(r.center),
        status,
        undeliveredL: m.undeliveredL,
        remainingContract: m.remainingContract,
        remarks: String(r.remarks || '').trim(),
      })
    })

    reasons.sort((a, b) => {
      const oa = SBFP_PROCUREMENT_STATUSES.indexOf(a.status)
      const ob = SBFP_PROCUREMENT_STATUSES.indexOf(b.status)
      if (oa !== ob) return oa - ob
      return b.remainingContract - a.remainingContract
    })
    return { buckets, reasons }
  }, [filteredRecords, rowSenate])

  /** # column: one number per unique SDO (PM/SM/lots / Pangasinan I Dist 2+3 share a cell). */
  const sdoIndexMeta = useMemo(() => {
    const meta: Array<{ number: number; rowSpan: number }> = []
    let geoNum = 0
    let i = 0
    while (i < filteredRecords.length) {
      const key = uniqueSdoCountKey(filteredRecords[i].sdo, filteredRecords[i].center) || `__row_${i}`
      let span = 1
      while (
        i + span < filteredRecords.length &&
        (uniqueSdoCountKey(filteredRecords[i + span].sdo, filteredRecords[i + span].center) || `__row_${i + span}`) === key
      ) {
        span++
      }
      geoNum++
      meta[i] = { number: geoNum, rowSpan: span }
      for (let j = 1; j < span; j++) meta[i + j] = { number: geoNum, rowSpan: 0 }
      i += span
    }
    return meta
  }, [filteredRecords])

  // Export to CSV Function
  const downloadCsv = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
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
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvRows.join('\r\n'))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', csvContent)
    downloadAnchor.setAttribute('download', filename)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    document.body.removeChild(downloadAnchor)
  }

  const exportToCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No data to export.')
      return
    }
    const dateStr = new Date().toISOString().split('T')[0]

    if (activeTab === 'senate_perf') {
      downloadCsv(`sbfp_senate_procurement_delivery_${year}_${dateStr}.csv`, [
        'Metric',
        'Value',
      ], [
        ['Scope', 'PCC milk component only'],
        ['Total value of milk contracts (PHP)', stats.totalContractAmt],
        ['Total contracted volume (L)', stats.totalContractedL],
        ['Actual amount paid/disbursed (PHP)', stats.totalPaid],
        ['Remaining to pay (PHP)', stats.totalRemainingPay],
        ['Actual volume delivered (L)', stats.totalDeliveredL],
        ['Undelivered volume (L)', stats.totalUndeliveredL],
        ['Value of delivered milk (PHP)', stats.totalValueDelivered],
        ['Delivery/accomplishment rate (%)', stats.pctDelivered.toFixed(1)],
        ['Disbursement rate (%)', stats.totalContractAmt > 0 ? ((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1) : '0.0'],
      ])
      return
    }

    if (activeTab === 'senate_status') {
      const statusRows = SBFP_PROCUREMENT_STATUSES.map(status => {
        const b = implSummary.buckets[status]
        return [
          status,
          b.sdoCount,
          b.contractAmt,
          b.paidAmt,
          b.remainingPay,
          b.contractedL,
          b.deliveredL,
          b.undeliveredL,
          b.remainingContract,
        ]
      })
      downloadCsv(`sbfp_senate_implementation_${year}_${dateStr}.csv`, [
        'Status',
        'SDOs',
        'Contracted value (PHP)',
        'Amount paid (PHP)',
        'Remaining to pay (PHP)',
        'Contracted volume (L)',
        'Delivered volume (L)',
        'Undelivered volume (L)',
        'Remaining contract value (PHP)',
      ], statusRows)
      return
    }

    if (activeTab === 'senate_region') {
      downloadCsv(`sbfp_senate_regional_${year}_${dateStr}.csv`, [
        'Region',
        'SDOs',
        'Contracted value (PHP)',
        'Contracted volume (L)',
        'Amount paid (PHP)',
        'Delivered volume (L)',
        'Value delivered (PHP)',
        'Delivery rate (%)',
        'Disbursement rate (%)',
      ], [
        ...regionalSummary.map(reg => [
          reg.region,
          reg.sdoCount,
          reg.contractAmt,
          reg.contractedL,
          reg.paidAmt,
          reg.deliveredL,
          reg.valueDelivered,
          reg.pctDelivered.toFixed(1),
          reg.pctDisbursed.toFixed(1),
        ]),
        [
          'TOTAL',
          stats.count,
          stats.totalContractAmt,
          stats.totalContractedL,
          stats.totalPaid,
          stats.totalDeliveredL,
          stats.totalValueDelivered,
          stats.pctDelivered.toFixed(1),
          stats.totalContractAmt > 0 ? ((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1) : '0.0',
        ],
      ])
      return
    }

    if (activeTab === 'senate_center') {
      downloadCsv(`sbfp_senate_center_${year}_${dateStr}.csv`, [
        'Center',
        'SDOs',
        'Contracted value (PHP)',
        'Contracted volume (L)',
        'Amount paid (PHP)',
        'Delivered volume (L)',
        'Value delivered (PHP)',
        'Delivery rate (%)',
        'Disbursement rate (%)',
      ], [
        ...centerSummary.map(c => [
          c.center,
          c.sdoCount,
          c.contractAmt,
          c.contractedL,
          c.paidAmt,
          c.deliveredL,
          c.valueDelivered,
          c.pctDelivered.toFixed(1),
          c.pctDisbursed.toFixed(1),
        ]),
        [
          'TOTAL',
          stats.count,
          stats.totalContractAmt,
          stats.totalContractedL,
          stats.totalPaid,
          stats.totalDeliveredL,
          stats.totalValueDelivered,
          stats.pctDelivered.toFixed(1),
          stats.totalContractAmt > 0 ? ((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1) : '0.0',
        ],
      ])
      return
    }

    if (activeTab === 'senate_sdo') {
      downloadCsv(`sbfp_senate_sdo_${year}_${dateStr}.csv`, [
        'No.',
        'Region',
        'Center',
        'SDO',
        'Milk type',
        'Status',
        'Beneficiaries',
        'Packs to deliver',
        'Delivered packs',
        'Contracted value (PHP)',
        'Amount paid (PHP)',
        'Remaining to pay (PHP)',
        'Contracted volume (L)',
        'Delivered volume (L)',
        'Undelivered volume (L)',
        'Value delivered (PHP)',
        'Remaining contract (PHP)',
        'Delivery rate (%)',
        'Disbursement rate (%)',
        'Remarks',
      ], [
        ...sdoSenateRows.map((row) => [
          row.sdoSpan > 0 ? row.number : '',
          row.region,
          row.center,
          row.sdo,
          row.milkType,
          row.status,
          row.beneficiaries,
          row.targetPacks,
          row.deliveredPacks,
          row.contractAmt,
          row.paidAmt,
          row.remainingPay,
          row.contractedL,
          row.deliveredL,
          row.undeliveredL,
          row.valueDelivered,
          row.remainingContract,
          row.pctDelivered.toFixed(1),
          row.pctDisbursed.toFixed(1),
          row.remarks,
        ]),
        [
          'TOTAL',
          '',
          '',
          `${stats.count} SDOs`,
          '',
          `${stats.rowCount} rows`,
          stats.totalBeneficiaries,
          stats.totalPacks,
          stats.totalDelivered,
          stats.totalContractAmt,
          stats.totalPaid,
          stats.totalRemainingPay,
          stats.totalContractedL,
          stats.totalDeliveredL,
          stats.totalUndeliveredL,
          stats.totalValueDelivered,
          stats.totalRemainingContract,
          stats.pctDelivered.toFixed(1),
          stats.totalContractAmt > 0 ? ((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1) : '0.0',
          '',
        ],
      ])
      return
    }

    if (activeTab === 'senate_delivery') {
      downloadCsv(`sbfp_senate_delivery_${year}_${dateStr}.csv`, [
        'No.',
        'SDO',
        'Region',
        'Center',
        'Contract Value (PHP)',
        'Contracted Volume (L)',
        'Volume Delivered (L)',
        'Amount Paid (PHP)',
        'Delivery Rate (%)',
        'Status',
        'Procurement Status',
      ], [
        ...deliveryDetailsRows.map((row) => [
          row.sdoSpan > 0 ? row.number : '',
          row.sdo,
          row.region,
          row.center,
          row.contractValue,
          row.contractedVolumeLiters,
          row.volumeDelivered,
          row.amountPaid,
          row.deliveryRate.toFixed(1),
          row.status,
          row.procurementStatus,
        ]),
        [
          'TOTAL',
          '',
          '',
          `${deliveryDetailsRows.filter(r => r.sdoSpan > 0).length} SDOs / ${deliveryDetailsRows.length} rows`,
          deliveryDetailsRows.reduce((sum, r) => sum + r.contractValue, 0),
          deliveryDetailsRows.reduce((sum, r) => sum + r.contractedVolumeLiters, 0),
          deliveryDetailsRows.reduce((sum, r) => sum + r.volumeDelivered, 0),
          deliveryDetailsRows.reduce((sum, r) => sum + r.amountPaid, 0),
          deliveryDetailsRows.reduce((sum, r) => sum + r.contractedVolumeLiters, 0) > 0
            ? ((deliveryDetailsRows.reduce((sum, r) => sum + r.volumeDelivered, 0) /
                deliveryDetailsRows.reduce((sum, r) => sum + r.contractedVolumeLiters, 0)) * 100).toFixed(1)
            : '0.0',
          `${deliveryDetailsRows.filter(r => r.status === 'Completed').length} Completed / ${deliveryDetailsRows.filter(r => r.status === 'Ongoing').length} Ongoing`,
          '',
        ],
      ])
      return
    }

    const headers = [
      'No.',
      'Region',
      'Schools Division Office (SDO)',
      'Center',
      'Procurement Status',
      'Amount (PHP)',
      'Mode of Procurement',
      'PR Date Received',
      'PR Number',
      'ORS Date',
      'PO Number',
      'Batch',
      'Beneficiaries',
      'Contract Amount (PHP)',
      'Delivery Start',
      'Delivery End',
      'Packs to Deliver',
      'Milk Type',
      'Delivered Packs',
      'Payment Status',
      'Remarks'
    ]

    downloadCsv(
      `sbfp_procurement_monitoring_${year}_${dateStr}.csv`,
      headers,
      filteredRecords.flatMap((r, idx) => {
        const v = getViewForSource(r.id)
        if (!v) return []
        return [[
          sdoIndexMeta[idx]?.number ?? idx + 1,
          v.region === '—' ? '' : v.region,
          v.sdo === '—' ? '' : v.sdo,
          v.center,
          v.procurement_status,
          v.amount,
          v.mode_of_procurement === '—' ? '' : v.mode_of_procurement,
          v.pr_date_received === '—' ? '' : v.pr_date_received,
          v.pr_number === '—' ? '' : v.pr_number,
          v.ors_date === '—' ? '' : v.ors_date,
          v.po_number === '—' ? '' : v.po_number,
          v.batch === '—' ? '' : v.batch,
          v.beneficiaries_pm,
          v.contract_amount,
          v.delivery_start === '—' ? '' : v.delivery_start,
          v.delivery_end === '—' ? '' : v.delivery_end,
          v.packs_to_deliver,
          v.milk_type,
          v.delivered_packs,
          v.status_of_payment === '—' ? '' : v.status_of_payment,
          v.remarks === '—' ? '' : v.remarks,
        ]]
      }),
    )
  }

  // ── Excel styling helpers ──
  type ColType = 'text' | 'num' | 'cur' | 'pct' | 'dec'

  interface TabExportData {
    sheetName: string
    filename: string
    headers: string[]
    rows: Array<Array<string | number>>
    colTypes: ColType[]
  }

  function buildStyledSheet(
    hdrs: string[],
    dataRows: Array<Array<string | number>>,
    colTypes: ColType[],
  ) {
    const ws = XLSX.utils.aoa_to_sheet([hdrs, ...dataRows])
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    const lastR = range.e.r
    const hasTotal = dataRows.length > 0 &&
      String(dataRows[dataRows.length - 1][0] ?? '').toUpperCase().startsWith('TOTAL')

    // Helper: determine default alignment for a column
    const getColAlign = (C: number): 'left' | 'center' | 'right' => {
      const ct = colTypes[C] || 'text'
      if (ct === 'num' || ct === 'cur' || ct === 'pct' || ct === 'dec') return 'right'
      const hdr = (hdrs[C] || '').trim().toLowerCase()
      if (
        hdr === '#' || hdr === 'no.' || hdr === 'region' || hdr === 'center' ||
        hdr === 'batch' || hdr === 'milk type' || hdr === 'prep' || hdr === 'ongoing' ||
        hdr === 'awarded (del)' || hdr === 'awarded (ong)' || hdr === 'done' ||
        hdr === 'failed' || hdr === 'status' || hdr === 'procurement status' ||
        hdr === 'payment status' || hdr.includes('date')
      ) {
        return 'center'
      }
      return 'left'
    }

    // Number format strings
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

      // Assign row height for breathable enterprise look
      if (isHeader) rowHeights.push({ hpt: 28 })
      else if (isTotal) rowHeights.push({ hpt: 25 })
      else rowHeights.push({ hpt: 20 })

      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        if (!ws[addr]) ws[addr] = { v: '', t: 's' }
        const cell = ws[addr] as any
        const ct = colTypes[C] || 'text'
        const hdr = (hdrs[C] || '').toLowerCase()

        if (isHeader) {
          // ── HEADER ROW (Light slate #E2E8F0, dark bold text #1E293B, border #CBD5E1) ──
          cell.s = {
            font: { bold: true, color: { rgb: '1E293B' }, sz: 10.5, name: 'Calibri' },
            fill: { patternType: 'solid', fgColor: { rgb: 'E2E8F0' } },
            border: {
              top:    { style: 'thin',   color: { rgb: 'CBD5E1' } },
              bottom: { style: 'medium', color: { rgb: '94A3B8' } },
              left:   { style: 'thin',   color: { rgb: 'CBD5E1' } },
              right:  { style: 'thin',   color: { rgb: 'CBD5E1' } },
            },
            alignment: {
              horizontal: getColAlign(C),
              vertical: 'center',
              wrapText: true,
            },
          }
        } else if (isTotal) {
          // ── TOTAL ROW (Soft blue #DBEAFE, bold navy #1E3A8A, double bottom underline) ──
          const totalAlign = C === 0 ? 'center' : getColAlign(C)
          let totalFontColor = '1E3A8A'
          if (hdr.includes('delivered pack') || hdr.includes('delivered volume')) {
            totalFontColor = '047857' // emerald green
          } else if (hdr.includes('packs to deliver') || hdr.includes('contracted volume')) {
            totalFontColor = '1E40AF' // blue
          } else if (hdr === 'coops') {
            totalFontColor = '0F766E' // teal
          }

          cell.s = {
            font: { bold: true, color: { rgb: totalFontColor }, sz: 10.5, name: 'Calibri' },
            fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
            border: {
              top:    { style: 'medium', color: { rgb: '3B82F6' } },
              bottom: { style: 'double', color: { rgb: '1E3A8A' } },
              left:   { style: 'thin',   color: { rgb: '93C5FD' } },
              right:  { style: 'thin',   color: { rgb: '93C5FD' } },
            },
            alignment: {
              horizontal: totalAlign,
              vertical: 'center',
            },
          }
          if (XL_FMT[ct] && typeof cell.v === 'number') {
            cell.z = XL_FMT[ct]
          }
        } else {
          // ── DATA ROW (Alternating white / soft slate #F8FAFC) ──
          const align = getColAlign(C)
          let cellFontColor = '1E293B'
          let isBold = C === 0 && (ct === 'text' || ct === 'num')

          const numVal = typeof cell.v === 'number' ? cell.v : Number(cell.v)
          if (!isNaN(numVal) && numVal > 0) {
            if (hdr.includes('delivered pack') || hdr.includes('delivered volume') || hdr.includes('volume delivered')) {
              cellFontColor = '047857' // emerald green
              isBold = true
            } else if (hdr.includes('packs to deliver') || hdr.includes('contracted volume')) {
              cellFontColor = '1E40AF' // blue
              isBold = true
            } else if (hdr === 'coops') {
              cellFontColor = '0F766E' // teal
              isBold = true
            } else if (hdr === 'done' || hdr === 'completed') {
              cellFontColor = '047857' // green
              isBold = true
            } else if (hdr === 'failed') {
              cellFontColor = 'B91C1C' // red
              isBold = true
            }
          }

          cell.s = {
            font: {
              sz: 10,
              name: 'Calibri',
              bold: isBold,
              color: { rgb: cellFontColor },
            },
            fill: {
              patternType: 'solid',
              fgColor: { rgb: isEvenData ? 'FFFFFF' : 'F8FAFC' },
            },
            border: {
              top:    { style: 'thin', color: { rgb: 'CBD5E1' } },
              bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
              left:   { style: 'thin', color: { rgb: 'CBD5E1' } },
              right:  { style: 'thin', color: { rgb: 'CBD5E1' } },
            },
            alignment: {
              horizontal: align,
              vertical: 'center',
            },
          }
          if (XL_FMT[ct] && typeof cell.v === 'number') {
            cell.z = XL_FMT[ct]
          }
        }
      }
    }

    // Auto-fit column widths
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
        const c2 = ws[XLSX.utils.encode_cell({ r: R, c: C })]
        if (c2 && c2.v != null) {
          const len = String(c2.v).length
          if (len > max) max = len
        }
      }
      colWidths.push(Math.max(minW, Math.min(max + 3, 45)))
    }

    ws['!cols'] = colWidths.map(w => ({ wch: w }))
    ws['!rows'] = rowHeights
    // Freeze header row and ensure grid lines are visible
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
    ws['!views'] = [{ state: 'frozen', ySplit: 1, showGridLines: true }]
    return ws
  }

  /** Build dataset metadata and rows for any tab */
  const getTabExportData = (targetTab: ReportTab): TabExportData => {
    const dateStr = new Date().toISOString().split('T')[0]
    let sheetName = 'Sheet1'
    let filename = `sbfp_${year}_${dateStr}.xlsx`
    let headers: string[] = []
    let rows: Array<Array<string | number>> = []
    let colTypes: ColType[] = []

    if (targetTab === 'master') {
      sheetName = 'SDO Masterlist'
      filename = `sbfp_sdo_masterlist_${year}_${dateStr}.xlsx`
      headers = [
        'No.', 'Region', 'Schools Division Office (SDO)', 'Center', 'Procurement Status',
        'Milk Type', 'Amount (PHP)', 'Mode of Procurement', 'PR Date Received', 'PR Number',
        'ORS Date', 'PO Number', 'Batch', 'Beneficiaries', 'Contract Amount (PHP)',
        'Delivery Start', 'Delivery End', 'Packs to Deliver', 'Delivered Packs',
        'Payment Status', 'Remarks',
      ]
      rows = filteredRecords.flatMap((r, idx) => {
        const v = getViewForSource(r.id)
        if (!v) return []
        return [[
          sdoIndexMeta[idx]?.number ?? idx + 1,
          v.region === '—' ? '' : v.region,
          v.sdo === '—' ? '' : v.sdo,
          v.center,
          v.procurement_status,
          v.milk_type,
          v.amount,
          v.mode_of_procurement === '—' ? '' : v.mode_of_procurement,
          v.pr_date_received === '—' ? '' : v.pr_date_received,
          v.pr_number === '—' ? '' : v.pr_number,
          v.ors_date === '—' ? '' : v.ors_date,
          v.po_number === '—' ? '' : v.po_number,
          v.batch === '—' ? '' : v.batch,
          v.beneficiaries_pm,
          v.contract_amount,
          v.delivery_start === '—' ? '' : v.delivery_start,
          v.delivery_end === '—' ? '' : v.delivery_end,
          v.packs_to_deliver,
          v.delivered_packs,
          v.status_of_payment === '—' ? '' : v.status_of_payment,
          v.remarks === '—' ? '' : v.remarks,
        ]]
      })
      rows.push([
        'TOTAL', '', `${stats.count} SDOs`, '', `${stats.rowCount} rows`,
        '', stats.totalAmount, '', '', '', '', '', '', stats.totalBeneficiaries,
        stats.totalContractAmt, '', '', stats.totalPacks, stats.totalDelivered, '', '',
      ])
      colTypes = ['num','text','text','text','text','text','cur','text','text','text','text','text','text','num','cur','text','text','num','num','text','text']

    } else if (targetTab === 'region_summary') {
      sheetName = 'Regional Summary'
      filename = `sbfp_regional_summary_${year}_${dateStr}.xlsx`
      headers = [
        'Region', 'No. of SDOs', 'Coops', 'Beneficiaries', 'Contract Amt (PHP)',
        'Packs to Deliver', 'Delivered Packs', '% Delivered',
        'Prep', 'Ongoing', 'Awarded (Del)', 'Awarded (Ong)', 'Done', 'Failed',
      ]
      rows = regionalSummary.map(reg => {
        const pct = reg.targetPacks > 0 ? (reg.deliveredPacks / reg.targetPacks) * 100 : 0
        return [
          reg.region, reg.sdoCount, reg.coopCount, reg.beneficiaries, reg.contractAmt,
          reg.targetPacks, reg.deliveredPacks, Number(pct.toFixed(1)),
          reg.forPrep, reg.ongoing, reg.awardedDelivery, reg.awardedOngoing, reg.completed, reg.failed,
        ]
      })
      rows.push([
        'TOTAL', stats.count, stats.totalCoops, stats.totalBeneficiaries, stats.totalContractAmt,
        stats.totalPacks, stats.totalDelivered, Number(stats.pctDelivered.toFixed(1)),
        '', '', '', '', '', '',
      ])
      colTypes = ['text','num','num','num','cur','num','num','pct','num','num','num','num','num','num']

    } else if (targetTab === 'center_summary') {
      sheetName = 'Center Summary'
      filename = `sbfp_center_summary_${year}_${dateStr}.xlsx`
      headers = [
        'Center', 'No. of SDOs', 'Coops', 'Beneficiaries', 'Contract Amt (PHP)',
        'Packs to Deliver', 'Delivered Packs', '% Delivered',
        'Prep', 'Ongoing', 'Awarded (Del)', 'Awarded (Ong)', 'Done', 'Failed',
      ]
      rows = centerSummary.map(c => {
        const pct = c.targetPacks > 0 ? (c.deliveredPacks / c.targetPacks) * 100 : 0
        return [
          c.center, c.sdoCount, c.coopCount, c.beneficiaries, c.contractAmt,
          c.targetPacks, c.deliveredPacks, Number(pct.toFixed(1)),
          c.forPrep, c.ongoing, c.awardedDelivery, c.awardedOngoing, c.completed, c.failed,
        ]
      })
      rows.push([
        'TOTAL', stats.count, stats.totalCoops, stats.totalBeneficiaries, stats.totalContractAmt,
        stats.totalPacks, stats.totalDelivered, Number(stats.pctDelivered.toFixed(1)),
        '', '', '', '', '', '',
      ])
      colTypes = ['text','num','num','num','cur','num','num','pct','num','num','num','num','num','num']

    } else if (targetTab === 'status_matrix') {
      sheetName = 'Status Breakdown'
      filename = `sbfp_status_breakdown_${year}_${dateStr}.xlsx`
      headers = ['Status', 'SDO Count', '% Share']
      rows = distinctStatuses.map(({ value, label }) => {
        const count = stats.statusCounts[value] || 0
        const pct = stats.rowCount > 0 ? (count / stats.rowCount) * 100 : 0
        return [label, count, Number(pct.toFixed(1))]
      })
      rows.push(['TOTAL', stats.rowCount, 100.0])
      colTypes = ['text','num','pct']

    } else if (targetTab === 'senate_perf') {
      sheetName = 'Procurement & Delivery'
      filename = `sbfp_procurement_delivery_${year}_${dateStr}.xlsx`
      headers = ['Metric', 'Value']
      rows = [
        ['Scope', 'PCC milk component only'],
        ['Total value of milk contracts (PHP)', stats.totalContractAmt],
        ['Total contracted volume (L)', stats.totalContractedL],
        ['Actual amount paid/disbursed (PHP)', stats.totalPaid],
        ['Remaining to pay (PHP)', stats.totalRemainingPay],
        ['Actual volume delivered (L)', stats.totalDeliveredL],
        ['Undelivered volume (L)', stats.totalUndeliveredL],
        ['Value of delivered milk (PHP)', stats.totalValueDelivered],
        ['Delivery/accomplishment rate (%)', Number(stats.pctDelivered.toFixed(1))],
        ['Disbursement rate (%)', stats.totalContractAmt > 0 ? Number(((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1)) : 0],
      ]
      colTypes = ['text','dec']

    } else if (targetTab === 'senate_status') {
      sheetName = 'Implementation Status'
      filename = `sbfp_implementation_status_${year}_${dateStr}.xlsx`
      headers = [
        'Status', 'SDOs', 'Contracted value (PHP)', 'Amount paid (PHP)',
        'Remaining to pay (PHP)', 'Contracted volume (L)', 'Delivered volume (L)',
        'Undelivered volume (L)', 'Remaining contract value (PHP)',
      ]
      rows = SBFP_PROCUREMENT_STATUSES.map(status => {
        const b = implSummary.buckets[status]
        return [
          status, b.sdoCount, b.contractAmt, b.paidAmt, b.remainingPay,
          b.contractedL, b.deliveredL, b.undeliveredL, b.remainingContract,
        ] as Array<string | number>
      })
      rows.push([
        'TOTAL', stats.count, stats.totalContractAmt, stats.totalPaid, stats.totalRemainingPay,
        stats.totalContractedL, stats.totalDeliveredL, stats.totalUndeliveredL, stats.totalRemainingContract,
      ])
      colTypes = ['text','num','cur','cur','cur','dec','dec','dec','cur']

    } else if (targetTab === 'senate_region') {
      sheetName = 'Regional Distribution'
      filename = `sbfp_regional_distribution_${year}_${dateStr}.xlsx`
      headers = [
        'Region', 'SDOs', 'Contracted value (PHP)', 'Contracted volume (L)',
        'Amount paid (PHP)', 'Delivered volume (L)', 'Value delivered (PHP)',
        'Delivery rate (%)', 'Disbursement rate (%)',
      ]
      rows = regionalSummary.map(reg => [
        reg.region, reg.sdoCount, reg.contractAmt, reg.contractedL,
        reg.paidAmt, reg.deliveredL, reg.valueDelivered,
        Number(reg.pctDelivered.toFixed(1)), Number(reg.pctDisbursed.toFixed(1)),
      ])
      rows.push([
        'TOTAL', stats.count, stats.totalContractAmt, stats.totalContractedL,
        stats.totalPaid, stats.totalDeliveredL, stats.totalValueDelivered,
        Number(stats.pctDelivered.toFixed(1)),
        stats.totalContractAmt > 0 ? Number(((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1)) : 0,
      ])
      colTypes = ['text','num','cur','dec','cur','dec','cur','pct','pct']

    } else if (targetTab === 'senate_center') {
      sheetName = 'Center Distribution'
      filename = `sbfp_center_distribution_${year}_${dateStr}.xlsx`
      headers = [
        'Center', 'SDOs', 'Contracted value (PHP)', 'Contracted volume (L)',
        'Amount paid (PHP)', 'Delivered volume (L)', 'Value delivered (PHP)',
        'Delivery rate (%)', 'Disbursement rate (%)',
      ]
      rows = centerSummary.map(c => [
        c.center, c.sdoCount, c.contractAmt, c.contractedL,
        c.paidAmt, c.deliveredL, c.valueDelivered,
        Number(c.pctDelivered.toFixed(1)), Number(c.pctDisbursed.toFixed(1)),
      ])
      rows.push([
        'TOTAL', stats.count, stats.totalContractAmt, stats.totalContractedL,
        stats.totalPaid, stats.totalDeliveredL, stats.totalValueDelivered,
        Number(stats.pctDelivered.toFixed(1)),
        stats.totalContractAmt > 0 ? Number(((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1)) : 0,
      ])
      colTypes = ['text','num','cur','dec','cur','dec','cur','pct','pct']

    } else if (targetTab === 'senate_sdo') {
      sheetName = 'SDO Worksheet'
      filename = `sbfp_sdo_worksheet_${year}_${dateStr}.xlsx`
      headers = [
        'No.', 'Region', 'Center', 'SDO', 'Milk type', 'Status', 'Beneficiaries',
        'Packs to deliver', 'Delivered packs', 'Contracted value (PHP)', 'Amount paid (PHP)',
        'Remaining to pay (PHP)', 'Contracted volume (L)', 'Delivered volume (L)',
        'Undelivered volume (L)', 'Value delivered (PHP)', 'Remaining contract (PHP)',
        'Delivery rate (%)', 'Disbursement rate (%)', 'Remarks',
      ]
      rows = sdoSenateRows.map(row => [
        row.sdoSpan > 0 ? row.number : '',
        row.region, row.center, row.sdo, row.milkType, row.status, row.beneficiaries,
        row.targetPacks, row.deliveredPacks, row.contractAmt, row.paidAmt,
        row.remainingPay, row.contractedL, row.deliveredL,
        row.undeliveredL, row.valueDelivered, row.remainingContract,
        Number(row.pctDelivered.toFixed(1)), Number(row.pctDisbursed.toFixed(1)), row.remarks,
      ])
      rows.push([
        'TOTAL', '', '', `${stats.count} SDOs`, '', `${stats.rowCount} rows`,
        stats.totalBeneficiaries, stats.totalPacks, stats.totalDelivered,
        stats.totalContractAmt, stats.totalPaid, stats.totalRemainingPay,
        stats.totalContractedL, stats.totalDeliveredL, stats.totalUndeliveredL,
        stats.totalValueDelivered, stats.totalRemainingContract,
        Number(stats.pctDelivered.toFixed(1)),
        stats.totalContractAmt > 0 ? Number(((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1)) : 0,
        '',
      ])
      colTypes = ['num','text','text','text','text','text','num','num','num','cur','cur','cur','dec','dec','dec','cur','cur','pct','pct','text']

    } else if (targetTab === 'senate_delivery') {
      sheetName = 'Contract & Delivery'
      filename = `sbfp_contract_delivery_${year}_${dateStr}.xlsx`
      headers = [
        'No.', 'SDO', 'Region', 'Center', 'Contract Value (PHP)', 'Contracted Volume (L)',
        'Volume Delivered (L)', 'Amount Paid (PHP)', 'Delivery Rate (%)', 'Status',
        'Procurement Status',
      ]
      rows = deliveryDetailsRows.map(row => [
        row.sdoSpan > 0 ? row.number : '',
        row.sdo, row.region, row.center, row.contractValue, row.contractedVolumeLiters,
        row.volumeDelivered, row.amountPaid, Number(row.deliveryRate.toFixed(1)),
        row.status, row.procurementStatus,
      ])
      rows.push([
        'TOTAL', '', '',
        `${deliveryDetailsRows.filter(r => r.sdoSpan > 0).length} SDOs / ${deliveryDetailsRows.length} rows`,
        deliveryDetailsRows.reduce((s, r) => s + r.contractValue, 0),
        deliveryDetailsRows.reduce((s, r) => s + r.contractedVolumeLiters, 0),
        deliveryDetailsRows.reduce((s, r) => s + r.volumeDelivered, 0),
        deliveryDetailsRows.reduce((s, r) => s + r.amountPaid, 0),
        deliveryDetailsRows.reduce((s, r) => s + r.contractedVolumeLiters, 0) > 0
          ? Number(((deliveryDetailsRows.reduce((s, r) => s + r.volumeDelivered, 0) /
              deliveryDetailsRows.reduce((s, r) => s + r.contractedVolumeLiters, 0)) * 100).toFixed(1))
          : 0,
        `${deliveryDetailsRows.filter(r => r.status === 'Completed').length} Completed / ${deliveryDetailsRows.filter(r => r.status === 'Ongoing').length} Ongoing`,
        '',
      ])
      colTypes = ['num','text','text','text','cur','dec','dec','cur','pct','text','text']
    }

    return { sheetName, filename, headers, rows, colTypes }
  }

  /** Export the currently active tab to a single-sheet styled Excel (.xlsx) file. */
  const exportToExcel = (targetTab?: ReportTab) => {
    if (filteredRecords.length === 0) {
      alert('No data to export.')
      return
    }
    const tabToExport = targetTab || activeTab
    const data = getTabExportData(tabToExport)

    // Build styled workbook and download
    const wb = XLSX.utils.book_new()
    const ws = buildStyledSheet(data.headers, data.rows, data.colTypes)
    XLSX.utils.book_append_sheet(wb, ws, data.sheetName)
    XLSX.writeFile(wb, data.filename)
  }

  /** Export all report tabs into one multi-sheet styled Excel (.xlsx) workbook. */
  const exportAllTabsToExcel = () => {
    if (filteredRecords.length === 0) {
      alert('No data to export.')
      return
    }
    const allTabIds: ReportTab[] = [
      'master', 'region_summary', 'center_summary', 'status_matrix',
      'senate_perf', 'senate_status', 'senate_region', 'senate_center',
      'senate_sdo', 'senate_delivery',
    ]
    const dateStr = new Date().toISOString().split('T')[0]
    const wb = XLSX.utils.book_new()

    for (const tabId of allTabIds) {
      const data = getTabExportData(tabId)
      const ws = buildStyledSheet(data.headers, data.rows, data.colTypes)
      XLSX.utils.book_append_sheet(wb, ws, data.sheetName)
    }

    XLSX.writeFile(wb, `sbfp_all_tabs_complete_${year}_${dateStr}.xlsx`)
  }

  const clearFilters = () => {
    setFilterRegion('ALL')
    setFilterCenter('ALL')
    setFilterStatus('ALL')
    setFilterMonth('')
    setSearchQuery('')
    setDeliveredDateFilterEnabled(false)
    if (Number.isFinite(dbYearNum)) {
      const { from, to } = defaultDeliveredPackRange(dbYearNum)
      setDeliveredFrom(from)
      setDeliveredTo(to)
    }
  }

  const clearDeliveredDateFilter = () => {
    setDeliveredDateFilterEnabled(false)
    if (Number.isFinite(dbYearNum)) {
      const { from, to } = defaultDeliveredPackRange(dbYearNum)
      setDeliveredFrom(from)
      setDeliveredTo(to)
    }
  }

  const formatRangeLabel = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', overflow: 'hidden' }}>
      
      {/* ?? Filter Toolbar ?? */}
      <div className="no-print" style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0.875rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        zIndex: 10
      }}>
        {/* Top Controls Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Year</div>
              <select value={year} onChange={e => setYear(e.target.value)}
                style={{ height: 34, padding: '0 0.75rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff', fontWeight: 600 }}>
                {schoolYearOptions.map(sy => {
                  const dbY = String(schoolYearToDbYear(sy))
                  return (
                    <option key={sy} value={dbY}>SY {sy}</option>
                  )
                })}
              </select>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Center</div>
              {lockedCenter ? (
                <div
                  style={{
                    height: 34,
                    padding: '0 0.75rem',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    background: '#f1f5f9',
                    color: '#334155',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: 120,
                  }}
                  title="Locked to your assigned center"
                >
                  {lockedCenter}
                </div>
              ) : (
                <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)}
                  style={{ height: 34, padding: '0 0.75rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}>
                  <option value="ALL">All Centers ({distinctCenters.length})</option>
                  {distinctCenters.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Region</div>
              <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
                style={{ height: 34, padding: '0 0.75rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}>
                <option value="ALL">All Regions ({distinctRegions.length})</option>
                {distinctRegions.map(r => <option key={r} value={r}>Region {r}</option>)}
              </select>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Procurement Status</div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ height: 34, padding: '0 0.75rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}>
                <option value="ALL">All Statuses</option>
                {distinctStatuses.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Search SDO</div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 8, top: 10, color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search division or PO..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ height: 34, paddingLeft: 28, paddingRight: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', width: 170 }}
                />
              </div>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={clearFilters}
              title="Reset all filters"
              style={{
                height: 34, padding: '0 0.75rem', borderRadius: 6, border: '1px solid #e2e8f0',
                background: '#f8fafc', color: '#64748b', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} /> Reset
            </button>

            <button
              onClick={exportToCSV}
              style={{
                height: 34, padding: '0 1rem', borderRadius: 6, border: '1px solid #059669',
                background: '#10b981', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <Download size={15} /> Export as .CSV
            </button>

            <button
              onClick={() => exportToExcel()}
              title="Export the currently active tab as a styled Excel file (.xlsx)"
              style={{
                height: 34, padding: '0 0.85rem', borderRadius: 6, border: '1px solid #1d6b3f',
                background: '#217346', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <FileDown size={15} /> Export as .xlsx
            </button>

            <button
              onClick={exportAllTabsToExcel}
              title="Export all 10 tabs into a single styled multi-sheet Excel workbook (.xlsx)"
              style={{
                height: 34, padding: '0 0.75rem', borderRadius: 6, border: '1px solid #cbd5e1',
                background: '#ffffff', color: '#217346', fontSize: '0.82rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <Layers size={14} /> All Tabs (.xlsx)
            </button>

            <button
              onClick={() => window.print()}
              style={{
                height: 34, padding: '0 1rem', borderRadius: 6, border: '1px solid #2563eb',
                background: '#3b82f6', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <Printer size={15} /> Print Report
            </button>
          </div>
        </div>

        {/* Bottom Date Range & View Tabs Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={13} /> Delivery Month:
            </span>
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              title="Show SDOs with packs delivered in this calendar month (encoder data)"
              style={{ height: 28, padding: '0 0.5rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem', background: '#fff' }}
            >
              <option value="">All Months</option>
              {DELIVERY_MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <div style={{ marginLeft: 12, borderLeft: '1px solid #e2e8f0', paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
                title="When off, all SDOs are listed and delivered packs use the full school year (Aug 1 – today)."
              >
                <input
                  type="checkbox"
                  checked={deliveredDateFilterEnabled}
                  onChange={e => setDeliveredDateFilterEnabled(e.target.checked)}
                />
                Delivered date range
              </label>
              <span style={{ fontSize: '0.78rem', color: deliveredDateFilterEnabled ? '#64748b' : '#94a3b8' }}>From</span>
              <input
                type="date"
                value={deliveredFrom}
                disabled={!deliveredDateFilterEnabled}
                onChange={e => setDeliveredFrom(e.target.value)}
                title="Start of delivery period (inclusive)."
                style={{
                  height: 28, padding: '0 0.5rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem',
                  opacity: deliveredDateFilterEnabled ? 1 : 0.55,
                }}
              />
              <span style={{ fontSize: '0.78rem', color: deliveredDateFilterEnabled ? '#64748b' : '#94a3b8' }}>To</span>
              <input
                type="date"
                value={deliveredTo}
                min={deliveredFrom}
                disabled={!deliveredDateFilterEnabled}
                onChange={e => setDeliveredTo(e.target.value)}
                title="End of delivery period (inclusive). Partial months are prorated from encoder monthly totals."
                style={{
                  height: 28, padding: '0 0.5rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem',
                  opacity: deliveredDateFilterEnabled ? 1 : 0.55,
                }}
              />
              {deliveredDateFilterEnabled ? (
                <button
                  type="button"
                  onClick={clearDeliveredDateFilter}
                  title="Show all SDOs; delivered packs use full school year totals"
                  style={{
                    height: 28, padding: '0 0.5rem', borderRadius: 4, border: '1px solid #e2e8f0',
                    background: '#f8fafc', color: '#475569', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  Show all SDOs
                </button>
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: 220 }}>
                  All SDOs · delivered packs = Aug 1 – today
                </span>
              )}
            </div>

            <label style={{ marginLeft: 12, borderLeft: '1px solid #e2e8f0', paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeExcluded} onChange={e => setIncludeExcluded(e.target.checked)} />
              Show SDOs not marked “In Report?”
            </label>
          </div>

          {/* View Mode Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', background: '#f1f5f9', padding: 2, borderRadius: 6, gap: 2 }}>
            {([
              ['master', 'SDO Masterlist', Table],
              ['region_summary', 'Regional Summary', BarChart2],
              ['center_summary', 'Center Summary', Building2],
              ['status_matrix', 'Status Breakdown', Layers],
              ['senate_perf', '1. Procurement & Delivery', CircleDollarSign],
              ['senate_status', '2. Implementation Status', ClipboardList],
              ['senate_region', '3. Regional Distribution', MapPinned],
              ['senate_center', '4. Center Distribution', Building2],
              ['senate_sdo', '5. SDO Worksheet', FileSpreadsheet],
              ['senate_delivery', '6. Contract & Delivery Details', CircleDollarSign],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: activeTab === id ? '#ffffff' : 'transparent',
                  color: activeTab === id ? '#1e293b' : '#64748b',
                  boxShadow: activeTab === id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 5
                }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ?? KPI Summary Cards ?? */}
      <div className="no-print" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem',
        padding: '0.75rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{ background: '#ffffff', padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Filtered SDOs</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1e293b', marginTop: 2 }}>{stats.count.toLocaleString()}</div>
        </div>

        <div style={{ background: '#ffffff', padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Packs to Deliver</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb', marginTop: 2 }}>{stats.totalPacks.toLocaleString()}</div>
        </div>

        <div style={{ background: '#ffffff', padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div
            style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}
            title={
              deliveredDateFilterEnabled
                ? `${formatRangeLabel(effectiveDeliveredRange.from)} – ${formatRangeLabel(effectiveDeliveredRange.to)}`
                : `Full SY: ${formatRangeLabel(effectiveDeliveredRange.from)} – ${formatRangeLabel(effectiveDeliveredRange.to)}`
            }
          >
            Delivered Packs
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#059669', marginTop: 2 }}>
            {stats.totalDelivered.toLocaleString()}
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981', marginLeft: 6 }}>({stats.pctDelivered.toFixed(1)}%)</span>
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Contract Amount</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309', marginTop: 2 }}>{fmtPeso(stats.totalContractAmt)}</div>
        </div>

        <div style={{ background: '#ffffff', padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Beneficiaries</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>{stats.totalBeneficiaries.toLocaleString()}</div>
        </div>

        <div style={{ background: '#ffffff', padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Coops Participating</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f766e', marginTop: 2 }}>{stats.totalCoops.toLocaleString()}</div>
        </div>
      </div>

      {/* Compact per-region unique coop counts */}
      {regionalSummary.length > 0 && (
        <div
          className="no-print"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.35rem 0.4rem',
            padding: '0.4rem 1.5rem 0.55rem',
            background: '#fff',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginRight: 4,
            }}
          >
            Coops by region
          </span>
          {regionalSummary.map(reg => {
            const active = reg.coopCount > 0
            return (
              <span
                key={reg.region}
                title={`${reg.coopCount} unique cooperative(s) in Region ${reg.region}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '0.15rem 0.45rem',
                  borderRadius: 999,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  background: active ? '#ccfbf1' : '#f8fafc',
                  border: `1px solid ${active ? '#5eead4' : '#e2e8f0'}`,
                  color: active ? '#0f766e' : '#94a3b8',
                }}
              >
                {reg.region}
                <span style={{ fontWeight: 800, color: active ? '#115e59' : '#cbd5e1' }}>{reg.coopCount}</span>
              </span>
            )
          })}
        </div>
      )}
      {/* ?? Main Content Area ?? */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
        
        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
            Loading SBFP monitoring dataset...
          </div>
        )}

        {!loading && (
          <>
            {/* VIEW 1: SDO Masterlist Spreadsheet Table */}
            {activeTab === 'master' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                
                <div className="print-only" style={{ display: 'none', padding: '1rem 1rem 0.5rem', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, textTransform: 'uppercase' }}>
                    School-Based Feeding Program (SBFP) — Milk Procurement Monitoring Report
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                    Live from each center&apos;s SBFP SDO procurement table (same fields as Section 1). Refresh after encoding; use Delivered Packs From/To for the reporting period.
                  </p>
                  <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: 4 }}>
                    FY {year} | Filtered as of: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
                  <table style={{ width: '100%', minWidth: 2000, borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#1e293b', borderBottom: '2px solid #94a3b8' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 45, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>#</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 75, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Region</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 170, textAlign: 'left', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>SDO Division</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 85, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Center</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 165, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Procurement Status</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Milk Type</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 110, textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Amount ({PESO})</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', minWidth: 130, textAlign: 'left', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Mode of Procurement</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>PR Date</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', minWidth: 110, textAlign: 'left', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>PR Number</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>ORS Date</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', minWidth: 110, textAlign: 'left', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>PO Number</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 75, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Batch</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Beneficiaries</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 120, textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Contract Amt ({PESO})</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Delivery Start</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Delivery End</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 115, textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Packs to Deliver</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 115, textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Delivered Packs</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 105, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Payment Status</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 160, textAlign: 'left', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.length === 0 && (
                        <tr>
                          <td colSpan={21} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                            No records found matching the active filters.
                          </td>
                        </tr>
                      )}
                      {filteredRecords.map((r, i) => {
                        const v = getViewForSource(r.id)
                        if (!v) return null
                        const statusCfg = STATUS_BADGE[v.procurement_status] || { bg: '#f1f5f9', color: '#475569' }
                        const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc'
                        const delivered = v.delivered_packs
                        const idxMeta = sdoIndexMeta[i] || { number: i + 1, rowSpan: 1 }

                        return (
                          <tr key={r.id || i} style={{ background: rowBg }}>
                            {idxMeta.rowSpan > 0 && (
                              <td
                                rowSpan={idxMeta.rowSpan}
                                style={{
                                  border: '1px solid #cbd5e1',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  color: '#64748b',
                                  fontWeight: 700,
                                  verticalAlign: 'middle',
                                  background: idxMeta.rowSpan > 1 ? '#f1f5f9' : undefined,
                                }}
                              >
                                {idxMeta.number}
                              </td>
                            )}
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>{v.region}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', fontWeight: 600, color: '#0f172a' }}>{v.sdo}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', color: '#475569' }}>{v.center}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                                fontSize: '0.72rem', fontWeight: 700, background: statusCfg.bg, color: statusCfg.color
                              }}>
                                {v.procurement_status}
                              </span>
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', color: '#475569' }}>{v.milk_type}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right' }}>
                              {v.amount > 0 ? fmtPeso(v.amount) : '—'}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>{v.mode_of_procurement}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center' }}>{v.pr_date_received}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>{v.pr_number}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center' }}>{v.ors_date}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>{v.po_number}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center' }}>{v.batch}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                              {v.beneficiaries_pm > 0 ? v.beneficiaries_pm.toLocaleString() : '—'}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                              {v.contract_amount > 0 ? fmtPeso(v.contract_amount) : '—'}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center' }}>{v.delivery_start}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center' }}>{v.delivery_end}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>
                              {v.packs_to_deliver > 0 ? v.packs_to_deliver.toLocaleString() : '—'}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: '#065f46', background: delivered > 0 ? '#f0fdf4' : undefined }}>
                              {delivered > 0 ? delivered.toLocaleString() : '—'}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center' }}>{v.status_of_payment}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', color: '#475569' }}>{v.remarks}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    
                    {/* Totals Summary Footer */}
                    {filteredRecords.length > 0 && (
                      <tfoot>
                        <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800, borderTop: '2px solid #3b82f6' }}>
                          <td colSpan={6} style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'left' }}>
                            GRAND TOTAL ({stats.count} SDOs · {stats.rowCount} rows)
                          </td>
                          <td style={{ border: '1px solid #93c5fd', padding: '8px', textAlign: 'right' }}>
                            {fmtPeso(stats.totalAmount)}
                          </td>
                          <td colSpan={6} style={{ border: '1px solid #93c5fd' }}></td>
                          <td style={{ border: '1px solid #93c5fd', padding: '8px', textAlign: 'right' }}>
                            {stats.totalBeneficiaries.toLocaleString()}
                          </td>
                          <td style={{ border: '1px solid #93c5fd', padding: '8px', textAlign: 'right' }}>
                            {fmtPeso(stats.totalContractAmt)}
                          </td>
                          <td colSpan={2} style={{ border: '1px solid #93c5fd' }}></td>
                          <td style={{ border: '1px solid #93c5fd', padding: '8px', textAlign: 'right' }}>
                            {stats.totalPacks.toLocaleString()}
                          </td>
                          <td style={{ border: '1px solid #93c5fd', padding: '8px', textAlign: 'right', color: '#047857' }}>
                            {stats.totalDelivered.toLocaleString()}
                          </td>
                          <td colSpan={2} style={{ border: '1px solid #93c5fd' }}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
            {/* VIEW 2: Regional Summary Spreadsheet Table */}
            {activeTab === 'region_summary' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    Regional Milk Procurement & Delivery Matrix
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    Aggregated by standard administrative regions
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'center', width: 90 }}>Region</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right', width: 90 }}>No. of SDOs</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right', width: 90 }}>Coops</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Beneficiaries</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Contract Amt ({PESO})</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Packs to Deliver</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Delivered Packs</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>% Delivered</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Prep</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Ongoing</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 90 }}>Awarded (Del)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 90 }}>Awarded (Ong)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Done</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionalSummary.map((reg, i) => {
                        const pct = reg.targetPacks > 0 ? (reg.deliveredPacks / reg.targetPacks) * 100 : 0
                        return (
                          <tr key={reg.region} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'center', fontWeight: 800 }}>{reg.region}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{reg.sdoCount}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{reg.coopCount || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right' }}>{reg.beneficiaries.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right' }}>{fmtPeso(reg.contractAmt)}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{reg.targetPacks.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{reg.deliveredPacks.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{reg.forPrep || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{reg.ongoing || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{reg.awardedDelivery || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{reg.awardedOngoing || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#047857' }}>{reg.completed || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#b91c1c' }}>{reg.failed || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'center' }}>TOTAL</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.count}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right', color: '#0f766e' }}>{stats.totalCoops}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.totalBeneficiaries.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{fmtPeso(stats.totalContractAmt)}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.totalPacks.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right', color: '#047857' }}>{stats.totalDelivered.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.pctDelivered.toFixed(1)}%</td>
                        <td colSpan={6} style={{ border: '1px solid #93c5fd' }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* VIEW 2b: Center Summary — same format as regional, grouped by center */}
            {activeTab === 'center_summary' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    Center Milk Procurement & Delivery Matrix
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    Aggregated by PCC center (same columns as Regional Summary)
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'center', width: 120 }}>Center</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right', width: 90 }}>No. of SDOs</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right', width: 90 }}>Coops</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Beneficiaries</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Contract Amt ({PESO})</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Packs to Deliver</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Delivered Packs</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>% Delivered</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Prep</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Ongoing</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 90 }}>Awarded (Del)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 90 }}>Awarded (Ong)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Done</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {centerSummary.map((c, i) => {
                        const pct = c.targetPacks > 0 ? (c.deliveredPacks / c.targetPacks) * 100 : 0
                        return (
                          <tr key={c.center} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'center', fontWeight: 800 }}>{c.center}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{c.sdoCount}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{c.coopCount || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right' }}>{c.beneficiaries.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right' }}>{fmtPeso(c.contractAmt)}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{c.targetPacks.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{c.deliveredPacks.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{c.forPrep || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{c.ongoing || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{c.awardedDelivery || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{c.awardedOngoing || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#047857' }}>{c.completed || '—'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#b91c1c' }}>{c.failed || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'center' }}>TOTAL</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.count}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right', color: '#0f766e' }}>{stats.totalCoops}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.totalBeneficiaries.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{fmtPeso(stats.totalContractAmt)}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.totalPacks.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right', color: '#047857' }}>{stats.totalDelivered.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.pctDelivered.toFixed(1)}%</td>
                        <td colSpan={6} style={{ border: '1px solid #93c5fd' }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* VIEW 3: Status Breakdown Matrix */}
            {activeTab === 'status_matrix' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxWidth: 800 }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    Procurement Status Distribution
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    SDO counts and breakdown according to current procurement stage
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', fontFamily: 'Arial, sans-serif' }}>
                  <thead>
                    <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: '8px 12px', textAlign: 'left' }}>Status</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '8px 12px', textAlign: 'right', width: 120 }}>SDO Count</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '8px 12px', textAlign: 'right', width: 120 }}>% Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distinctStatuses.map(({ value, label }) => {
                      const count = stats.statusCounts[value] || 0
                      const pct = stats.rowCount > 0 ? (count / stats.rowCount) * 100 : 0
                      const cfg = STATUS_BADGE[label] || { bg: '#f1f5f9', color: '#475569' }
                      return (
                        <tr key={value}>
                          <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700, background: cfg.bg, color: cfg.color }}>
                              {label}
                            </span>
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                            {count}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#dbeafe', fontWeight: 800, color: '#1e3a8a' }}>
                      <td style={{ border: '1px solid #93c5fd', padding: '8px 12px' }}>TOTAL rows (unique SDOs: {stats.count})</td>
                      <td style={{ border: '1px solid #93c5fd', padding: '8px 12px', textAlign: 'right' }}>{stats.rowCount}</td>
                      <td style={{ border: '1px solid #93c5fd', padding: '8px 12px', textAlign: 'right' }}>100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {(activeTab === 'senate_perf' || activeTab === 'senate_status' || activeTab === 'senate_region' || activeTab === 'senate_center' || activeTab === 'senate_sdo' || activeTab === 'senate_delivery') && (
              <div
                className="print-only"
                style={{ display: 'none', padding: '0 0 0.75rem', textAlign: 'center' }}
              >
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, textTransform: 'uppercase' }}>
                  SBFP Milk Component — PCC figures for the Office of Sen. Kiko Pangilinan
                </h2>
                <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                  PCC milk component only. Volume: PM/CM 5 packs = 1 L; SM 5.5555555556 packs = 1 L. Paid amounts come from supplier payment entries.
                </p>
              </div>
            )}

            {activeTab === 'senate_perf' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxWidth: 920 }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    1. Procurement and Delivery Performance
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    PCC milk component only — contracted vs actual. PM/CM = packs ÷ 5; SM = packs ÷ 5.5555555556. Paid = sum of payment entries.
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', fontFamily: 'Arial, sans-serif' }}>
                  <thead>
                    <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                      <th style={{ ...th, textAlign: 'left', width: '62%' }}>Metric</th>
                      <th style={th}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Total value of milk contracts', fmtPeso(stats.totalContractAmt)],
                      ['Total contracted volume', fmtL(stats.totalContractedL) + ' L'],
                      ['Actual amount paid / disbursed', fmtPeso(stats.totalPaid)],
                      ['Remaining to pay', fmtPeso(stats.totalRemainingPay)],
                      ['Actual volume delivered', fmtL(stats.totalDeliveredL) + ' L'],
                      ['Undelivered volume', fmtL(stats.totalUndeliveredL) + ' L'],
                      ['Value of delivered milk (pro-rated contract)', fmtPeso(stats.totalValueDelivered)],
                      ['Delivery / accomplishment rate', fmtPct(stats.pctDelivered)],
                      ['Disbursement rate (paid ÷ contract)', fmtPct(stats.totalContractAmt > 0 ? (stats.totalPaid / stats.totalContractAmt) * 100 : 0)],
                    ].map(([label, value], i) => (
                      <tr key={label} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ ...tdR, textAlign: 'left', fontWeight: 600 }}>{label}</td>
                        <td style={{ ...tdR, fontWeight: 800 }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'senate_status' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                      2. Status of Implementation
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                      Same Status values as the SDO procurement dropdown.
                    </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                        <th style={{ ...th, textAlign: 'left' }}>Status</th>
                        <th style={th}>SDOs</th>
                        <th style={th}>Contracted value</th>
                        <th style={th}>Amount paid</th>
                        <th style={th}>Remaining to pay</th>
                        <th style={th}>Contracted volume</th>
                        <th style={th}>Delivered volume</th>
                        <th style={th}>Undelivered volume</th>
                        <th style={th}>Remaining contract value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SBFP_PROCUREMENT_STATUSES.map((status, i) => {
                        const b = implSummary.buckets[status]
                        const color = IMPLEMENTATION_STATUS_COLORS[status]
                        return (
                          <tr key={status} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ ...tdR, textAlign: 'left', fontWeight: 800, color }}>{status}</td>
                            <td style={{ ...tdR, fontWeight: 700 }}>{b.sdoCount}</td>
                            <td style={tdR}>{fmtPeso(b.contractAmt)}</td>
                            <td style={{ ...tdR, fontWeight: 700, color: '#15803d' }}>{fmtPeso(b.paidAmt)}</td>
                            <td style={tdR}>{fmtPeso(b.remainingPay)}</td>
                            <td style={tdR}>{fmtL(b.contractedL)} L</td>
                            <td style={tdR}>{fmtL(b.deliveredL)} L</td>
                            <td style={tdR}>{fmtL(b.undeliveredL)} L</td>
                            <td style={tdR}>{fmtPeso(b.remainingContract)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                        <td style={{ ...tdR, textAlign: 'left' }}>TOTAL</td>
                        <td style={tdR}>{stats.count}</td>
                        <td style={tdR}>{fmtPeso(stats.totalContractAmt)}</td>
                        <td style={tdR}>{fmtPeso(stats.totalPaid)}</td>
                        <td style={tdR}>{fmtPeso(stats.totalRemainingPay)}</td>
                        <td style={tdR}>{fmtL(stats.totalContractedL)} L</td>
                        <td style={tdR}>{fmtL(stats.totalDeliveredL)} L</td>
                        <td style={tdR}>{fmtL(stats.totalUndeliveredL)} L</td>
                        <td style={tdR}>{fmtPeso(stats.totalRemainingContract)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                      SDO list
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                      Status is the same value encoded on each SDO row.
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'Arial, sans-serif' }}>
                      <thead>
                        <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                          <th style={{ ...th, textAlign: 'left' }}>SDO</th>
                          <th style={thC}>Region</th>
                          <th style={{ ...th, textAlign: 'left' }}>Center</th>
                          <th style={{ ...th, textAlign: 'left' }}>Status</th>
                          <th style={th}>Undelivered</th>
                          <th style={th}>Remaining contract</th>
                          <th style={{ ...th, textAlign: 'left' }}>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SBFP_PROCUREMENT_STATUSES.flatMap(status => {
                          const color = IMPLEMENTATION_STATUS_COLORS[status]
                          const rows = implSummary.reasons.filter(r => r.status === status)
                          if (rows.length === 0) {
                            return [(
                              <tr key={`${status}-empty`}>
                                <td colSpan={3} style={{ ...tdR, textAlign: 'left', color: '#94a3b8' }}>—</td>
                                <td style={{ ...tdR, textAlign: 'left', fontWeight: 800, color }}>{status}</td>
                                <td colSpan={3} style={{ ...tdR, textAlign: 'left', color: '#94a3b8' }}>
                                  No SDOs with this status
                                </td>
                              </tr>
                            )]
                          }
                          return rows.map((row, i) => (
                            <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ ...tdR, textAlign: 'left', fontWeight: 700 }}>{row.sdo}</td>
                              <td style={tdC}>{row.region}</td>
                              <td style={{ ...tdR, textAlign: 'left' }}>{row.center}</td>
                              <td style={{ ...tdR, textAlign: 'left', fontWeight: 700, color }}>{row.status}</td>
                              <td style={tdR}>{fmtL(row.undeliveredL)} L</td>
                              <td style={tdR}>{fmtPeso(row.remainingContract)}</td>
                              <td style={{ ...tdR, textAlign: 'left', color: row.remarks ? '#334155' : '#94a3b8' }}>
                                {row.remarks || '—'}
                              </td>
                            </tr>
                          ))
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'senate_region' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    3. Regional Distribution
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    Contracted vs actual per region. Volume: PM/CM packs ÷ 5; SM packs ÷ 5.5555555556. Delivery % uses packs; disbursement % uses payments ÷ contract.
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                        <th style={thC}>Region</th>
                        <th style={th}>SDOs</th>
                        <th style={th}>Contracted value</th>
                        <th style={th}>Contracted volume</th>
                        <th style={th}>Amount paid</th>
                        <th style={th}>Delivered volume</th>
                        <th style={th}>Value delivered</th>
                        <th style={th}>Delivery %</th>
                        <th style={th}>Disbursement %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionalSummary.map((reg, i) => (
                        <tr key={reg.region} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td style={{ ...tdC, fontWeight: 800 }}>{reg.region}</td>
                          <td style={tdR}>{reg.sdoCount}</td>
                          <td style={tdR}>{fmtPeso(reg.contractAmt)}</td>
                          <td style={tdR}>{fmtL(reg.contractedL)} L</td>
                          <td style={tdR}>{fmtPeso(reg.paidAmt)}</td>
                          <td style={tdR}>{fmtL(reg.deliveredL)} L</td>
                          <td style={tdR}>{fmtPeso(reg.valueDelivered)}</td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{fmtPct(reg.pctDelivered)}</td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{fmtPct(reg.pctDisbursed)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                        <td style={tdC}>TOTAL</td>
                        <td style={tdR}>{stats.count}</td>
                        <td style={tdR}>{fmtPeso(stats.totalContractAmt)}</td>
                        <td style={tdR}>{fmtL(stats.totalContractedL)} L</td>
                        <td style={tdR}>{fmtPeso(stats.totalPaid)}</td>
                        <td style={tdR}>{fmtL(stats.totalDeliveredL)} L</td>
                        <td style={tdR}>{fmtPeso(stats.totalValueDelivered)}</td>
                        <td style={tdR}>{fmtPct(stats.pctDelivered)}</td>
                        <td style={tdR}>
                          {fmtPct(stats.totalContractAmt > 0 ? (stats.totalPaid / stats.totalContractAmt) * 100 : 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'senate_center' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    4. Center Distribution
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    Same columns as Regional Distribution, grouped by PCC center. Use Export as CSV for Excel.
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                        <th style={{ ...th, textAlign: 'left' }}>Center</th>
                        <th style={th}>SDOs</th>
                        <th style={th}>Contracted value</th>
                        <th style={th}>Contracted volume</th>
                        <th style={th}>Amount paid</th>
                        <th style={th}>Delivered volume</th>
                        <th style={th}>Value delivered</th>
                        <th style={th}>Delivery %</th>
                        <th style={th}>Disbursement %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {centerSummary.map((c, i) => (
                        <tr key={c.center} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td style={{ ...tdR, textAlign: 'left', fontWeight: 800 }}>{c.center}</td>
                          <td style={tdR}>{c.sdoCount}</td>
                          <td style={tdR}>{fmtPeso(c.contractAmt)}</td>
                          <td style={tdR}>{fmtL(c.contractedL)} L</td>
                          <td style={tdR}>{fmtPeso(c.paidAmt)}</td>
                          <td style={tdR}>{fmtL(c.deliveredL)} L</td>
                          <td style={tdR}>{fmtPeso(c.valueDelivered)}</td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{fmtPct(c.pctDelivered)}</td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{fmtPct(c.pctDisbursed)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                        <td style={{ ...tdR, textAlign: 'left' }}>TOTAL</td>
                        <td style={tdR}>{stats.count}</td>
                        <td style={tdR}>{fmtPeso(stats.totalContractAmt)}</td>
                        <td style={tdR}>{fmtL(stats.totalContractedL)} L</td>
                        <td style={tdR}>{fmtPeso(stats.totalPaid)}</td>
                        <td style={tdR}>{fmtL(stats.totalDeliveredL)} L</td>
                        <td style={tdR}>{fmtPeso(stats.totalValueDelivered)}</td>
                        <td style={tdR}>{fmtPct(stats.pctDelivered)}</td>
                        <td style={tdR}>
                          {fmtPct(stats.totalContractAmt > 0 ? (stats.totalPaid / stats.totalContractAmt) * 100 : 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'senate_sdo' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    5. SDO Worksheet
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    One row per encoded SDO / milk-type line. Numbers are Excel-ready — use Export as CSV.
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 1480, borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#1e293b', color: '#fff' }}>
                        <th style={{ ...thC, color: '#fff', borderColor: '#334155' }}>No.</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>Region</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>Center</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>SDO</th>
                        <th style={{ ...thC, color: '#fff', borderColor: '#334155' }}>Milk type</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>Status</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Beneficiaries</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Packs to deliver</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Delivered packs</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Contracted value</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Amount paid</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Remaining to pay</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Contracted volume</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Delivered volume</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Undelivered volume</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Value delivered</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Remaining contract</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Delivery %</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Disbursement %</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sdoSenateRows.map((row, i) => (
                        <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          {row.sdoSpan > 0 ? (
                            <td style={{ ...tdC, fontWeight: 800, verticalAlign: 'middle' }} rowSpan={row.sdoSpan}>{row.number}</td>
                          ) : null}
                          <td style={{ ...tdR, textAlign: 'left' }}>{row.region}</td>
                          <td style={{ ...tdR, textAlign: 'left' }}>{row.center}</td>
                          <td style={{ ...tdR, textAlign: 'left', fontWeight: 700 }}>{row.sdo}</td>
                          <td style={tdC}>{row.milkType}</td>
                          <td style={{ ...tdR, textAlign: 'left' }}>{row.status}</td>
                          <td style={tdR}>{row.beneficiaries.toLocaleString()}</td>
                          <td style={tdR}>{row.targetPacks.toLocaleString()}</td>
                          <td style={tdR}>{row.deliveredPacks.toLocaleString()}</td>
                          <td style={tdR}>{fmtPeso(row.contractAmt)}</td>
                          <td style={tdR}>{fmtPeso(row.paidAmt)}</td>
                          <td style={tdR}>{fmtPeso(row.remainingPay)}</td>
                          <td style={tdR}>{fmtL(row.contractedL)}</td>
                          <td style={tdR}>{fmtL(row.deliveredL)}</td>
                          <td style={tdR}>{fmtL(row.undeliveredL)}</td>
                          <td style={tdR}>{fmtPeso(row.valueDelivered)}</td>
                          <td style={tdR}>{fmtPeso(row.remainingContract)}</td>
                          <td style={tdR}>{fmtPct(row.pctDelivered)}</td>
                          <td style={tdR}>{fmtPct(row.pctDisbursed)}</td>
                          <td style={{ ...tdR, textAlign: 'left', color: row.remarks ? '#334155' : '#94a3b8' }}>
                            {row.remarks || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                        <td style={tdC} colSpan={3}>TOTAL</td>
                        <td style={{ ...tdR, textAlign: 'left' }}>{stats.count} SDOs</td>
                        <td style={tdC} colSpan={2}>{stats.rowCount} rows</td>
                        <td style={tdR}>{stats.totalBeneficiaries.toLocaleString()}</td>
                        <td style={tdR}>{stats.totalPacks.toLocaleString()}</td>
                        <td style={tdR}>{stats.totalDelivered.toLocaleString()}</td>
                        <td style={tdR}>{fmtPeso(stats.totalContractAmt)}</td>
                        <td style={tdR}>{fmtPeso(stats.totalPaid)}</td>
                        <td style={tdR}>{fmtPeso(stats.totalRemainingPay)}</td>
                        <td style={tdR}>{fmtL(stats.totalContractedL)}</td>
                        <td style={tdR}>{fmtL(stats.totalDeliveredL)}</td>
                        <td style={tdR}>{fmtL(stats.totalUndeliveredL)}</td>
                        <td style={tdR}>{fmtPeso(stats.totalValueDelivered)}</td>
                        <td style={tdR}>{fmtPeso(stats.totalRemainingContract)}</td>
                        <td style={tdR}>{fmtPct(stats.pctDelivered)}</td>
                        <td style={tdR}>
                          {fmtPct(stats.totalContractAmt > 0 ? (stats.totalPaid / stats.totalContractAmt) * 100 : 0)}
                        </td>
                        <td style={tdR} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'senate_delivery' && (
              <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    6. Contract & Delivery Details
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    Contract value, volume, delivery progress, and payment status per SDO
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 1200, borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#1e293b', color: '#fff' }}>
                        <th style={{ ...thC, color: '#fff', borderColor: '#334155' }}>No.</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>SDO</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>Region</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>Center</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Contract Value</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Contracted Volume (L)</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Volume Delivered (L)</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Amount Paid</th>
                        <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Delivery Rate %</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>Status</th>
                        <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>Procurement Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryDetailsRows.map((row, i) => (
                        <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          {row.sdoSpan > 0 ? (
                            <td style={{ ...tdC, fontWeight: 800, verticalAlign: 'middle' }} rowSpan={row.sdoSpan}>{row.number}</td>
                          ) : null}
                          <td style={{ ...tdR, textAlign: 'left', fontWeight: 700 }}>{row.sdo}</td>
                          <td style={{ ...tdR, textAlign: 'left' }}>{row.region}</td>
                          <td style={{ ...tdR, textAlign: 'left' }}>{row.center}</td>
                          <td style={tdR}>{fmtPeso(row.contractValue)}</td>
                          <td style={tdR}>{fmtL(row.contractedVolumeLiters)}</td>
                          <td style={tdR}>{fmtL(row.volumeDelivered)}</td>
                          <td style={tdR}>{fmtPeso(row.amountPaid)}</td>
                          <td style={tdR}>{fmtPct(row.deliveryRate)}</td>
                          <td style={{ ...tdR, textAlign: 'left', fontWeight: 600, color: row.status === 'Completed' ? '#15803d' : '#ea580c' }}>
                            {row.status}
                          </td>
                          <td style={{ ...tdR, textAlign: 'left' }}>{row.procurementStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                        <td style={tdC} colSpan={2}>TOTAL</td>
                        <td style={tdC} colSpan={2}>
                          {deliveryDetailsRows.filter(r => r.sdoSpan > 0).length} SDOs / {deliveryDetailsRows.length} rows
                        </td>
                        <td style={tdR}>{fmtPeso(deliveryDetailsRows.reduce((sum, r) => sum + r.contractValue, 0))}</td>
                        <td style={tdR}>{fmtL(deliveryDetailsRows.reduce((sum, r) => sum + r.contractedVolumeLiters, 0))}</td>
                        <td style={tdR}>{fmtL(deliveryDetailsRows.reduce((sum, r) => sum + r.volumeDelivered, 0))}</td>
                        <td style={tdR}>{fmtPeso(deliveryDetailsRows.reduce((sum, r) => sum + r.amountPaid, 0))}</td>
                        <td style={tdR}>
                          {fmtPct(
                            deliveryDetailsRows.reduce((sum, r) => sum + r.contractedVolumeLiters, 0) > 0
                              ? (deliveryDetailsRows.reduce((sum, r) => sum + r.volumeDelivered, 0) /
                                  deliveryDetailsRows.reduce((sum, r) => sum + r.contractedVolumeLiters, 0)) * 100
                              : 0
                          )}
                        </td>
                        <td style={tdC} colSpan={2}>
                          {deliveryDetailsRows.filter(r => r.status === 'Completed').length} Completed / {deliveryDetailsRows.filter(r => r.status === 'Ongoing').length} Ongoing
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

          </>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          @page { size: A4 landscape; margin: 8mm; }
          table { width: 100% !important; min-width: 100% !important; font-size: 7.5pt !important; }
          th, td { padding: 3px 4px !important; }
        }
      `}</style>
    </div>
  )
}
