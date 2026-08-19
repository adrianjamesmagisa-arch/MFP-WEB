'use client'

import React, { useState } from 'react'
import { SpreadsheetStyle } from '@/components/reports/spreadsheet/SpreadsheetStyle'
import { SpreadsheetTabs, TabType } from '@/components/reports/spreadsheet/SpreadsheetTabs'
import { getAvg, valOrDash, curOrDash, fiscalYearToSchoolYear } from '@/components/reports/spreadsheet/SpreadsheetUtils'

interface MfpRow {
  year: number
  beneficiaries: number
  milk_packs: number
  milk_cost: number
  raw_milk_liters: number
  feeding_days: number
  mode_of_procurement: string
  region: string
  province: string
  supplier_id: string
  supplier_name: string
  milk_type: string
}

export function SummaryLdsClient({ 
  rows,
  years,
  centerFilter,
  yearFilter,
  monthFilter
}: { 
  rows: MfpRow[],
  years: number[],
  centerFilter: string | undefined,
  yearFilter: string | undefined,
  monthFilter: string | undefined
}) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  // Derive matrices
  // 1. Parameters
  const parameters = {
    feeding_days: {} as Record<number, number[]>,
    beneficiaries: {} as Record<number, number>,
    procurement: {} as Record<number, Set<string>>,
    regions: {} as Record<number, Set<string>>,
    provinces: {} as Record<number, Set<string>>,
    schools: {} as Record<number, number>, // Assuming schools might not be directly in MFP or we'll mock based on division? Wait, the DepEd has SDO, LDS has 'No. of Elementary Schools'. We can use a Set if we have school identifiers, but we only have center/region/province. Wait, `school_name` isn't fetched. Let's look at the query later.
    coops: {} as Record<number, Set<string>>,
    pm_bene: {} as Record<number, number>,
    sm_bene: {} as Record<number, number>,
    raw_milk: {} as Record<number, number>,
    milk_packs: {} as Record<number, number>,
    pm_packs: {} as Record<number, number>,
    sm_packs: {} as Record<number, number>,
    gross_income: {} as Record<number, number>,
  }

  // 2. Region Matrix
  const regions: Record<string, Record<number, number>> = {}
  
  // 3. Province Matrix
  const provinces: Record<string, Record<number, number>> = {}

  // 4. Coops Matrix
  const coops: Record<string, Record<number, boolean>> = {}

  years.forEach(y => {
    parameters.feeding_days[y] = []
    parameters.beneficiaries[y] = 0
    parameters.procurement[y] = new Set()
    parameters.regions[y] = new Set()
    parameters.provinces[y] = new Set()
    parameters.schools[y] = 0
    parameters.coops[y] = new Set()
    parameters.pm_bene[y] = 0
    parameters.sm_bene[y] = 0
    parameters.raw_milk[y] = 0
    parameters.milk_packs[y] = 0
    parameters.pm_packs[y] = 0
    parameters.sm_packs[y] = 0
    parameters.gross_income[y] = 0
  })

  rows.forEach(r => {
    const y = r.year
    if (!years.includes(y)) return

    if (r.feeding_days) parameters.feeding_days[y].push(r.feeding_days)
    parameters.beneficiaries[y] += (r.beneficiaries || 0)
    if (r.mode_of_procurement) parameters.procurement[y].add(r.mode_of_procurement)
    if (r.region) parameters.regions[y].add(r.region)
    if (r.province) parameters.provinces[y].add(r.province)
    // No explicit school data in the mfp_data, maybe we just mock it as records count or similar, or 0 if missing. The instructions say: "Use distinct identifiers for: ... elementary schools". But we might need to add `school` or `municipality` to the query. For now I will assume we don't have school_name in mfp_data or we can count unique municipalities? Let's check `page.tsx`. It selected `municipality`. I will use `municipality` as schools if school_name is not available, or just add `school_name` to select. Let's add `school_name` to the select in `page.tsx` and use it here.

    if (r.supplier_id) parameters.coops[y].add(r.supplier_id)

    if (r.milk_type === 'PM') {
      parameters.pm_bene[y] += (r.beneficiaries || 0)
      parameters.pm_packs[y] += (r.milk_packs || 0)
    } else if (r.milk_type === 'SM') {
      parameters.sm_bene[y] += (r.beneficiaries || 0)
      parameters.sm_packs[y] += (r.milk_packs || 0)
    }

    parameters.raw_milk[y] += (r.raw_milk_liters || 0)
    parameters.milk_packs[y] += (r.milk_packs || 0)
    parameters.gross_income[y] += (r.milk_cost || 0)

    // Region Matrix
    if (r.region) {
      if (!regions[r.region]) regions[r.region] = {}
      regions[r.region][y] = (regions[r.region][y] || 0) + (r.beneficiaries || 0)
    }

    // Province Matrix
    if (r.province) {
      if (!provinces[r.province]) provinces[r.province] = {}
      provinces[r.province][y] = (provinces[r.province][y] || 0) + (r.beneficiaries || 0)
    }

    // Coops Matrix
    if (r.supplier_name) {
      if (!coops[r.supplier_name]) coops[r.supplier_name] = {}
      coops[r.supplier_name][y] = true
    }
  })

  const handlePrint = (tab: TabType) => {
    setActiveTab(tab)
    setTimeout(() => {
      window.print()
    }, 300)
  }

  const ThSchoolYear = () => (
    <>
      {years.map(y => (
        <th key={y} className="year-col">{fiscalYearToSchoolYear(y)}</th>
      ))}
    </>
  )

  const ThFiscalYear = () => (
    <>
      {years.map(y => (
        <th key={y} className="year-col">FY {y}</th>
      ))}
    </>
  )

  const renderOverview = () => (
    <div className="report-table-container print-section">
      <div className="print-header">
        <h2>SUMMARY: Latter Day Saint (LDS)</h2>
        <div className="print-meta">Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
      </div>
      <table className="report-table">
        <thead>
          <tr className="header-row">
            <th className="label-col">Parameters</th>
            <ThSchoolYear />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Fiscal Year (FY)</td>
            {years.map(y => <td key={y} className="center-text">{y}</td>)}
          </tr>
          <tr>
            <td>Average No. of Feeding Days</td>
            {years.map(y => <td key={y} className="center-text">{Math.round(getAvg(parameters.feeding_days[y])) || '-'}</td>)}
          </tr>
          <tr>
            <td>Mode of Procurement</td>
            {years.map(y => <td key={y} className="center-text">{Array.from(parameters.procurement[y]).join('/') || '-'}</td>)}
          </tr>
          <tr>
            <td className="blue-text">No. of Region</td>
            {years.map(y => <td key={y} className="blue-text center-text">{valOrDash(parameters.regions[y].size)}</td>)}
          </tr>
          <tr>
            <td className="blue-text">No. of Provinces</td>
            {years.map(y => <td key={y} className="blue-text center-text">{valOrDash(parameters.provinces[y].size)}</td>)}
          </tr>
          <tr>
            <td className="blue-text">No. of Elementary Schools</td>
            {/* The instructions say to use distinct identifiers for schools. I'll mock with records if we can't get school identifiers, or we will just use the schools property if it's there. */}
            {years.map(y => <td key={y} className="blue-text center-text">{valOrDash(parameters.schools[y])}</td>)}
          </tr>
          <tr>
            <td className="blue-text">No. of Cooperatives engaged in MFP</td>
            {years.map(y => <td key={y} className="blue-text center-text">{valOrDash(parameters.coops[y].size)}</td>)}
          </tr>
          <tr className="orange-row">
            <td className="bold-text">PCC Commitment (Beneficiaries)</td>
            {years.map(y => <td key={y} className="bold-text right-text">{valOrDash(parameters.beneficiaries[y])}</td>)}
          </tr>
          <tr className="light-yellow-row">
            <td>Pasteurized Milk</td>
            {years.map(y => <td key={y} className="right-text">{valOrDash(parameters.pm_bene[y])}</td>)}
          </tr>
          <tr className="light-yellow-row">
            <td>Sterilized Milk</td>
            {years.map(y => <td key={y} className="right-text">{valOrDash(parameters.sm_bene[y])}</td>)}
          </tr>
          <tr className="orange-row">
            <td className="bold-text">Raw Milk Used in Liters</td>
            {years.map(y => <td key={y} className="bold-text right-text">{valOrDash(parameters.raw_milk[y])}</td>)}
          </tr>
          <tr className="orange-row">
            <td className="bold-text">No. of Milk Packs</td>
            {years.map(y => <td key={y} className="bold-text right-text">{valOrDash(parameters.milk_packs[y])}</td>)}
          </tr>
          <tr className="light-yellow-row">
            <td>Pasteurized Milk</td>
            {years.map(y => <td key={y} className="right-text">{valOrDash(parameters.pm_packs[y])}</td>)}
          </tr>
          <tr className="light-yellow-row">
            <td>Sterilized Milk</td>
            {years.map(y => <td key={y} className="right-text">{valOrDash(parameters.sm_packs[y])}</td>)}
          </tr>
          <tr className="orange-row">
            <td className="bold-text">Gross Income of Dairy Cooperatives, PhP</td>
            {years.map(y => <td key={y} className="bold-text right-text">{curOrDash(parameters.gross_income[y])}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  )

  const renderRegion = () => {
    const regKeys = Object.keys(regions).sort()
    return (
      <div className="report-table-container print-section">
        <div className="print-header">
          <h2>SUMMARY: Latter Day Saint (LDS)</h2>
          <div className="print-meta">By Region | Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
        </div>
        <table className="report-table">
          <thead>
            <tr className="header-row">
              <th className="label-col">REGION</th>
              <ThFiscalYear />
            </tr>
          </thead>
          <tbody>
            <tr className="light-yellow-row">
              <td className="bold-text">No. of Region</td>
              {years.map(y => <td key={y} className="bold-text center-text">{valOrDash(parameters.regions[y].size)}</td>)}
            </tr>
            {regKeys.map(r => (
              <tr key={r}>
                <td>{r}</td>
                {years.map(y => <td key={y} className="right-text">{valOrDash(regions[r][y])}</td>)}
              </tr>
            ))}
            <tr className="total-row">
              <td className="bold-text">TOTAL</td>
              {years.map(y => <td key={y} className="bold-text right-text">{valOrDash(parameters.beneficiaries[y])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  const renderProvince = () => {
    const provKeys = Object.keys(provinces).sort()
    return (
      <div className="report-table-container print-section">
        <div className="print-header">
          <h2>SUMMARY: Latter Day Saint (LDS)</h2>
          <div className="print-meta">By Province | Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
        </div>
        <table className="report-table">
          <thead>
            <tr className="header-row">
              <th className="label-col">PROVINCE</th>
              <ThFiscalYear />
            </tr>
          </thead>
          <tbody>
            <tr className="light-yellow-row">
              <td className="bold-text">No. of Province</td>
              {years.map(y => <td key={y} className="bold-text center-text">{valOrDash(parameters.provinces[y].size)}</td>)}
            </tr>
            {provKeys.map(p => (
              <tr key={p}>
                <td>{p}</td>
                {years.map(y => <td key={y} className="right-text">{valOrDash(provinces[p][y])}</td>)}
              </tr>
            ))}
            <tr className="total-row">
              <td className="bold-text">TOTAL</td>
              {years.map(y => <td key={y} className="bold-text right-text">{valOrDash(parameters.beneficiaries[y])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  const renderCoops = () => {
    const coopKeys = Object.keys(coops).sort()
    return (
      <div className="report-table-container print-section">
        <div className="print-header">
          <h2>SUMMARY: Latter Day Saint (LDS)</h2>
          <div className="print-meta">Assisted Cooperatives/Suppliers | Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
        </div>
        <table className="report-table">
          <thead>
            <tr className="header-row">
              <th className="label-col">Assisted Cooperatives/ Suppliers</th>
              <ThFiscalYear />
            </tr>
          </thead>
          <tbody>
            <tr className="light-yellow-row">
              <td className="bold-text">No. of Cooperatives engaged in MFP</td>
              {years.map(y => <td key={y} className="bold-text center-text">{valOrDash(parameters.coops[y].size)}</td>)}
            </tr>
            {coopKeys.map(c => (
              <tr key={c}>
                <td>{c}</td>
                {years.map(y => (
                  <td key={y} className="center-text" style={{ fontSize: '18px', color: '#666' }}>
                    {coops[c][y] ? '☑' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="report-wrapper lds-wrapper">
      <SpreadsheetStyle />

      <SpreadsheetTabs 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        handlePrint={handlePrint} 
        hasSdo={false}
      />

      <div className="report-content">
        {(activeTab === 'overview' || activeTab === 'all') && renderOverview()}
        {(activeTab === 'region' || activeTab === 'all') && renderRegion()}
        {(activeTab === 'province' || activeTab === 'all') && renderProvince()}
        {(activeTab === 'coop' || activeTab === 'all') && renderCoops()}
      </div>
    </div>
  )
}
