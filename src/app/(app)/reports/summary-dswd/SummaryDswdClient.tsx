'use client'

import React, { useState } from 'react'
import { SpreadsheetStyle } from '@/components/reports/spreadsheet/SpreadsheetStyle'
import { SpreadsheetTabs, TabType } from '@/components/reports/spreadsheet/SpreadsheetTabs'
import { getAvg, valOrDash, curOrDash } from '@/components/reports/spreadsheet/SpreadsheetUtils'

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
  component: string // 'milk' or 'hot_meals'
}

type DswdComponent = 'milk' | 'hot_meals' | 'all'

export function SummaryDswdClient({ 
  rows,
  centerFilter,
  yearFilter,
  monthFilter
}: { 
  rows: MfpRow[],
  centerFilter: string | undefined,
  yearFilter: string | undefined,
  monthFilter: string | undefined
}) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [activeComponent, setActiveComponent] = useState<DswdComponent>('milk')

  const handlePrint = (tab: TabType) => {
    setActiveTab(tab)
    setTimeout(() => {
      window.print()
    }, 300)
  }

  function cycleToSchoolYear(cycle: number): string {
    const startYear = 2010 + cycle;
    return `SY ${startYear}-${startYear + 1}`;
  }

  function formatCycleLabel(cycle: number): string {
    const mod100 = cycle % 100;
    const mod10 = cycle % 10;
    let suffix = "th";
    if (mod100 < 11 || mod100 > 13) {
      if (mod10 === 1) suffix = "st";
      if (mod10 === 2) suffix = "nd";
      if (mod10 === 3) suffix = "rd";
    }
    return `${cycle}${suffix} Cycle`;
  }

  const renderReportForComponent = (comp: 'milk' | 'hot_meals', isAll: boolean) => {
    const compRows = rows.filter(r => r.component === comp)
    const label = comp === 'milk' ? 'Milk Component' : 'Hot Meals'
    
    // Extract cycles for this component
    const allCycles = Array.from(new Set(compRows.map(r => r.year - 2010))).sort((a,b) => a - b)
    let cycles = allCycles
    if (yearFilter && yearFilter !== '__ALL_YEARS__') {
      const y = parseInt(yearFilter) - 2010
      cycles = allCycles.includes(y) ? [y] : [y]
    }

    // Default cycles if empty
    if (cycles.length === 0) {
      cycles = [10] // At least show one cycle structure if no data
    }

    const parameters = {
      feeding_days: {} as Record<number, number[]>,
      beneficiaries: {} as Record<number, number>,
      procurement: {} as Record<number, Set<string>>,
      regions: {} as Record<number, Set<string>>,
      provinces: {} as Record<number, Set<string>>,
      municipalities: {} as Record<number, Set<string>>,
      coops: {} as Record<number, Set<string>>,
      pm_bene: {} as Record<number, number>,
      sm_bene: {} as Record<number, number>,
      karabun_bene: {} as Record<number, number>,
      raw_milk: {} as Record<number, number>,
      milk_packs: {} as Record<number, number>,
      pm_packs: {} as Record<number, number>,
      sm_packs: {} as Record<number, number>,
      karabun_packs: {} as Record<number, number>,
      gross_income: {} as Record<number, number>,
      admin_cost: {} as Record<number, number>,
      total_funds: {} as Record<number, number>,
    }

    const regions: Record<string, Record<number, number>> = {}
    const provinces: Record<string, Record<number, number>> = {}
    const coops: Record<string, Record<number, boolean>> = {}

    cycles.forEach(c => {
      parameters.feeding_days[c] = []
      parameters.beneficiaries[c] = 0
      parameters.procurement[c] = new Set()
      parameters.regions[c] = new Set()
      parameters.provinces[c] = new Set()
      parameters.municipalities[c] = new Set()
      parameters.coops[c] = new Set()
      parameters.pm_bene[c] = 0
      parameters.sm_bene[c] = 0
      parameters.karabun_bene[c] = 0
      parameters.raw_milk[c] = 0
      parameters.milk_packs[c] = 0
      parameters.pm_packs[c] = 0
      parameters.sm_packs[c] = 0
      parameters.karabun_packs[c] = 0
      parameters.gross_income[c] = 0
      parameters.admin_cost[c] = 0
      parameters.total_funds[c] = 0
    })

    compRows.forEach(r => {
      const c = r.year - 2010
      if (!cycles.includes(c)) return

      if (r.feeding_days) parameters.feeding_days[c].push(r.feeding_days)
      parameters.beneficiaries[c] += (r.beneficiaries || 0)
      if (r.mode_of_procurement) parameters.procurement[c].add(r.mode_of_procurement)
      if (r.region) parameters.regions[c].add(r.region)
      if (r.province) parameters.provinces[c].add(r.province)
      // We don't have municipality mapped in rows yet, we will map it in page.tsx
      if ((r as any).municipality) parameters.municipalities[c].add((r as any).municipality)

      if (r.supplier_id) parameters.coops[c].add(r.supplier_id)

      if (r.milk_type === 'PM') {
        parameters.pm_bene[c] += (r.beneficiaries || 0)
        parameters.pm_packs[c] += (r.milk_packs || 0)
      } else if (r.milk_type === 'SM' || r.milk_type === 'SMP') {
        parameters.sm_bene[c] += (r.beneficiaries || 0)
        parameters.sm_packs[c] += (r.milk_packs || 0)
      } else if (r.milk_type === 'Karabao') {
        parameters.karabun_bene[c] += (r.beneficiaries || 0)
        parameters.karabun_packs[c] += (r.milk_packs || 0)
      }

      parameters.raw_milk[c] += (r.raw_milk_liters || 0)
      parameters.milk_packs[c] += (r.milk_packs || 0)
      parameters.gross_income[c] += (r.milk_cost || 0)
      // admin_cost missing from MfpRecord, let's assume 0 or derived if needed
      // total_funds is in MfpRecord as total_funds_transferred
      parameters.total_funds[c] += ((r as any).total_funds_transferred || 0)

      if (r.region) {
        if (!regions[r.region]) regions[r.region] = {}
        regions[r.region][c] = (regions[r.region][c] || 0) + (r.beneficiaries || 0)
      }

      if (r.province) {
        if (!provinces[r.province]) provinces[r.province] = {}
        provinces[r.province][c] = (provinces[r.province][c] || 0) + (r.beneficiaries || 0)
      }

      if (r.supplier_name) {
        if (!coops[r.supplier_name]) coops[r.supplier_name] = {}
        coops[r.supplier_name][c] = true
      }
    })

    const ThSchoolYear = () => (
      <>
        {cycles.map(c => (
          <th key={c} className="year-col">{cycleToSchoolYear(c)}</th>
        ))}
      </>
    )

    const ThCycle = () => (
      <>
        {cycles.map(c => (
          <th key={c} className="year-col">{formatCycleLabel(c)}</th>
        ))}
      </>
    )

    const renderOverviewTable = () => (
      <div className="report-table-container print-section">
        <div className="print-header">
          <h2>SUMMARY: Department of Social Welfare and Development - Supplementary Feeding Program (DSWD - SFP)</h2>
          <div className="print-meta">Component: {label} | Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
        </div>
        <div style={{ backgroundColor: 'var(--dswd-component-green)', padding: '0.5rem', textAlign: 'center', fontWeight: 'bold', border: '1px solid black', borderBottom: 'none' }}>
          {label}
        </div>
        <table className="report-table">
          <thead>
            <tr className="header-row">
              <th className="label-col" style={{ backgroundColor: '#9dc3e6' }}>Parameters</th>
              <ThSchoolYear />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cycle</td>
              {cycles.map(c => <td key={c} className="center-text">{formatCycleLabel(c)}</td>)}
            </tr>
            <tr>
              <td>Average No. of Feeding Days</td>
              {cycles.map(c => <td key={c} className="center-text">{Math.round(getAvg(parameters.feeding_days[c])) || '-'}</td>)}
            </tr>
            <tr>
              <td>DSWD Approved Budget, PhP</td>
              {cycles.map(c => <td key={c} className="center-text">-</td>)}
            </tr>
            <tr>
              <td>DSWD No. of Beneficiaries</td>
              {cycles.map(c => <td key={c} className="center-text">-</td>)}
            </tr>
            <tr>
              <td>Mode of Procurement</td>
              {cycles.map(c => <td key={c} className="center-text">{Array.from(parameters.procurement[c]).join('/') || '-'}</td>)}
            </tr>
            <tr>
              <td className="blue-text">No. of Region</td>
              {cycles.map(c => <td key={c} className="blue-text center-text">{valOrDash(parameters.regions[c].size)}</td>)}
            </tr>
            <tr>
              <td className="blue-text">No. of Provinces</td>
              {cycles.map(c => <td key={c} className="blue-text center-text">{valOrDash(parameters.provinces[c].size)}</td>)}
            </tr>
            <tr>
              <td className="blue-text">No. of Municipalities / Cities</td>
              {cycles.map(c => <td key={c} className="blue-text center-text">{valOrDash(parameters.municipalities[c].size)}</td>)}
            </tr>
            <tr>
              <td className="blue-text">No. of Cooperatives engaged in MFP</td>
              {cycles.map(c => <td key={c} className="blue-text center-text">{valOrDash(parameters.coops[c].size)}</td>)}
            </tr>
            <tr className="orange-row">
              <td className="bold-text">PCC Commitment (Beneficiaries)</td>
              {cycles.map(c => <td key={c} className="bold-text right-text">{valOrDash(parameters.beneficiaries[c])}</td>)}
            </tr>
            <tr className="light-yellow-row">
              <td>Pasteurized Milk</td>
              {cycles.map(c => <td key={c} className="right-text">{valOrDash(parameters.pm_bene[c])}</td>)}
            </tr>
            <tr className="light-yellow-row">
              <td>Sterilized Milk</td>
              {cycles.map(c => <td key={c} className="right-text">{valOrDash(parameters.sm_bene[c])}</td>)}
            </tr>
            <tr className="light-yellow-row">
              <td>Karabun</td>
              {cycles.map(c => <td key={c} className="right-text">{valOrDash(parameters.karabun_bene[c])}</td>)}
            </tr>
            <tr className="light-yellow-row">
              <td className="bold-text" style={{ backgroundColor: '#ffd966' }}>% Commitment</td>
              {cycles.map(c => <td key={c} className="bold-text right-text" style={{ backgroundColor: '#ffd966' }}>-</td>)}
            </tr>
            <tr className="orange-row">
              <td className="bold-text">Raw Milk Used in Liters</td>
              {cycles.map(c => <td key={c} className="bold-text right-text">{valOrDash(parameters.raw_milk[c])}</td>)}
            </tr>
            <tr className="orange-row">
              <td className="bold-text">No. of Milk Packs</td>
              {cycles.map(c => <td key={c} className="bold-text right-text">{valOrDash(parameters.milk_packs[c])}</td>)}
            </tr>
            <tr className="light-yellow-row">
              <td>Pasteurized Milk</td>
              {cycles.map(c => <td key={c} className="right-text">{valOrDash(parameters.pm_packs[c])}</td>)}
            </tr>
            <tr className="light-yellow-row">
              <td>Sterilized Milk</td>
              {cycles.map(c => <td key={c} className="right-text">{valOrDash(parameters.sm_packs[c])}</td>)}
            </tr>
            <tr className="light-yellow-row">
              <td>Karabun</td>
              {cycles.map(c => <td key={c} className="right-text">{valOrDash(parameters.karabun_packs[c])}</td>)}
            </tr>
            <tr className="orange-row">
              <td className="bold-text">Gross Income of Dairy Cooperatives, PhP</td>
              {cycles.map(c => <td key={c} className="bold-text right-text">{curOrDash(parameters.gross_income[c])}</td>)}
            </tr>
            <tr className="orange-row">
              <td className="bold-text">Administrative Cost, PhP</td>
              {cycles.map(c => <td key={c} className="bold-text right-text">{curOrDash(parameters.admin_cost[c])}</td>)}
            </tr>
            <tr className="orange-row">
              <td className="bold-text">Total Funds Transferred to PCC</td>
              {cycles.map(c => <td key={c} className="bold-text right-text">{curOrDash(parameters.total_funds[c])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    )

    const renderRegionTable = () => {
      const regKeys = Object.keys(regions).sort()
      return (
        <div className="report-table-container print-section">
          <div className="print-header">
            <h2>SUMMARY: Department of Social Welfare and Development - Supplementary Feeding Program (DSWD - SFP)</h2>
            <div className="print-meta">By Region - {label} | Center: {centerFilter || 'All Centers'}</div>
          </div>
          <table className="report-table">
            <thead>
              <tr className="header-row">
                <th className="label-col" style={{ backgroundColor: '#9dc3e6' }}>REGION</th>
                <ThCycle />
              </tr>
            </thead>
            <tbody>
              <tr className="light-yellow-row">
                <td className="bold-text">No. of Region</td>
                {cycles.map(c => <td key={c} className="bold-text center-text">{valOrDash(parameters.regions[c].size)}</td>)}
              </tr>
              {regKeys.map(r => (
                <tr key={r}>
                  <td>{r}</td>
                  {cycles.map(c => <td key={c} className="right-text">{valOrDash(regions[r][c])}</td>)}
                </tr>
              ))}
              <tr className="total-row">
                <td className="bold-text" style={{ backgroundColor: '#9dc3e6' }}>TOTAL</td>
                {cycles.map(c => <td key={c} className="bold-text right-text" style={{ backgroundColor: '#9dc3e6' }}>{valOrDash(parameters.beneficiaries[c])}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )
    }

    const renderProvinceTable = () => {
      const provKeys = Object.keys(provinces).sort()
      return (
        <div className="report-table-container print-section">
          <div className="print-header">
            <h2>SUMMARY: Department of Social Welfare and Development - Supplementary Feeding Program (DSWD - SFP)</h2>
            <div className="print-meta">By Province - {label} | Center: {centerFilter || 'All Centers'}</div>
          </div>
          <table className="report-table">
            <thead>
              <tr className="header-row">
                <th className="label-col" style={{ backgroundColor: '#9dc3e6' }}>PROVINCE</th>
                <ThCycle />
              </tr>
            </thead>
            <tbody>
              <tr className="light-yellow-row">
                <td className="bold-text">No. of Province</td>
                {cycles.map(c => <td key={c} className="bold-text center-text">{valOrDash(parameters.provinces[c].size)}</td>)}
              </tr>
              {provKeys.map(p => (
                <tr key={p}>
                  <td>{p}</td>
                  {cycles.map(c => <td key={c} className="right-text">{valOrDash(provinces[p][c])}</td>)}
                </tr>
              ))}
              <tr className="total-row">
                <td className="bold-text" style={{ backgroundColor: '#9dc3e6' }}>TOTAL</td>
                {cycles.map(c => <td key={c} className="bold-text right-text" style={{ backgroundColor: '#9dc3e6' }}>{valOrDash(parameters.beneficiaries[c])}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )
    }

    const renderCoopsTable = () => {
      const coopKeys = Object.keys(coops).sort()
      return (
        <div className="report-table-container print-section">
          <div className="print-header">
            <h2>SUMMARY: Department of Social Welfare and Development - Supplementary Feeding Program (DSWD - SFP)</h2>
            <div className="print-meta">Assisted Cooperatives/Suppliers - {label} | Center: {centerFilter || 'All Centers'}</div>
          </div>
          <table className="report-table">
            <thead>
              <tr className="header-row">
                <th className="label-col" style={{ backgroundColor: '#9dc3e6' }}>Assisted Cooperatives/ Suppliers</th>
                <ThCycle />
              </tr>
            </thead>
            <tbody>
              <tr className="light-yellow-row">
                <td className="bold-text">No. of Cooperatives engaged in MFP</td>
                {cycles.map(c => <td key={c} className="bold-text center-text">{valOrDash(parameters.coops[c].size)}</td>)}
              </tr>
              {coopKeys.map(cName => (
                <tr key={cName}>
                  <td>{cName}</td>
                  {cycles.map(c => (
                    <td key={c} className="center-text" style={{ fontSize: '18px', color: '#666' }}>
                      {coops[cName][c] ? '☑' : ''}
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
      <div key={comp} style={{ marginBottom: '2rem' }}>
        {(activeTab === 'overview' || activeTab === 'all') && renderOverviewTable()}
        {(activeTab === 'region' || activeTab === 'all') && renderRegionTable()}
        {(activeTab === 'province' || activeTab === 'all') && renderProvinceTable()}
        {(activeTab === 'coop' || activeTab === 'all') && renderCoopsTable()}
      </div>
    )
  }

  return (
    <div className="report-wrapper dswd-wrapper">
      <SpreadsheetStyle />
      <style dangerouslySetInnerHTML={{__html:`
        :root {
          --dswd-component-green: #00e600;
        }
        .dswd-component-selector {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .dswd-component-selector button {
          padding: 0.5rem 1rem;
          border-radius: 4px;
          border: 1px solid var(--gray-300);
          background: white;
          cursor: pointer;
        }
        .dswd-component-selector button.active {
          background: var(--dswd-component-green);
          color: white;
          font-weight: bold;
          border-color: var(--dswd-component-green);
        }
      `}} />

      <div className="dswd-component-selector no-print">
        <button 
          className={activeComponent === 'milk' ? 'active' : ''} 
          onClick={() => setActiveComponent('milk')}
        >
          Milk Component
        </button>
        <button 
          className={activeComponent === 'hot_meals' ? 'active' : ''} 
          onClick={() => setActiveComponent('hot_meals')}
        >
          Hot Meals
        </button>
        <button 
          className={activeComponent === 'all' ? 'active' : ''} 
          onClick={() => setActiveComponent('all')}
        >
          All Components
        </button>
      </div>

      <SpreadsheetTabs 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        handlePrint={handlePrint} 
        hasSdo={false}
      />

      <div className="report-content">
        {(activeComponent === 'milk' || activeComponent === 'all') && renderReportForComponent('milk', activeComponent === 'all')}
        {(activeComponent === 'hot_meals' || activeComponent === 'all') && renderReportForComponent('hot_meals', activeComponent === 'all')}
      </div>
    </div>
  )
}
