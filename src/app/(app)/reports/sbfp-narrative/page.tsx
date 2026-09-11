'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Printer, Download, Filter, Search, RotateCcw, Table, BarChart2, Layers } from 'lucide-react'
import { SBFP_DATA_ENCODER_COLUMNS } from '@/lib/encoder-selects'
import { dbYearToSchoolYear, FALLBACK_SCHOOL_YEARS, schoolYearToDbYear } from '@/lib/sbfp-year'
import {
  mapSbfpRowToReportView,
  reportCenterFilterOptions,
  rowMatchesReportCenterFilter,
  sbfpRowIncludedInReport,
  type SbfpReportSourceRow,
} from '@/lib/sbfp-report-sync'

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

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  'For Preparation':            { bg: '#fef3c7', color: '#92400e' },
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
  const [reportDate, setReportDate]         = useState(() => new Date().toISOString().split('T')[0])
  const [filterRegion, setFilterRegion]     = useState('ALL')
  const [filterCenter, setFilterCenter]     = useState('ALL')
  const [filterStatus, setFilterStatus]     = useState('ALL')
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate]   = useState('')
  const [searchQuery, setSearchQuery]       = useState('')
  const [activeTab, setActiveTab]           = useState<'master' | 'region_summary' | 'status_matrix'>('master')

  const supabase = createClient()

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
    supabase
      .from('sbfp_data')
      .select(SBFP_DATA_ENCODER_COLUMNS)
      .eq('year', parseInt(year, 10))
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching SBFP data:', error)
          setRecords([])
        } else {
          const rows = (data || []) as unknown as SbfpReportSourceRow[]
          const sorted = rows.sort((a, b) => {
            const rA = regionSortKey(a.region || ''), rB = regionSortKey(b.region || '')
            if (rA !== rB) return rA - rB
            return (a.sdo || '').localeCompare(b.sdo || '')
          })
          setRecords(sorted)
        }
        setLoading(false)
      })
  }, [year])

  // Extract distinct centers and regions
  const distinctCenters = useMemo(
    () => reportCenterFilterOptions(records as SbfpReportSourceRow[]),
    [records],
  )

  const distinctRegions = useMemo(() => {
    const set = new Set<string>()
    records.forEach(r => { if (r.region) set.add(r.region) })
    return Array.from(set).sort((a, b) => regionSortKey(a) - regionSortKey(b))
  }, [records])

  const distinctStatuses = [
    'For Preparation',
    'Ongoing Procurement',
    'Ongoing (For Award)',
    'Awarded (For Delivery)',
    'Awarded (Ongoing Delivery)',
    'Completed',
    'Failed'
  ]
  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (!includeExcluded && !sbfpRowIncludedInReport(r)) return false
      if (filterRegion !== 'ALL' && r.region !== filterRegion) return false
      if (!rowMatchesReportCenterFilter(r as SbfpReportSourceRow, filterCenter)) return false
      if (filterStatus !== 'ALL' && (r.procurement_status || '').toLowerCase() !== filterStatus.toLowerCase()) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchSdo = (r.sdo || '').toLowerCase().includes(q)
        const matchCenter = (r.center || '').toLowerCase().includes(q)
        const matchRegion = (r.region || '').toLowerCase().includes(q)
        const matchPo = (r.po_number || '').toLowerCase().includes(q)
        const matchPr = (r.pr_number || '').toLowerCase().includes(q)
        if (!matchSdo && !matchCenter && !matchRegion && !matchPo && !matchPr) return false
      }
      if (filterStartDate) {
        const start = r.delivery_start || r.delivery_end
        if (start && start < filterStartDate) return false
      }
      if (filterEndDate) {
        const end = r.delivery_end || r.delivery_start
        if (end && end > filterEndDate) return false
      }
      return true
    })
  }, [records, filterRegion, filterCenter, filterStatus, searchQuery, filterStartDate, filterEndDate, includeExcluded])

  const viewRows = useMemo(() => {
    return (records as SbfpReportSourceRow[]).map(r => mapSbfpRowToReportView(r, reportDate))
  }, [records, reportDate])

  const getViewForSource = useCallback(
    (sourceId: string | undefined) => viewRows.find(v => v.source.id === sourceId),
    [viewRows],
  )

  // Summary statistics
  const stats = useMemo(() => {
    let totalPacks = 0
    let totalDelivered = 0
    let totalContractAmt = 0
    let totalAmount = 0
    let totalBeneficiaries = 0

    const statusCounts: Record<string, number> = {}

    filteredRecords.forEach(r => {
      const view = getViewForSource(r.id)
      totalPacks += view?.packs_to_deliver ?? 0
      totalDelivered += view?.delivered_packs ?? 0
      totalContractAmt += Number(r.contract_amount) || 0
      totalAmount += Number(r.amount) || 0
      totalBeneficiaries += Number(r.beneficiaries_pm) || 0

      const st = r.procurement_status || 'For Preparation'
      statusCounts[st] = (statusCounts[st] || 0) + 1
    })

    const pctDelivered = totalPacks > 0 ? (totalDelivered / totalPacks) * 100 : 0

    return {
      count: filteredRecords.length,
      totalPacks,
      totalDelivered,
      totalContractAmt,
      totalAmount,
      totalBeneficiaries,
      pctDelivered,
      statusCounts,
    }
  }, [filteredRecords, getViewForSource])

  // Regional Aggregations
  const regionalSummary = useMemo(() => {
    const map = new Map<string, {
      region: string
      sdoCount: number
      beneficiaries: number
      contractAmt: number
      targetPacks: number
      deliveredPacks: number
      forPrep: number
      ongoing: number
      awardedDelivery: number
      awardedOngoing: number
      completed: number
    }>()

    filteredRecords.forEach(r => {
      const reg = r.region || 'UNASSIGNED'
      if (!map.has(reg)) {
        map.set(reg, {
          region: reg,
          sdoCount: 0,
          beneficiaries: 0,
          contractAmt: 0,
          targetPacks: 0,
          deliveredPacks: 0,
          forPrep: 0,
          ongoing: 0,
          awardedDelivery: 0,
          awardedOngoing: 0,
          completed: 0,
        })
      }
      const entry = map.get(reg)!
      entry.sdoCount++
      entry.beneficiaries += Number(r.beneficiaries_pm) || 0
      entry.contractAmt += Number(r.contract_amount) || 0
      const view = getViewForSource(r.id)
      entry.targetPacks += view?.packs_to_deliver ?? 0
      entry.deliveredPacks += view?.delivered_packs ?? 0

      const st = (r.procurement_status || '').toLowerCase()
      if (st === 'for preparation') entry.forPrep++
      else if (st.includes('ongoing procurement') || st.includes('ongoing (for award)')) entry.ongoing++
      else if (st.includes('awarded (for delivery)')) entry.awardedDelivery++
      else if (st.includes('awarded (ongoing delivery)')) entry.awardedOngoing++
      else if (st.includes('completed') || st.includes('done')) entry.completed++
      else entry.forPrep++
    })

    return Array.from(map.values()).sort((a, b) => regionSortKey(a.region) - regionSortKey(b.region))
  }, [filteredRecords, getViewForSource])

  // Export to CSV Function
  const exportToCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No data to export.')
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

    const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')]

    filteredRecords.forEach((r, idx) => {
      const v = getViewForSource(r.id)
      if (!v) return
      const row = [
        idx + 1,
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
      ]

      csvRows.push(row.map(val => {
        if (val === null || val === undefined) return '""'
        const str = String(val).replace(/"/g, '""')
        return `"${str}"`
      }).join(','))
    })

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvRows.join('\r\n'))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', csvContent)
    const dateStr = new Date().toISOString().split('T')[0]
    downloadAnchor.setAttribute('download', `sbfp_procurement_monitoring_${year}_${dateStr}.csv`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    document.body.removeChild(downloadAnchor)
  }

  const clearFilters = () => {
    setFilterRegion('ALL')
    setFilterCenter('ALL')
    setFilterStatus('ALL')
    setFilterStartDate('')
    setFilterEndDate('')
    setSearchQuery('')
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
              <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)}
                style={{ height: 34, padding: '0 0.75rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}>
                <option value="ALL">All Centers ({distinctCenters.length})</option>
                {distinctCenters.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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
                {distinctStatuses.map(s => <option key={s} value={s}>{s}</option>)}
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
              <Filter size={13} /> Delivery Dates:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)}
                style={{ height: 28, padding: '0 0.5rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem' }} />
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>to</span>
              <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)}
                style={{ height: 28, padding: '0 0.5rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem' }} />
            </div>

            <div style={{ marginLeft: 12, borderLeft: '1px solid #e2e8f0', paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Delivered As Of:</span>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                title="Cumulative delivered packs use SBFP “Delivered as-of” columns through this date"
                style={{ height: 28, padding: '0 0.5rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem' }} />
            </div>

            <label style={{ marginLeft: 12, borderLeft: '1px solid #e2e8f0', paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeExcluded} onChange={e => setIncludeExcluded(e.target.checked)} />
              Show SDOs not marked “In Report?”
            </label>
          </div>

          {/* View Mode Tabs */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6, gap: 2 }}>
            <button
              onClick={() => setActiveTab('master')}
              style={{
                padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: activeTab === 'master' ? '#ffffff' : 'transparent',
                color: activeTab === 'master' ? '#1e293b' : '#64748b',
                boxShadow: activeTab === 'master' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              <Table size={13} /> SDO Masterlist ({filteredRecords.length})
            </button>

            <button
              onClick={() => setActiveTab('region_summary')}
              style={{
                padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: activeTab === 'region_summary' ? '#ffffff' : 'transparent',
                color: activeTab === 'region_summary' ? '#1e293b' : '#64748b',
                boxShadow: activeTab === 'region_summary' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              <BarChart2 size={13} /> Regional Summary
            </button>

            <button
              onClick={() => setActiveTab('status_matrix')}
              style={{
                padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: activeTab === 'status_matrix' ? '#ffffff' : 'transparent',
                color: activeTab === 'status_matrix' ? '#1e293b' : '#64748b',
                boxShadow: activeTab === 'status_matrix' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              <Layers size={13} /> Status Breakdown
            </button>
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
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Delivered Packs</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#059669', marginTop: 2 }}>
            {stats.totalDelivered.toLocaleString()}
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981', marginLeft: 6 }}>({stats.pctDelivered.toFixed(1)}%)</span>
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Contract Amount</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309', marginTop: 2 }}>?{stats.totalContractAmt.toLocaleString()}</div>
        </div>

        <div style={{ background: '#ffffff', padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Beneficiaries</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>{stats.totalBeneficiaries.toLocaleString()}</div>
        </div>
      </div>
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
                    Live from each center&apos;s SBFP SDO procurement table (same fields as Section 1). Refresh after encoding; use &quot;Delivered As Of&quot; to match cumulative delivery columns.
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
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 110, textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Amount (?)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', minWidth: 130, textAlign: 'left', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Mode of Procurement</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>PR Date</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', minWidth: 110, textAlign: 'left', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>PR Number</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>ORS Date</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', minWidth: 110, textAlign: 'left', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>PO Number</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 75, textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Batch</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: 95, textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Beneficiaries</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', minWidth: 120, textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#e2e8f0', zIndex: 5 }}>Contract Amt (?)</th>
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

                        return (
                          <tr key={r.id || i} style={{ background: rowBg }}>
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
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
                              {v.amount > 0 ? `\u20B1${v.amount.toLocaleString()}` : '—'}
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
                              {v.contract_amount > 0 ? `\u20B1${v.contract_amount.toLocaleString()}` : '—'}
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
                            GRAND TOTAL ({filteredRecords.length} SDOs)
                          </td>
                          <td style={{ border: '1px solid #93c5fd', padding: '8px', textAlign: 'right' }}>
                            {'\u20B1'}{stats.totalAmount.toLocaleString()}
                          </td>
                          <td colSpan={6} style={{ border: '1px solid #93c5fd' }}></td>
                          <td style={{ border: '1px solid #93c5fd', padding: '8px', textAlign: 'right' }}>
                            {stats.totalBeneficiaries.toLocaleString()}
                          </td>
                          <td style={{ border: '1px solid #93c5fd', padding: '8px', textAlign: 'right' }}>
                            {'\u20B1'}{stats.totalContractAmt.toLocaleString()}
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
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Beneficiaries</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Contract Amt (?)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Packs to Deliver</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>Delivered Packs</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'right' }}>% Delivered</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Prep</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Ongoing</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 90 }}>Awarded (Del)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 90 }}>Awarded (Ong)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px 8px', textAlign: 'center', width: 80 }}>Done</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionalSummary.map((reg, i) => {
                        const pct = reg.targetPacks > 0 ? (reg.deliveredPacks / reg.targetPacks) * 100 : 0
                        return (
                          <tr key={reg.region} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'center', fontWeight: 800 }}>{reg.region}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{reg.sdoCount}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right' }}>{reg.beneficiaries.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right' }}>?{reg.contractAmt.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{reg.targetPacks.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{reg.deliveredPacks.toLocaleString()}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{reg.forPrep || '?'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{reg.ongoing || '?'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{reg.awardedDelivery || '?'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{reg.awardedOngoing || '?'}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#047857' }}>{reg.completed || '?'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'center' }}>TOTAL</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.count}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.totalBeneficiaries.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>?{stats.totalContractAmt.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.totalPacks.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right', color: '#047857' }}>{stats.totalDelivered.toLocaleString()}</td>
                        <td style={{ border: '1px solid #93c5fd', padding: '8px 10px', textAlign: 'right' }}>{stats.pctDelivered.toFixed(1)}%</td>
                        <td colSpan={5} style={{ border: '1px solid #93c5fd' }}></td>
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
                    {distinctStatuses.map(st => {
                      const count = stats.statusCounts[st] || 0
                      const pct = stats.count > 0 ? (count / stats.count) * 100 : 0
                      const cfg = STATUS_BADGE[st] || { bg: '#f1f5f9', color: '#475569' }
                      return (
                        <tr key={st}>
                          <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700, background: cfg.bg, color: cfg.color }}>
                              {st}
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
                      <td style={{ border: '1px solid #93c5fd', padding: '8px 12px' }}>TOTAL SDOs</td>
                      <td style={{ border: '1px solid #93c5fd', padding: '8px 12px', textAlign: 'right' }}>{stats.count}</td>
                      <td style={{ border: '1px solid #93c5fd', padding: '8px 12px', textAlign: 'right' }}>100.0%</td>
                    </tr>
                  </tfoot>
                </table>
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
