import os

target = r'C:\pcc folder\PCC\mfp-web\srcpp\(app)eports\sbfp-narrative\page.tsx'

part1 = ''''use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Printer, Download, Filter, Search, RotateCcw, Table, BarChart2, Layers } from 'lucide-react'

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
'''

part2 = '''
export default function SbfpSpreadsheetReport() {
  const [records, setRecords]               = useState<any[]>([])
  const [loading, setLoading]               = useState(true)
  const [year, setYear]                     = useState('2026')
  const [reportDate, setReportDate]         = useState(() => new Date().toISOString().split('T')[0])
  const [filterRegion, setFilterRegion]     = useState('ALL')
  const [filterCenter, setFilterCenter]     = useState('ALL')
  const [filterStatus, setFilterStatus]     = useState('ALL')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate]   = useState('')
  const [searchQuery, setSearchQuery]       = useState('')
  const [activeTab, setActiveTab]           = useState<'master' | 'region_summary' | 'status_matrix'>('master')

  const supabase = createClient()

  useEffect(() => {
    setLoading(true)
    supabase
      .from('sbfp_data')
      .select('*')
      .eq('year', parseInt(year))
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching SBFP data:', error)
          setRecords([])
        } else {
          const sorted = (data || []).sort((a, b) => {
            const rA = regionSortKey(a.region), rB = regionSortKey(b.region)
            if (rA !== rB) return rA - rB
            return (a.sdo || '').localeCompare(b.sdo || '')
          })
          setRecords(sorted)
        }
        setLoading(false)
      })
  }, [year])

  const distinctCenters = useMemo(() => {
    const set = new Set<string>()
    records.forEach(r => { if (r.center) set.add(r.center) })
    return Array.from(set).sort()
  }, [records])

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

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (filterRegion !== 'ALL' && r.region !== filterRegion) return false
      if (filterCenter !== 'ALL' && r.center !== filterCenter) return false
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
  }, [records, filterRegion, filterCenter, filterStatus, searchQuery, filterStartDate, filterEndDate])

  const getDeliveredPacks = (r: any): number => {
    const snaps: Array<{ date: string; packs: number }> = r.delivery_snapshots || []
    if (snaps.length === 0) return r.packs_delivered || 0
    const best = snaps
      .filter(s => !reportDate || s.date <= reportDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return best?.packs || (r.packs_delivered || 0)
  }

  const stats = useMemo(() => {
    let totalPacks = 0
    let totalDelivered = 0
    let totalContractAmt = 0
    let totalAmount = 0
    let totalBeneficiaries = 0

    const statusCounts: Record<string, number> = {}

    filteredRecords.forEach(r => {
      totalPacks += Number(r.packs_to_deliver) || 0
      totalDelivered += getDeliveredPacks(r)
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
  }, [filteredRecords, reportDate])
'''
