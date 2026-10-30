'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Printer,
  Download,
  Filter,
  Search,
  RotateCcw,
  Table,
  BarChart2,
  Layers,
  Building2,
  FileSpreadsheet,
  CircleDollarSign,
  ClipboardList,
  MapPinned,
  FileDown,
} from 'lucide-react'
import { defaultReportYearString, REPORT_MIN_YEAR, REPORT_YEARS } from '@/lib/app-years'
import {
  defaultCalendarYearDeliveredPackRange,
  mapSbfpRowToReportView,
  reportCenterFilterOptions,
  reportCenterLabel,
  rowHasDeliveryInMonth,
  rowMatchesReportCenterFilter,
  rowMatchesSbfpStatusFilter,
  buildSdoHierarchyStatusMap,
  resolveDeliveredPacksForReport,
  sbfpRowVisibleInReportDefault,
  sbfpStatusBucket,
  senateMetricsForRow,
  addSbfpSenateMetrics,
  emptySbfpSenateMetrics,
  effectiveSbfpRowStatus,
  isRowCompletedOnOrBefore,
  cumulativeDeliveredPacksOnOrBefore,
  resolveCompletionCutoffIso,
  SBFP_PROCUREMENT_STATUSES,
  SBFP_STATUS_FILTER_OPTIONS,
  type SbfpReportSourceRow,
  type SbfpSenateMetrics,
  type SbfpProcurementStatus,
} from '@/lib/sbfp-report-sync'
import { uniqueSdoCountKey } from '@/lib/sbfp-dropoff-sync'
import { sbfpNavCenter } from '@/lib/center-aliases'
import { milkTypeLabel } from '@/lib/sbfp-pack-price'
import { rawMilkUtilizedLiters, packsForMonth } from '@/lib/sbfp-raw-milk'
import { SbfpAiAgent } from '@/components/SbfpAiAgent'
import {
  MAJOR_INDICATORS,
  computeLiveMajorAccomplishments,
  type MajorIndicatorKey,
  type MajorTargetsBySchoolYear,
} from '@/lib/sbfp-major-accomplishments'
import {
  downloadCsvFile,
  exportMultiTabWorkbook,
  exportSingleTabWorkbook,
  fetchProgramReportRowsForYear,
  fetchProgramReportRowsForYears,
  getIslandCluster,
  PROGRAM_REPORT_META,
  regionSortKey,
  type ColType,
  type ProgramReportId,
  type TabExportData,
} from '@/lib/program-spreadsheet-report'
import {
  ProgramSpreadsheetSecondaryTabs,
  STATUS_BADGE,
  type ProgramDeliveryDetailRow,
  type ProgramGroupRow,
  type ProgramImplSummary,
  type ProgramReportTab,
} from '@/components/ProgramSpreadsheetReportTabs'

const PESO = '\u20B1'
const fmtPeso = (n: number) =>
  `${PESO}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

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

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ProgramSpreadsheetReport({ programId }: { programId: ProgramReportId }) {
  const meta = PROGRAM_REPORT_META[programId]
  const supabase = useMemo(() => createClient(), [])

  const initialYear = defaultReportYearString()
  const initialRange = defaultCalendarYearDeliveredPackRange(parseInt(initialYear, 10))

  const [records, setRecords] = useState<SbfpReportSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(initialYear)
  const [yearOptions, setYearOptions] = useState<number[]>([...REPORT_YEARS])
  const [deliveredFrom, setDeliveredFrom] = useState(initialRange.from)
  const [deliveredTo, setDeliveredTo] = useState(initialRange.to)
  const [deliveredDateFilterEnabled, setDeliveredDateFilterEnabled] = useState(false)
  const [filterRegion, setFilterRegion] = useState('ALL')
  const [filterCenter, setFilterCenter] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [filterMonth, setFilterMonth] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ProgramReportTab>('master')

  const [milkAsOfMonth, setMilkAsOfMonth] = useState<string>('ALL')
  const [milkAsOfYear, setMilkAsOfYear] = useState<string>(String(new Date().getFullYear()))
  const [mcFromMonth, setMcFromMonth] = useState<number>(1)
  const [mcToMonth, setMcToMonth] = useState<number>(new Date().getMonth() + 1)
  const [lockedCenter, setLockedCenter] = useState<string | null>(null)
  const [profileChecked, setProfileChecked] = useState(false)

  // Tab 8: Major Accomplishments
  const [majorAsOf, setMajorAsOf] = useState<string>(() => todayIso())
  const [majorRecords, setMajorRecords] = useState<SbfpReportSourceRow[]>([])
  const [majorLoading, setMajorLoading] = useState(false)
  const [majorTargets, setMajorTargets] = useState<MajorTargetsBySchoolYear>({})
  const [editingCell, setEditingCell] = useState<{ sy: string; key: MajorIndicatorKey } | null>(
    null,
  )
  const [editingValue, setEditingValue] = useState('')
  const [savingCell, setSavingCell] = useState<string | null>(null)

  const liveYears = useMemo(() => {
    const ys = new Set<number>(yearOptions.filter(y => y >= REPORT_MIN_YEAR))
    const selected = parseInt(year, 10)
    if (Number.isFinite(selected) && selected >= REPORT_MIN_YEAR) ys.add(selected)
    return Array.from(ys).sort((a, b) => a - b)
  }, [yearOptions, year])

  // Check encoder center lock + distinct years in DB
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [{ data: authData }, { data: yearRows }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('mfp_program_procurement')
          .select('year')
          .eq('program', programId)
          .gte('year', REPORT_MIN_YEAR),
      ])
      if (cancelled) return

      if (yearRows && yearRows.length > 0) {
        const merged = new Set<number>([...REPORT_YEARS])
        for (const r of yearRows) {
          const y = Number((r as { year?: number | null }).year)
          if (Number.isFinite(y) && y >= REPORT_MIN_YEAR) merged.add(y)
        }
        setYearOptions(Array.from(merged).sort((a, b) => b - a))
      } else {
        setYearOptions([...REPORT_YEARS].sort((a, b) => b - a))
      }

      const user = authData?.user
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role,center')
          .eq('id', user.id)
          .single()
        if (!cancelled && profile?.role === 'encoder' && profile.center) {
          const label = reportCenterLabel(sbfpNavCenter(profile.center) || profile.center)
          setLockedCenter(label)
          setFilterCenter(label)
        }
      }
      if (!cancelled) setProfileChecked(true)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, programId])

  // Load program procurement rows for selected year
  useEffect(() => {
    if (!profileChecked) return
    let cancelled = false
    void (async () => {
      const dbY = parseInt(year, 10)
      const data = Number.isFinite(dbY)
        ? await fetchProgramReportRowsForYear(supabase, programId, dbY, lockedCenter)
        : []
      if (!cancelled) {
        setRecords(data)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, programId, year, lockedCenter, profileChecked])

  // Load multi-year rows when Major Accomplishments tab is active
  useEffect(() => {
    if (activeTab !== 'major_accomplishments' || !profileChecked) return
    let cancelled = false
    void (async () => {
      const data = await fetchProgramReportRowsForYears(
        supabase,
        programId,
        liveYears,
        lockedCenter,
      )
      if (!cancelled) {
        setMajorRecords(data)
        setMajorLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeTab, supabase, programId, liveYears, lockedCenter, profileChecked])

  // Load saved Major Accomplishments targets
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/sbfp/major-targets')
        const json = res.ok ? ((await res.json()) as { targets?: MajorTargetsBySchoolYear }) : null
        if (!cancelled && json?.targets) setMajorTargets(json.targets)
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleYearChange = (nextYear: string) => {
    setLoading(true)
    setYear(nextYear)
    const dbY = parseInt(nextYear, 10)
    if (Number.isFinite(dbY)) {
      const { from, to } = defaultCalendarYearDeliveredPackRange(dbY)
      setDeliveredFrom(from)
      setDeliveredTo(to)
    }
  }

  const handleTabChange = (nextTab: ProgramReportTab) => {
    if (nextTab === 'major_accomplishments' && activeTab !== 'major_accomplishments') {
      setMajorLoading(true)
    }
    setActiveTab(nextTab)
  }

  const liveMajor = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeLiveMajorAccomplishments>> = {}
    for (const y of liveYears) {
      out[String(y)] = computeLiveMajorAccomplishments(majorRecords, y, majorAsOf)
    }
    return out
  }, [majorRecords, liveYears, majorAsOf])

  const saveMajorTarget = async (targetKey: string, key: MajorIndicatorKey, raw: string | null) => {
    const cleaned = raw == null ? null : raw.replace(/[,\s]/g, '')
    const value = cleaned == null || cleaned === '' ? null : Number(cleaned)
    if (value != null && !Number.isFinite(value)) {
      alert('Please enter a valid number.')
      return
    }
    const cellId = `${targetKey}|${key}`
    setSavingCell(cellId)
    const prev = majorTargets
    setMajorTargets(t => {
      const copy = { ...(t[targetKey] || {}) }
      if (value == null) delete copy[key]
      else copy[key] = value
      return { ...t, [targetKey]: copy }
    })
    try {
      const res = await fetch('/api/sbfp/major-targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolYear: targetKey, key, value }),
      })
      const json = (await res.json().catch(() => null)) as {
        error?: string
        targets?: MajorTargetsBySchoolYear
      } | null
      if (!res.ok) throw new Error(json?.error || 'Save failed')
      if (json?.targets) setMajorTargets(json.targets)
    } catch (err: unknown) {
      setMajorTargets(prev)
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Failed to save target: ${msg}`)
    } finally {
      setSavingCell(null)
    }
  }

  const distinctCenters = useMemo(() => reportCenterFilterOptions(records), [records])

  const distinctRegions = useMemo(() => {
    const set = new Set<string>()
    for (const r of records) {
      const region = String(r.region || '').trim()
      if (!region || region === '—') continue
      set.add(region)
    }
    return Array.from(set).sort((a, b) => regionSortKey(a) - regionSortKey(b))
  }, [records])

  const distinctStatuses = SBFP_STATUS_FILTER_OPTIONS.filter(o => o.value !== 'ALL')
  const dbYearNum = parseInt(year, 10)

  const effectiveDeliveredRange = useMemo(() => {
    if (Number.isFinite(dbYearNum) && !deliveredDateFilterEnabled) {
      return defaultCalendarYearDeliveredPackRange(dbYearNum)
    }
    const to = deliveredTo >= deliveredFrom ? deliveredTo : deliveredFrom
    return { from: deliveredFrom, to }
  }, [dbYearNum, deliveredDateFilterEnabled, deliveredFrom, deliveredTo])

  const completionCutoffIso = useMemo(
    () =>
      resolveCompletionCutoffIso({
        deliveredDateFilterEnabled,
        deliveredToIso: effectiveDeliveredRange.to,
        filterMonth,
        dbYear: dbYearNum,
      }),
    [deliveredDateFilterEnabled, effectiveDeliveredRange.to, filterMonth, dbYearNum],
  )

  const statusCutoffOpts = useMemo(
    () => ({
      completionCutoffIso,
      dbYear: Number.isFinite(dbYearNum) ? dbYearNum : undefined,
    }),
    [completionCutoffIso, dbYearNum],
  )

  // Whole-area hierarchy status (same hierarchy order & completion-cutoff logic as SBFP Report)
  const sdoHierarchyStatusMap = useMemo(() => {
    const visibleRows = records.filter(r => includeExcluded || sbfpRowVisibleInReportDefault(r))
    return buildSdoHierarchyStatusMap(visibleRows, statusCutoffOpts)
  }, [records, includeExcluded, statusCutoffOpts])

  const preStatusFilteredRecords = useMemo(() => {
    const { from: rangeFrom, to: rangeTo } = effectiveDeliveredRange
    return records.filter(r => {
      if (!includeExcluded && !sbfpRowVisibleInReportDefault(r)) return false
      if (filterRegion !== 'ALL' && r.region !== filterRegion) return false
      if (!rowMatchesReportCenterFilter(r, filterCenter)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchArea = (r.sdo || '').toLowerCase().includes(q)
        const matchCenter = (r.center || '').toLowerCase().includes(q)
        const matchRegion = (r.region || '').toLowerCase().includes(q)
        const matchPo = (r.po_number || '').toLowerCase().includes(q)
        const matchPr = (r.pr_number || '').toLowerCase().includes(q)
        if (!matchArea && !matchCenter && !matchRegion && !matchPo && !matchPr) return false
      }

      const key = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      const effectiveStatus =
        (key ? sdoHierarchyStatusMap.get(key) : undefined) ||
        effectiveSbfpRowStatus(r, statusCutoffOpts)

      if (completionCutoffIso && effectiveStatus === 'Completed' && Number.isFinite(dbYearNum)) {
        return cumulativeDeliveredPacksOnOrBefore(r, completionCutoffIso, dbYearNum) > 0
      }

      if (filterMonth) {
        const month = parseInt(filterMonth, 10)
        if (
          Number.isFinite(month) &&
          Number.isFinite(dbYearNum) &&
          !rowHasDeliveryInMonth(r, month, dbYearNum)
        ) {
          return false
        }
      }
      if (deliveredDateFilterEnabled && Number.isFinite(dbYearNum) && rangeFrom && rangeTo) {
        const delivered = resolveDeliveredPacksForReport(r, {
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
    searchQuery,
    filterMonth,
    includeExcluded,
    deliveredDateFilterEnabled,
    effectiveDeliveredRange,
    dbYearNum,
    completionCutoffIso,
    sdoHierarchyStatusMap,
    statusCutoffOpts,
  ])

  const statusHierarchyCounts = useMemo(() => {
    const byStatus = Object.fromEntries(
      SBFP_PROCUREMENT_STATUSES.map(status => [status, 0]),
    ) as Record<SbfpProcurementStatus, number>
    const seenKeys = new Set<string>()
    for (const r of preStatusFilteredRecords) {
      const key = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      if (!key || seenKeys.has(key)) continue
      seenKeys.add(key)
      const assignedStatus =
        sdoHierarchyStatusMap.get(key) || effectiveSbfpRowStatus(r, statusCutoffOpts)
      byStatus[assignedStatus] = (byStatus[assignedStatus] ?? 0) + 1
    }
    return { total: seenKeys.size, byStatus }
  }, [preStatusFilteredRecords, sdoHierarchyStatusMap, statusCutoffOpts])

  const filteredRecords = useMemo(() => {
    if (!filterStatus || filterStatus === 'ALL') return preStatusFilteredRecords
    return preStatusFilteredRecords.filter(r => {
      const key = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      const effectiveStatus =
        (key ? sdoHierarchyStatusMap.get(key) : undefined) ||
        effectiveSbfpRowStatus(r, statusCutoffOpts)
      return rowMatchesSbfpStatusFilter(effectiveStatus, filterStatus)
    })
  }, [preStatusFilteredRecords, filterStatus, sdoHierarchyStatusMap, statusCutoffOpts])

  const viewRows = useMemo(() => {
    const dbY = Number.isFinite(dbYearNum) ? dbYearNum : undefined
    const { from, to } = effectiveDeliveredRange
    return records.map(r => {
      const key = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      const effectiveStatus =
        (key ? sdoHierarchyStatusMap.get(key) : undefined) ||
        effectiveSbfpRowStatus(r, statusCutoffOpts)
      const cumulativeThroughCutoff =
        Boolean(completionCutoffIso) && effectiveStatus === 'Completed' && dbY != null
      return mapSbfpRowToReportView(r, {
        deliveredFromIso: from,
        deliveredToIso: to,
        dbYear: dbY,
        customPriceOnly: true,
        completionCutoffIso,
        cumulativeThroughCutoff,
      })
    })
  }, [
    records,
    effectiveDeliveredRange,
    dbYearNum,
    completionCutoffIso,
    sdoHierarchyStatusMap,
    statusCutoffOpts,
  ])

  const viewById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof mapSbfpRowToReportView>>()
    for (const v of viewRows) {
      if (v.source.id) m.set(v.source.id, v)
    }
    return m
  }, [viewRows])

  const getViewForSource = useCallback(
    (sourceId: string | undefined) => (sourceId ? viewById.get(sourceId) : undefined),
    [viewById],
  )

  const rowSenate = useCallback(
    (r: SbfpReportSourceRow): SbfpSenateMetrics => {
      const view = getViewForSource(r.id)
      const contractFallback =
        (view?.contract_amount ?? 0) > 0
          ? view!.contract_amount
          : Number(r.contract_amount) || Number(r.amount) || 0
      return senateMetricsForRow(r, {
        packs_to_deliver: view?.packs_to_deliver ?? 0,
        delivered_packs: view?.delivered_packs ?? 0,
        contract_amount: contractFallback,
      })
    },
    [getViewForSource],
  )

  const stats = useMemo(() => {
    let metrics = emptySbfpSenateMetrics()
    let totalAmount = 0
    let totalBeneficiaries = 0
    const statusCounts: Record<string, number> = {}
    const statusMetrics: Record<string, SbfpSenateMetrics> = {}

    for (const r of filteredRecords) {
      const m = rowSenate(r)
      metrics = addSbfpSenateMetrics(metrics, m)
      totalAmount += Number(r.amount) > 0 ? Number(r.amount) : Number(r.contract_amount) || 0
      totalBeneficiaries +=
        (Number(r.beneficiaries_pm) || 0) +
        (Number(r.beneficiaries_sm) || 0) +
        (Number(r.beneficiaries_cm) || 0)
      const effStatus = effectiveSbfpRowStatus(r, statusCutoffOpts)
      const bucket = sbfpStatusBucket(effStatus)
      statusCounts[bucket] = (statusCounts[bucket] || 0) + 1
      statusMetrics[bucket] = addSbfpSenateMetrics(
        statusMetrics[bucket] || emptySbfpSenateMetrics(),
        m,
      )
    }

    const coopIds = new Set(
      filteredRecords.map(r => String(r.supplier_id || '').trim()).filter(Boolean),
    )
    const uniqueAreas = new Set(
      filteredRecords
        .map(r => uniqueSdoCountKey(r.sdo, r.center) || String(r.id || ''))
        .filter(Boolean),
    )

    return {
      count: uniqueAreas.size,
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
  }, [filteredRecords, rowSenate, statusCutoffOpts])

  type InternalGroupAgg = SbfpSenateMetrics & {
    sdoCount: number
    sdoKeys: Set<string>
    beneficiaries: number
    coopIds: Set<string>
  }

  const regionalSummary = useMemo<Array<ProgramGroupRow & { region: string }>>(() => {
    const map = new Map<string, InternalGroupAgg & { region: string }>()
    for (const r of filteredRecords) {
      const reg = r.region || 'UNASSIGNED'
      if (!map.has(reg)) {
        map.set(reg, {
          region: reg,
          ...emptySbfpSenateMetrics(),
          sdoCount: 0,
          sdoKeys: new Set(),
          beneficiaries: 0,
          coopIds: new Set(),
        })
      }
      const entry = map.get(reg)!
      const key = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      if (key && !entry.sdoKeys.has(key)) {
        entry.sdoKeys.add(key)
        entry.sdoCount++
      }
      entry.beneficiaries +=
        (Number(r.beneficiaries_pm) || 0) +
        (Number(r.beneficiaries_sm) || 0) +
        (Number(r.beneficiaries_cm) || 0)
      const coopId = String(r.supplier_id || '').trim()
      if (coopId) entry.coopIds.add(coopId)
      Object.assign(entry, addSbfpSenateMetrics(entry, rowSenate(r)))
    }
    return Array.from(map.values())
      .map(r => ({ ...r, coopCount: r.coopIds.size }))
      .sort((a, b) => regionSortKey(a.region) - regionSortKey(b.region))
  }, [filteredRecords, rowSenate])

  const centerSummary = useMemo<Array<ProgramGroupRow & { center: string }>>(() => {
    const map = new Map<string, InternalGroupAgg & { center: string }>()
    for (const r of filteredRecords) {
      const centerKey = reportCenterLabel(r.center)
      const label = centerKey === '—' ? 'UNASSIGNED' : centerKey
      if (!map.has(label)) {
        map.set(label, {
          center: label,
          ...emptySbfpSenateMetrics(),
          sdoCount: 0,
          sdoKeys: new Set(),
          beneficiaries: 0,
          coopIds: new Set(),
        })
      }
      const entry = map.get(label)!
      const key = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      if (key && !entry.sdoKeys.has(key)) {
        entry.sdoKeys.add(key)
        entry.sdoCount++
      }
      entry.beneficiaries +=
        (Number(r.beneficiaries_pm) || 0) +
        (Number(r.beneficiaries_sm) || 0) +
        (Number(r.beneficiaries_cm) || 0)
      const coopId = String(r.supplier_id || '').trim()
      if (coopId) entry.coopIds.add(coopId)
      Object.assign(entry, addSbfpSenateMetrics(entry, rowSenate(r)))
    }
    return Array.from(map.values())
      .map(r => ({ ...r, coopCount: r.coopIds.size }))
      .sort((a, b) => a.center.localeCompare(b.center))
  }, [filteredRecords, rowSenate])

  const deliveryDetailsRows = useMemo<ProgramDeliveryDetailRow[]>(() => {
    const mapped: ProgramDeliveryDetailRow[] = filteredRecords
      .map(r => {
        const m = rowSenate(r)
        const contractValue = Number(r.contract_amount) || Number(r.amount) || 0
        const deliveryRate = m.pctDelivered
        const effProcStatus = effectiveSbfpRowStatus(r, statusCutoffOpts)
        const isCompleted =
          effProcStatus === 'Completed' ||
          (deliveryRate >= 100 &&
            (!completionCutoffIso ||
              isRowCompletedOnOrBefore(r, completionCutoffIso, statusCutoffOpts.dbYear)))
        return {
          id: String(r.id || `${r.sdo}-${r.region}`),
          sdoKey: uniqueSdoCountKey(r.sdo, r.center),
          sdo: String(r.sdo || '—'),
          region: String(r.region || '—'),
          center: reportCenterLabel(r.center),
          contractValue,
          contractedVolumeLiters: m.contractedL,
          volumeDelivered: m.deliveredL,
          amountPaid: m.paidAmt,
          deliveryRate,
          status: isCompleted ? 'Completed' : 'Ongoing',
          procurementStatus: effProcStatus,
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

    let geoNum = 0
    let i = 0
    while (i < mapped.length) {
      const key = mapped[i].sdoKey || `__row_${i}`
      let span = 1
      while (
        i + span < mapped.length &&
        (mapped[i + span].sdoKey || `__row_${i + span}`) === key
      ) {
        span++
      }
      geoNum++
      mapped[i] = { ...mapped[i], number: geoNum, sdoSpan: span }
      for (let j = 1; j < span; j++) {
        mapped[i + j] = { ...mapped[i + j], number: geoNum, sdoSpan: 0 }
      }
      i += span
    }
    return mapped
  }, [filteredRecords, rowSenate, statusCutoffOpts, completionCutoffIso])

  const implSummary = useMemo<ProgramImplSummary>(() => {
    const emptyEntry = () => ({
      ...emptySbfpSenateMetrics(),
      sdoCount: 0,
      sdoKeys: new Set<string>(),
    })
    const buckets = Object.fromEntries(
      SBFP_PROCUREMENT_STATUSES.map(status => [status, emptyEntry()]),
    ) as ProgramImplSummary['buckets']
    const reasons: ProgramImplSummary['reasons'] = []

    for (const r of filteredRecords) {
      const m = rowSenate(r)
      const status = effectiveSbfpRowStatus(r, statusCutoffOpts)
      const entry = buckets[status]
      Object.assign(entry, addSbfpSenateMetrics(entry, m))

      const key = uniqueSdoCountKey(r.sdo, r.center) || String(r.id || '')
      const assignedStatus = (key ? sdoHierarchyStatusMap.get(key) : undefined) || status
      const sdoBucket = buckets[assignedStatus]
      if (key && !sdoBucket.sdoKeys.has(key)) {
        sdoBucket.sdoKeys.add(key)
        sdoBucket.sdoCount++
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
    }

    reasons.sort((a, b) => {
      const oa = SBFP_PROCUREMENT_STATUSES.indexOf(a.status)
      const ob = SBFP_PROCUREMENT_STATUSES.indexOf(b.status)
      if (oa !== ob) return oa - ob
      return b.remainingContract - a.remainingContract
    })
    return { buckets, reasons }
  }, [filteredRecords, rowSenate, sdoHierarchyStatusMap, statusCutoffOpts])

  const sdoIndexMeta = useMemo(() => {
    const out: Array<{ number: number; rowSpan: number }> = []
    let geoNum = 0
    let i = 0
    while (i < filteredRecords.length) {
      const key =
        uniqueSdoCountKey(filteredRecords[i].sdo, filteredRecords[i].center) || `__row_${i}`
      let span = 1
      while (
        i + span < filteredRecords.length &&
        (uniqueSdoCountKey(filteredRecords[i + span].sdo, filteredRecords[i + span].center) ||
          `__row_${i + span}`) === key
      ) {
        span++
      }
      geoNum++
      out[i] = { number: geoNum, rowSpan: span }
      for (let j = 1; j < span; j++) out[i + j] = { number: geoNum, rowSpan: 0 }
      i += span
    }
    return out
  }, [filteredRecords])

  const buildMajorExport = () => {
    const d = new Date(majorAsOf + 'T12:00:00')
    const asOfLabel = Number.isNaN(d.getTime())
      ? majorAsOf
      : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const headers: string[] = ['Performance Indicator']
    for (const y of liveYears) {
      headers.push(`CY ${y} Target`, `CY ${y} Accomplishment (as of ${asOfLabel})`)
    }
    const rows: Array<Array<string | number>> = MAJOR_INDICATORS.map(ind => {
      const label = ind.key === 'sdo_count' ? meta.majorEntityCountLabel : ind.label
      const row: Array<string | number> = [label]
      for (const y of liveYears) {
        const tKey = `${programId}:${y}`
        row.push(majorTargets[tKey]?.[ind.key] ?? '', liveMajor[String(y)]?.[ind.key] ?? 0)
      }
      return row
    })
    return { headers, rows }
  }

  const getTabExportData = (targetTab: ProgramReportTab): TabExportData => {
    const dateStr = new Date().toISOString().split('T')[0]
    const prefix = programId
    if (targetTab === 'major_accomplishments') {
      const m = buildMajorExport()
      return {
        sheetName: 'Major Accomplishments',
        filename: `${prefix}_major_accomplishments_as_of_${majorAsOf}.xlsx`,
        headers: m.headers,
        rows: m.rows,
        colTypes: ['text', ...m.headers.slice(1).map((): ColType => 'dec')],
      }
    }
    if (targetTab === 'senate_perf') {
      return {
        sheetName: 'Procurement & Delivery',
        filename: `${prefix}_procurement_delivery_${year}_${dateStr}.xlsx`,
        headers: ['Metric', 'Value'],
        rows: [
          ['Scope', `PCC ${meta.shortLabel} milk component`],
          ['Total value of milk contracts (PHP)', stats.totalContractAmt],
          ['Total contracted volume (L)', stats.totalContractedL],
          ['Actual amount paid/disbursed (PHP)', stats.totalPaid],
          ['Remaining to pay (PHP)', stats.totalRemainingPay],
          ['Actual volume delivered (L)', stats.totalDeliveredL],
          ['Undelivered volume (L)', stats.totalUndeliveredL],
          ['Value of delivered milk (PHP)', stats.totalValueDelivered],
          ['Delivery/accomplishment rate (%)', Number(stats.pctDelivered.toFixed(1))],
          [
            'Disbursement rate (%)',
            stats.totalContractAmt > 0
              ? Number(((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1))
              : 0,
          ],
        ],
        colTypes: ['text', 'dec'],
      }
    }
    if (targetTab === 'senate_status') {
      const rows: (string | number)[][] = SBFP_PROCUREMENT_STATUSES.map(status => {
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
      rows.push([
        'TOTAL',
        stats.count,
        stats.totalContractAmt,
        stats.totalPaid,
        stats.totalRemainingPay,
        stats.totalContractedL,
        stats.totalDeliveredL,
        stats.totalUndeliveredL,
        stats.totalRemainingContract,
      ])
      return {
        sheetName: 'Implementation Status',
        filename: `${prefix}_implementation_${year}_${dateStr}.xlsx`,
        headers: [
          'Status',
          meta.entityPlural,
          'Contracted value (PHP)',
          'Amount paid (PHP)',
          'Remaining to pay (PHP)',
          'Contracted volume (L)',
          'Delivered volume (L)',
          'Undelivered volume (L)',
          'Remaining contract value (PHP)',
        ],
        rows,
        colTypes: ['text', 'num', 'cur', 'cur', 'cur', 'dec', 'dec', 'dec', 'cur'],
      }
    }
    if (targetTab === 'senate_region') {
      const rows: Array<Array<string | number>> = regionalSummary.map(reg => [
        reg.region,
        reg.sdoCount,
        reg.beneficiaries,
        reg.contractAmt,
        reg.contractedL,
        reg.paidAmt,
        reg.deliveredL,
        reg.valueDelivered,
        Number(reg.pctDelivered.toFixed(1)),
        Number(reg.pctDisbursed.toFixed(1)),
      ])
      rows.push([
        'TOTAL',
        stats.count,
        stats.totalBeneficiaries,
        stats.totalContractAmt,
        stats.totalContractedL,
        stats.totalPaid,
        stats.totalDeliveredL,
        stats.totalValueDelivered,
        Number(stats.pctDelivered.toFixed(1)),
        stats.totalContractAmt > 0
          ? Number(((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1))
          : 0,
      ])
      return {
        sheetName: 'Regional Distribution',
        filename: `${prefix}_regional_distribution_${year}_${dateStr}.xlsx`,
        headers: [
          'Region',
          meta.entityPlural,
          'Beneficiaries',
          'Contracted value (PHP)',
          'Contracted volume (L)',
          'Amount paid (PHP)',
          'Delivered volume (L)',
          'Value delivered (PHP)',
          'Delivery rate (%)',
          'Disbursement rate (%)',
        ],
        rows,
        colTypes: ['text', 'num', 'num', 'cur', 'dec', 'cur', 'dec', 'cur', 'pct', 'pct'],
      }
    }
    if (targetTab === 'senate_center') {
      const rows: Array<Array<string | number>> = centerSummary.map(c => [
        c.center,
        c.sdoCount,
        c.beneficiaries,
        c.contractAmt,
        c.contractedL,
        c.paidAmt,
        c.deliveredL,
        c.valueDelivered,
        Number(c.pctDelivered.toFixed(1)),
        Number(c.pctDisbursed.toFixed(1)),
      ])
      rows.push([
        'TOTAL',
        stats.count,
        stats.totalBeneficiaries,
        stats.totalContractAmt,
        stats.totalContractedL,
        stats.totalPaid,
        stats.totalDeliveredL,
        stats.totalValueDelivered,
        Number(stats.pctDelivered.toFixed(1)),
        stats.totalContractAmt > 0
          ? Number(((stats.totalPaid / stats.totalContractAmt) * 100).toFixed(1))
          : 0,
      ])
      return {
        sheetName: 'Center Distribution',
        filename: `${prefix}_center_distribution_${year}_${dateStr}.xlsx`,
        headers: [
          'Center',
          meta.entityPlural,
          'Beneficiaries',
          'Contracted value (PHP)',
          'Contracted volume (L)',
          'Amount paid (PHP)',
          'Delivered volume (L)',
          'Value delivered (PHP)',
          'Delivery rate (%)',
          'Disbursement rate (%)',
        ],
        rows,
        colTypes: ['text', 'num', 'num', 'cur', 'dec', 'cur', 'dec', 'cur', 'pct', 'pct'],
      }
    }
    if (targetTab === 'senate_delivery') {
      const rows: Array<Array<string | number>> = deliveryDetailsRows.map(row => [
        row.sdoSpan > 0 ? row.number : '',
        row.sdo,
        row.region,
        row.center,
        row.contractValue,
        row.contractedVolumeLiters,
        row.volumeDelivered,
        row.amountPaid,
        Number(row.deliveryRate.toFixed(1)),
        row.status,
        row.procurementStatus,
      ])
      const totVol = deliveryDetailsRows.reduce((s, r) => s + r.contractedVolumeLiters, 0)
      const delVol = deliveryDetailsRows.reduce((s, r) => s + r.volumeDelivered, 0)
      rows.push([
        'TOTAL',
        '',
        '',
        `${deliveryDetailsRows.filter(r => r.sdoSpan > 0).length} ${meta.entityPlural} / ${deliveryDetailsRows.length} rows`,
        deliveryDetailsRows.reduce((s, r) => s + r.contractValue, 0),
        totVol,
        delVol,
        deliveryDetailsRows.reduce((s, r) => s + r.amountPaid, 0),
        totVol > 0 ? Number(((delVol / totVol) * 100).toFixed(1)) : 0,
        `${deliveryDetailsRows.filter(r => r.status === 'Completed').length} Completed / ${deliveryDetailsRows.filter(r => r.status === 'Ongoing').length} Ongoing`,
        '',
      ])
      return {
        sheetName: 'Contract & Delivery',
        filename: `${prefix}_contract_delivery_${year}_${dateStr}.xlsx`,
        headers: [
          'No.',
          meta.entitySingular,
          'Region',
          'Center',
          'Contract Value (PHP)',
          'Contracted Volume (L)',
          'Volume Delivered (L)',
          'Amount Paid (PHP)',
          'Delivery Rate (%)',
          'Status',
          'Procurement Status',
        ],
        rows,
        colTypes: ['num', 'text', 'text', 'text', 'cur', 'dec', 'dec', 'cur', 'pct', 'text', 'text'],
      }
    }
    if (targetTab === 'milk_procurement') {
      const rows: Array<Array<string | number>> = filteredRecords.map((r, idx) => {
        const view = getViewForSource(r.id)
        const packsToDeliver = view?.packs_to_deliver ?? Number(r.packs_to_deliver) ?? 0
        const deliveredPacks = view?.delivered_packs ?? Number(r.packs_delivered) ?? 0
        const balance = Math.max(0, packsToDeliver - deliveredPacks)
        const milkTypeStr = view?.milk_type ?? milkTypeLabel(r.milk_type ?? '')
        const idxMeta = sdoIndexMeta[idx]
        return [
          idxMeta?.rowSpan && idxMeta.rowSpan > 0 ? idxMeta.number : '',
          r.region || '',
          r.sdo || '',
          effectiveSbfpRowStatus(r, statusCutoffOpts),
          packsToDeliver,
          milkTypeStr,
          deliveredPacks,
          balance,
        ]
      })
      rows.push([
        'TOTAL',
        '',
        `${stats.count} ${meta.entityPlural}`,
        '',
        stats.totalPacks,
        '',
        stats.totalDelivered,
        Math.max(0, stats.totalPacks - stats.totalDelivered),
      ])
      return {
        sheetName: 'Milk Procurement Status',
        filename: `${prefix}_milk_procurement_status_${year}_${dateStr}.xlsx`,
        headers: [
          '#',
          'Region',
          meta.entitySingular,
          'Procurement Status',
          'No. of Milk Packs to be Delivered',
          'Milk Type',
          'No. of Milk Packs Delivered',
          'Balance',
        ],
        rows,
        colTypes: ['num', 'text', 'text', 'text', 'num', 'text', 'num', 'num'],
      }
    }
    if (targetTab === 'monthly_cummulated') {
      const start = Math.min(mcFromMonth, mcToMonth)
      const end = Math.max(mcFromMonth, mcToMonth)
      const clusterMap: Record<
        string,
        {
          regions: Set<string>
          beneficiaries: number
          coops: Set<string>
          rawMilkLiters: number
          packs: number
          contractAmount: number
        }
      > = {
        Luzon: {
          regions: new Set(),
          beneficiaries: 0,
          coops: new Set(),
          rawMilkLiters: 0,
          packs: 0,
          contractAmount: 0,
        },
        Visayas: {
          regions: new Set(),
          beneficiaries: 0,
          coops: new Set(),
          rawMilkLiters: 0,
          packs: 0,
          contractAmount: 0,
        },
        Mindanao: {
          regions: new Set(),
          beneficiaries: 0,
          coops: new Set(),
          rawMilkLiters: 0,
          packs: 0,
          contractAmount: 0,
        },
      }
      for (const r of filteredRecords) {
        let deliveredInRange = 0
        for (let m = start; m <= end; m++) {
          deliveredInRange += packsForMonth(r, m, { year: Number(year) })
        }
        if (deliveredInRange <= 0) continue
        const cluster = getIslandCluster(r.region || '')
        const g = clusterMap[cluster]
        if (!g) continue
        if (r.region && r.region !== '—') g.regions.add(r.region)
        g.beneficiaries +=
          (Number(r.beneficiaries_pm) || 0) +
          (Number(r.beneficiaries_sm) || 0) +
          (Number(r.beneficiaries_cm) || 0)
        if (r.supplier_id) g.coops.add(String(r.supplier_id))
        g.packs += deliveredInRange
        g.rawMilkLiters += rawMilkUtilizedLiters(deliveredInRange)
        g.contractAmount += Number(r.contract_amount) || Number(r.amount) || 0
      }
      const clusterRows: Array<Array<string | number>> = ['Luzon', 'Visayas', 'Mindanao'].map(c => {
        const g = clusterMap[c]
        return [
          c,
          Array.from(g.regions).join(', '),
          g.beneficiaries,
          g.coops.size,
          g.rawMilkLiters,
          g.packs,
          g.contractAmount,
        ]
      })
      clusterRows.push([
        'TOTAL',
        '',
        clusterRows.reduce((s, r) => s + Number(r[2]), 0),
        clusterRows.reduce((s, r) => s + Number(r[3]), 0),
        clusterRows.reduce((s, r) => s + Number(r[4]), 0),
        clusterRows.reduce((s, r) => s + Number(r[5]), 0),
        clusterRows.reduce((s, r) => s + Number(r[6]), 0),
      ])
      return {
        sheetName: 'CDP Report',
        filename: `${prefix}_cdp_report_${year}_${dateStr}.xlsx`,
        headers: [
          'CLUSTER',
          'REGION',
          'BENEFICIARIES',
          'NO. OF COOPS',
          'RAW MILK USED IN LITERS',
          'MILK PACKS',
          'CONTRACT AMOUNT',
        ],
        rows: clusterRows,
        colTypes: ['text', 'text', 'num', 'num', 'dec', 'num', 'cur'],
      }
    }

    // Default: Masterlist
    const rows: Array<Array<string | number>> = filteredRecords.flatMap((r, idx) => {
      const v = getViewForSource(r.id)
      if (!v) return []
      return [
        [
          sdoIndexMeta[idx]?.number ?? idx + 1,
          v.region === '—' ? '' : v.region,
          v.sdo === '—' ? '' : v.sdo,
          v.center,
          v.coop_name === '—' ? '' : v.coop_name,
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
        ],
      ]
    })
    rows.push([
      'TOTAL',
      '',
      `${stats.count} ${meta.entityPlural}`,
      '',
      '',
      `${stats.rowCount} rows`,
      '',
      stats.totalAmount,
      '',
      '',
      '',
      '',
      '',
      '',
      stats.totalBeneficiaries,
      stats.totalContractAmt,
      '',
      '',
      stats.totalPacks,
      stats.totalDelivered,
      '',
      '',
    ])
    return {
      sheetName: meta.masterTabLabel,
      filename: `${prefix}_masterlist_${year}_${dateStr}.xlsx`,
      headers: [
        'No.',
        'Region',
        meta.entitySingular,
        'Center',
        'Cooperative',
        'Procurement Status',
        'Milk Type',
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
        'Delivered Packs',
        'Payment Status',
        'Remarks',
      ],
      rows,
      colTypes: [
        'num',
        'text',
        'text',
        'text',
        'text',
        'text',
        'text',
        'cur',
        'text',
        'text',
        'text',
        'text',
        'text',
        'text',
        'num',
        'cur',
        'text',
        'text',
        'num',
        'num',
        'text',
        'text',
      ],
    }
  }

  const exportToCSV = () => {
    const data = getTabExportData(activeTab)
    if (filteredRecords.length === 0 && activeTab !== 'major_accomplishments') {
      alert('No data to export.')
      return
    }
    downloadCsvFile(data.filename.replace(/\.xlsx$/i, '.csv'), data.headers, data.rows)
  }

  const exportToExcel = async (targetTab?: ProgramReportTab) => {
    const tab = targetTab || activeTab
    if (filteredRecords.length === 0 && tab !== 'major_accomplishments') {
      alert('No data to export.')
      return
    }
    await exportSingleTabWorkbook(getTabExportData(tab))
  }

  const exportAllTabsToExcel = async () => {
    if (filteredRecords.length === 0) {
      alert('No data to export.')
      return
    }
    const allTabIds: ProgramReportTab[] = [
      'master',
      'senate_perf',
      'senate_status',
      'senate_region',
      'senate_center',
      'senate_delivery',
      'milk_procurement',
      'monthly_cummulated',
      'major_accomplishments',
    ]
    const dateStr = new Date().toISOString().split('T')[0]
    await exportMultiTabWorkbook(
      `${programId}_all_tabs_complete_${year}_${dateStr}.xlsx`,
      allTabIds.map(id => getTabExportData(id)),
    )
  }

  const clearFilters = () => {
    setFilterRegion('ALL')
    setFilterCenter(lockedCenter || 'ALL')
    setFilterStatus('ALL')
    setFilterMonth('')
    setSearchQuery('')
    setDeliveredDateFilterEnabled(false)
    if (Number.isFinite(dbYearNum)) {
      const { from, to } = defaultCalendarYearDeliveredPackRange(dbYearNum)
      setDeliveredFrom(from)
      setDeliveredTo(to)
    }
  }

  const clearDeliveredDateFilter = () => {
    setDeliveredDateFilterEnabled(false)
    if (Number.isFinite(dbYearNum)) {
      const { from, to } = defaultCalendarYearDeliveredPackRange(dbYearNum)
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Filter Toolbar */}
      <div
        className="no-print"
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0.875rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}
              >
                Year
              </div>
              <select
                value={year}
                onChange={e => handleYearChange(e.target.value)}
                style={{
                  height: 34,
                  padding: '0 0.75rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  background: '#fff',
                  fontWeight: 600,
                }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={String(y)}>
                    CY {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}
              >
                Center
              </div>
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
                <select
                  value={filterCenter}
                  onChange={e => setFilterCenter(e.target.value)}
                  style={{
                    height: 34,
                    padding: '0 0.75rem',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    background: '#fff',
                  }}
                >
                  <option value="ALL">All Centers ({distinctCenters.length})</option>
                  {distinctCenters.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}
              >
                Region
              </div>
              <select
                value={filterRegion}
                onChange={e => setFilterRegion(e.target.value)}
                style={{
                  height: 34,
                  padding: '0 0.75rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  background: '#fff',
                }}
              >
                <option value="ALL">All Regions ({distinctRegions.length})</option>
                {distinctRegions.map(r => (
                  <option key={r} value={r}>
                    Region {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}
              >
                Procurement Status
              </div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{
                  height: 34,
                  padding: '0 0.75rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  background: '#fff',
                }}
              >
                <option value="ALL">All Statuses ({statusHierarchyCounts.total})</option>
                {distinctStatuses.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label} ({statusHierarchyCounts.byStatus[s.value as SbfpProcurementStatus] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ position: 'relative' }}>
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}
              >
                {meta.searchLabel}
              </div>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{ position: 'absolute', left: 8, top: 10, color: '#94a3b8' }}
                />
                <input
                  type="text"
                  placeholder={meta.searchPlaceholder}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    height: 34,
                    paddingLeft: 28,
                    paddingRight: 8,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    width: 170,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <SbfpAiAgent
              filteredRecords={filteredRecords}
              getViewForSource={getViewForSource}
              stats={stats}
              yearLabel={`CY ${year}`}
              filterCenter={filterCenter}
              filterRegion={filterRegion}
              filterStatus={filterStatus}
              filterMonth={filterMonth}
              deliveredDateRange={
                deliveredDateFilterEnabled
                  ? `${formatRangeLabel(effectiveDeliveredRange.from)} – ${formatRangeLabel(effectiveDeliveredRange.to)}`
                  : 'Jan 1 – today (Full CY)'
              }
              searchQuery={searchQuery}
              activeTab={activeTab}
              regionalSummary={regionalSummary}
              centerSummary={centerSummary}
              implSummary={implSummary}
              programLabel={meta.shortLabel}
              entityPluralLabel={meta.entityPlural}
            />

            <button
              onClick={clearFilters}
              title="Reset all filters"
              style={{
                height: 34,
                padding: '0 0.75rem',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#64748b',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} /> Reset
            </button>

            <button
              onClick={exportToCSV}
              style={{
                height: 34,
                padding: '0 1rem',
                borderRadius: 6,
                border: '1px solid #059669',
                background: '#10b981',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <Download size={15} /> Export as .CSV
            </button>

            <button
              onClick={() => void exportToExcel()}
              title="Export the currently active tab as a styled Excel file (.xlsx)"
              style={{
                height: 34,
                padding: '0 0.85rem',
                borderRadius: 6,
                border: '1px solid #1d6b3f',
                background: '#217346',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <FileDown size={15} /> Export as .xlsx
            </button>

            <button
              onClick={() => void exportAllTabsToExcel()}
              title="Export all tabs into a single styled multi-sheet Excel workbook (.xlsx)"
              style={{
                height: 34,
                padding: '0 0.75rem',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#217346',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <Layers size={14} /> All Tabs (.xlsx)
            </button>

            <button
              onClick={() => window.print()}
              style={{
                height: 34,
                padding: '0 1rem',
                borderRadius: 6,
                border: '1px solid #2563eb',
                background: '#3b82f6',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <Printer size={15} /> Print Report
            </button>
          </div>
        </div>

        {/* Bottom Date Range & View Tabs Row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #f1f5f9',
            paddingTop: '0.5rem',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.78rem',
                color: '#64748b',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Filter size={13} /> Delivery Month:
            </span>
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              title={`Show ${meta.entityPlural} with packs delivered in this calendar month`}
              style={{
                height: 28,
                padding: '0 0.5rem',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                fontSize: '0.78rem',
                background: '#fff',
              }}
            >
              <option value="">All Months</option>
              {DELIVERY_MONTHS.map(m => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <div
              style={{
                marginLeft: 12,
                borderLeft: '1px solid #e2e8f0',
                paddingLeft: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '0.78rem',
                  color: '#475569',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={deliveredDateFilterEnabled}
                  onChange={e => setDeliveredDateFilterEnabled(e.target.checked)}
                />
                Delivered date range
              </label>
              <span
                style={{
                  fontSize: '0.78rem',
                  color: deliveredDateFilterEnabled ? '#64748b' : '#94a3b8',
                }}
              >
                From
              </span>
              <input
                type="date"
                value={deliveredFrom}
                disabled={!deliveredDateFilterEnabled}
                onChange={e => {
                  const nextFrom = e.target.value
                  setDeliveredFrom(nextFrom)
                  if (nextFrom && deliveredTo && nextFrom > deliveredTo) {
                    setDeliveredTo(nextFrom)
                  }
                }}
                style={{
                  height: 28,
                  padding: '0 0.5rem',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.78rem',
                  opacity: deliveredDateFilterEnabled ? 1 : 0.55,
                }}
              />
              <span
                style={{
                  fontSize: '0.78rem',
                  color: deliveredDateFilterEnabled ? '#64748b' : '#94a3b8',
                }}
              >
                To
              </span>
              <input
                type="date"
                value={deliveredTo}
                disabled={!deliveredDateFilterEnabled}
                onChange={e => {
                  const nextTo = e.target.value
                  setDeliveredTo(nextTo)
                  if (nextTo && deliveredFrom && nextTo < deliveredFrom) {
                    setDeliveredFrom(nextTo)
                  }
                }}
                style={{
                  height: 28,
                  padding: '0 0.5rem',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.78rem',
                  opacity: deliveredDateFilterEnabled ? 1 : 0.55,
                }}
              />
              {deliveredDateFilterEnabled ? (
                <button
                  type="button"
                  onClick={clearDeliveredDateFilter}
                  style={{
                    height: 28,
                    padding: '0 0.5rem',
                    borderRadius: 4,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Show all {meta.entityPlural}
                </button>
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: 240 }}>
                  All {meta.entityPlural} · delivered packs = Jan 1 – today
                </span>
              )}
            </div>

            <label
              style={{
                marginLeft: 12,
                borderLeft: '1px solid #e2e8f0',
                paddingLeft: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.78rem',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={includeExcluded}
                onChange={e => setIncludeExcluded(e.target.checked)}
              />
              Show {meta.entityPlural} not marked “In Report?”
            </label>
          </div>

          {/* View Mode Tabs */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              background: '#f1f5f9',
              padding: 2,
              borderRadius: 6,
              gap: 2,
            }}
          >
            {(
              [
                ['master', meta.masterTabLabel, Table],
                ['senate_perf', '1. Procurement & Delivery', CircleDollarSign],
                ['senate_status', '2. Implementation Status', ClipboardList],
                ['senate_region', '3. Regional Distribution', MapPinned],
                ['senate_center', '4. Center Distribution', Building2],
                ['senate_delivery', '5. Contract & Delivery Details', CircleDollarSign],
                ['milk_procurement', '6. Milk Procurement Status', FileSpreadsheet],
                ['monthly_cummulated', '7. CDP Report', BarChart2],
                ['major_accomplishments', '8. Major Accomplishments', Layers],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: activeTab === id ? '#ffffff' : 'transparent',
                  color: activeTab === id ? '#1e293b' : '#64748b',
                  boxShadow: activeTab === id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div
        className="no-print"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          padding: '0.75rem 1.5rem',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            padding: '0.625rem 1rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            {meta.filteredKpiLabel}
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1e293b', marginTop: 2 }}>
            {stats.count.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '0.625rem 1rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            Packs to Deliver
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
            {stats.totalPacks.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '0.625rem 1rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
            }}
            title={`${formatRangeLabel(effectiveDeliveredRange.from)} – ${formatRangeLabel(effectiveDeliveredRange.to)}`}
          >
            Delivered Packs
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#059669', marginTop: 2 }}>
            {stats.totalDelivered.toLocaleString()}
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#10b981',
                marginLeft: 6,
              }}
            >
              ({stats.pctDelivered.toFixed(1)}%)
            </span>
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '0.625rem 1rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            Contract Amount
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309', marginTop: 2 }}>
            {fmtPeso(stats.totalContractAmt)}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '0.625rem 1rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            Total Funds
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ea580c', marginTop: 2 }}>
            {fmtPeso(stats.totalAmount)}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '0.625rem 1rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            Beneficiaries
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>
            {stats.totalBeneficiaries.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '0.625rem 1rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            Coops Participating
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f766e', marginTop: 2 }}>
            {stats.totalCoops.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Coops by region pills */}
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
                <span style={{ fontWeight: 800, color: active ? '#115e59' : '#cbd5e1' }}>
                  {reg.coopCount}
                </span>
              </span>
            )
          })}
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
            Loading {meta.shortLabel} monitoring dataset...
          </div>
        )}

        {!loading && (
          <>
            {activeTab === 'master' && (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  className="print-only"
                  style={{ display: 'none', padding: '1rem 1rem 0.5rem', textAlign: 'center' }}
                >
                  <h2
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      margin: 0,
                      textTransform: 'uppercase',
                    }}
                  >
                    {meta.printTitle}
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                    Live from each center&apos;s {meta.shortLabel} procurement table (Section 1).
                  </p>
                  <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: 4 }}>
                    CY {year} | Filtered as of:{' '}
                    {new Date().toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
                  <table
                    style={{
                      width: '100%',
                      minWidth: 2000,
                      borderCollapse: 'collapse',
                      fontSize: '0.78rem',
                      fontFamily: 'Arial, sans-serif',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: '#e2e8f0',
                          color: '#1e293b',
                          borderBottom: '2px solid #94a3b8',
                        }}
                      >
                        {[
                          { label: '#', w: 45, align: 'center' as const },
                          { label: 'Region', w: 75, align: 'center' as const },
                          { label: meta.entitySingular, minW: 170, align: 'left' as const },
                          { label: 'Center', w: 85, align: 'center' as const },
                          { label: 'Cooperative', minW: 150, align: 'left' as const },
                          { label: 'Procurement Status', minW: 165, align: 'center' as const },
                          { label: 'Milk Type', w: 95, align: 'center' as const },
                          { label: `Amount (${PESO})`, minW: 110, align: 'right' as const },
                          { label: 'Mode of Procurement', minW: 130, align: 'left' as const },
                          { label: 'PR Date', w: 95, align: 'center' as const },
                          { label: 'PR Number', minW: 110, align: 'left' as const },
                          { label: 'ORS Date', w: 95, align: 'center' as const },
                          { label: 'PO Number', minW: 110, align: 'left' as const },
                          { label: 'Batch', w: 75, align: 'center' as const },
                          { label: 'Beneficiaries', w: 95, align: 'right' as const },
                          { label: `Contract Amt (${PESO})`, minW: 120, align: 'right' as const },
                          { label: 'Delivery Start', w: 95, align: 'center' as const },
                          { label: 'Delivery End', w: 95, align: 'center' as const },
                          { label: 'Packs to Deliver', minW: 115, align: 'right' as const },
                          { label: 'Delivered Packs', minW: 115, align: 'right' as const },
                          { label: 'Payment Status', w: 105, align: 'center' as const },
                          { label: 'Remarks', minW: 160, align: 'left' as const },
                        ].map(col => (
                          <th
                            key={col.label}
                            style={{
                              border: '1px solid #cbd5e1',
                              padding: '6px 8px',
                              width: col.w,
                              minWidth: col.minW,
                              textAlign: col.align,
                              fontWeight: 700,
                              position: 'sticky',
                              top: 0,
                              background: '#e2e8f0',
                              zIndex: 5,
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.length === 0 && (
                        <tr>
                          <td
                            colSpan={22}
                            style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}
                          >
                            No records found matching the active filters.
                          </td>
                        </tr>
                      )}
                      {filteredRecords.map((r, i) => {
                        const v = getViewForSource(r.id)
                        if (!v) return null
                        const statusCfg = STATUS_BADGE[v.procurement_status] || {
                          bg: '#f1f5f9',
                          color: '#475569',
                        }
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
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                                fontWeight: 700,
                              }}
                            >
                              {v.region}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                fontWeight: 600,
                                color: '#0f172a',
                              }}
                            >
                              {v.sdo}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                                color: '#475569',
                              }}
                            >
                              {v.center}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                color: '#0f172a',
                              }}
                            >
                              {v.coop_name}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                textAlign: 'center',
                              }}
                            >
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: statusCfg.bg,
                                  color: statusCfg.color,
                                }}
                              >
                                {v.procurement_status}
                              </span>
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                                color: '#475569',
                              }}
                            >
                              {v.milk_type}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                textAlign: 'right',
                              }}
                            >
                              {v.amount > 0 ? fmtPeso(v.amount) : '—'}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>
                              {v.mode_of_procurement}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                              }}
                            >
                              {v.pr_date_received}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>
                              {v.pr_number}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                              }}
                            >
                              {v.ors_date}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>
                              {v.po_number}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                              }}
                            >
                              {v.batch}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                textAlign: 'right',
                                fontWeight: 600,
                              }}
                            >
                              {v.beneficiaries_pm > 0
                                ? v.beneficiaries_pm.toLocaleString()
                                : '—'}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                textAlign: 'right',
                                fontWeight: 600,
                              }}
                            >
                              {v.contract_amount > 0 ? fmtPeso(v.contract_amount) : '—'}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                              }}
                            >
                              {v.delivery_start}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                              }}
                            >
                              {v.delivery_end}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                textAlign: 'right',
                                fontWeight: 700,
                                color: '#1e40af',
                              }}
                            >
                              {v.packs_to_deliver > 0
                                ? v.packs_to_deliver.toLocaleString()
                                : '—'}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                textAlign: 'right',
                                fontWeight: 700,
                                color: '#065f46',
                                background: delivered > 0 ? '#f0fdf4' : undefined,
                              }}
                            >
                              {delivered > 0 ? delivered.toLocaleString() : '—'}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 6px',
                                textAlign: 'center',
                              }}
                            >
                              {v.status_of_payment}
                            </td>
                            <td
                              style={{
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                color: '#475569',
                              }}
                            >
                              {v.remarks}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {filteredRecords.length > 0 && (
                      <tfoot>
                        <tr
                          style={{
                            background: '#dbeafe',
                            color: '#1e3a8a',
                            fontWeight: 800,
                            borderTop: '2px solid #3b82f6',
                          }}
                        >
                          <td
                            colSpan={7}
                            style={{
                              border: '1px solid #93c5fd',
                              padding: '8px 10px',
                              textAlign: 'left',
                            }}
                          >
                            GRAND TOTAL ({stats.count} {meta.entityPlural} · {stats.rowCount} rows)
                          </td>
                          <td
                            style={{
                              border: '1px solid #93c5fd',
                              padding: '8px',
                              textAlign: 'right',
                            }}
                          >
                            {fmtPeso(stats.totalAmount)}
                          </td>
                          <td colSpan={6} style={{ border: '1px solid #93c5fd' }} />
                          <td
                            style={{
                              border: '1px solid #93c5fd',
                              padding: '8px',
                              textAlign: 'right',
                            }}
                          >
                            {stats.totalBeneficiaries.toLocaleString()}
                          </td>
                          <td
                            style={{
                              border: '1px solid #93c5fd',
                              padding: '8px',
                              textAlign: 'right',
                            }}
                          >
                            {fmtPeso(stats.totalContractAmt)}
                          </td>
                          <td colSpan={2} style={{ border: '1px solid #93c5fd' }} />
                          <td
                            style={{
                              border: '1px solid #93c5fd',
                              padding: '8px',
                              textAlign: 'right',
                            }}
                          >
                            {stats.totalPacks.toLocaleString()}
                          </td>
                          <td
                            style={{
                              border: '1px solid #93c5fd',
                              padding: '8px',
                              textAlign: 'right',
                              color: '#047857',
                            }}
                          >
                            {stats.totalDelivered.toLocaleString()}
                          </td>
                          <td colSpan={2} style={{ border: '1px solid #93c5fd' }} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            <ProgramSpreadsheetSecondaryTabs
              activeTab={activeTab}
              meta={meta}
              year={year}
              filteredRecords={filteredRecords}
              getViewForSource={getViewForSource}
              sdoIndexMeta={sdoIndexMeta}
              stats={stats}
              regionalSummary={regionalSummary}
              centerSummary={centerSummary}
              deliveryDetailsRows={deliveryDetailsRows}
              implSummary={implSummary}
              milkAsOfMonth={milkAsOfMonth}
              setMilkAsOfMonth={setMilkAsOfMonth}
              milkAsOfYear={milkAsOfYear}
              setMilkAsOfYear={setMilkAsOfYear}
              mcFromMonth={mcFromMonth}
              setMcFromMonth={setMcFromMonth}
              mcToMonth={mcToMonth}
              setMcToMonth={setMcToMonth}
              majorAsOf={majorAsOf}
              setMajorAsOf={setMajorAsOf}
              todayIso={todayIso}
              majorLoading={majorLoading}
              liveYears={liveYears}
              liveMajor={liveMajor}
              majorTargets={majorTargets}
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              editingValue={editingValue}
              setEditingValue={setEditingValue}
              savingCell={savingCell}
              saveMajorTarget={saveMajorTarget}
            />
          </>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body, html { background: white !important; height: auto !important; overflow: visible !important; }
          @page { size: A4 landscape; margin: 8mm 6mm; }
          div { overflow: visible !important; max-height: none !important; height: auto !important; }
          table {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            table-layout: auto !important;
            font-size: 6.2pt !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
          }
          th, td {
            position: static !important;
            padding: 2px 3px !important;
            font-size: 6.2pt !important;
            line-height: 1.15 !important;
            word-break: normal !important;
            white-space: nowrap !important;
            border: 1px solid #cbd5e1 !important;
            vertical-align: middle !important;
          }
          th { white-space: normal !important; word-break: normal !important; }
          thead { display: table-header-group !important; }
          thead tr {
            background-color: #f1f5f9 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          thead th {
            background-color: #e2e8f0 !important;
            color: #0f172a !important;
            font-weight: 700 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          tr { page-break-inside: avoid !important; }
          .major-acc thead th {
            background-color: #002654 !important;
            color: #facc15 !important;
            font-size: 9pt !important;
          }
          .major-acc td {
            font-size: 9pt !important;
            padding: 8px 6px !important;
            border: 1.5px solid #0f172a !important;
          }
        }
      `}</style>
    </div>
  )
}
