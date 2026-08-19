'use client'

import React, { useState } from 'react'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface MfpRow {
  year: number
  beneficiaries: number
  milk_packs: number
  milk_cost: number
  total_funds_transferred: number
  service_fee: number
  raw_milk_liters: number
  feeding_days: number
  mode_of_procurement: string
  region: string
  province: string
  division: string
  supplier_id: string
  supplier_name: string
  milk_type: string
}

export function SummaryDepEdClient({ 
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
  const [activeTab, setActiveTab] = useState<'overview' | 'region' | 'province' | 'sdo' | 'coop' | 'all'>('overview')

  // Derive matrices
  // 1. Parameters
  const parameters = {
    feeding_days: {} as Record<number, number[]>,
    budget: {} as Record<number, number>,
    beneficiaries: {} as Record<number, number>,
    procurement: {} as Record<number, Set<string>>,
    regions: {} as Record<number, Set<string>>,
    provinces: {} as Record<number, Set<string>>,
    sdos: {} as Record<number, Set<string>>,
    coops: {} as Record<number, Set<string>>,
    pm_bene: {} as Record<number, number>,
    sm_bene: {} as Record<number, number>,
    raw_milk: {} as Record<number, number>,
    milk_packs: {} as Record<number, number>,
    pm_packs: {} as Record<number, number>,
    sm_packs: {} as Record<number, number>,
    gross_income: {} as Record<number, number>,
    service_fee_pct: {} as Record<number, number[]>,
    service_fee_amt: {} as Record<number, number>,
    total_funds: {} as Record<number, number>,
  }

  // 2. Region Matrix
  const regions: Record<string, Record<number, number>> = {}
  
  // 3. Province Matrix
  const provinces: Record<string, Record<number, number>> = {}

  // 4. SDO Matrix
  const sdos: Record<string, Record<number, number>> = {}

  // 5. Coops Matrix
  const coops: Record<string, Record<number, boolean>> = {}

  years.forEach(y => {
    parameters.feeding_days[y] = []
    parameters.budget[y] = 0
    parameters.beneficiaries[y] = 0
    parameters.procurement[y] = new Set()
    parameters.regions[y] = new Set()
    parameters.provinces[y] = new Set()
    parameters.sdos[y] = new Set()
    parameters.coops[y] = new Set()
    parameters.pm_bene[y] = 0
    parameters.sm_bene[y] = 0
    parameters.raw_milk[y] = 0
    parameters.milk_packs[y] = 0
    parameters.pm_packs[y] = 0
    parameters.sm_packs[y] = 0
    parameters.gross_income[y] = 0
    parameters.service_fee_pct[y] = []
    parameters.service_fee_amt[y] = 0
    parameters.total_funds[y] = 0
  })

  rows.forEach(r => {
    const y = r.year
    if (!years.includes(y)) return

    if (r.feeding_days) parameters.feeding_days[y].push(r.feeding_days)
    parameters.budget[y] += (r.total_funds_transferred || 0) // No explicit budget, using funds transferred
    parameters.beneficiaries[y] += (r.beneficiaries || 0)
    if (r.mode_of_procurement) parameters.procurement[y].add(r.mode_of_procurement)
    if (r.region) parameters.regions[y].add(r.region)
    if (r.province) parameters.provinces[y].add(r.province)
    if (r.division) parameters.sdos[y].add(r.division)
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

    // Service fee derived
    if (r.service_fee) {
      parameters.service_fee_amt[y] += r.service_fee
      if (r.total_funds_transferred) {
         parameters.service_fee_pct[y].push(r.service_fee / r.total_funds_transferred)
      }
    }
    parameters.total_funds[y] += (r.total_funds_transferred || 0)

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

    // SDO Matrix
    if (r.division) {
      if (!sdos[r.division]) sdos[r.division] = {}
      sdos[r.division][y] = (sdos[r.division][y] || 0) + (r.beneficiaries || 0)
    }

    // Coops Matrix
    if (r.supplier_name) {
      if (!coops[r.supplier_name]) coops[r.supplier_name] = {}
      coops[r.supplier_name][y] = true
    }
  })

  // Averages/Joins
  const getAvg = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0

  const handlePrint = (tab: typeof activeTab) => {
    setActiveTab(tab)
    setTimeout(() => {
      window.print()
    }, 300)
  }

  const ThYear = () => (
    <>
      {years.map(y => (
        <th key={y} className="year-col">FY {y}</th>
      ))}
    </>
  )

  const valOrDash = (v: number | string | undefined | null) => {
    if (v === undefined || v === null || v === 0 || v === '') return '-'
    if (typeof v === 'number') return formatNumber(v)
    return v
  }
  const curOrDash = (v: number | undefined | null) => {
    if (!v) return '-'
    return formatCurrency(v).replace('₱', '')
  }

  const renderOverview = () => (
    <div className="deped-table-container print-section">
      <div className="print-header">
        <h2>SUMMARY: Department of Education - School-based Feeding Program (DepEd-SBFP)</h2>
        <div className="print-meta">Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
      </div>
      <table className="deped-table">
        <thead>
          <tr className="header-row">
            <th className="label-col">Parameters</th>
            <ThYear />
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
            <td className="red-text">DepEd Approved Budget, PhP</td>
            {years.map(y => <td key={y} className="red-text right-text">{curOrDash(parameters.budget[y])}</td>)}
          </tr>
          <tr>
            <td className="red-text">DepEd No. of Beneficiaries</td>
            {years.map(y => <td key={y} className="red-text right-text">{valOrDash(parameters.beneficiaries[y])}</td>)}
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
            <td className="blue-text">No. of Schools Division Offices (SDOs)</td>
            {years.map(y => <td key={y} className="blue-text center-text">{valOrDash(parameters.sdos[y].size)}</td>)}
          </tr>
          <tr>
            <td className="blue-text">No. of Cooperatives engaged in MFP</td>
            {years.map(y => <td key={y} className="blue-text center-text">{valOrDash(parameters.coops[y].size)}</td>)}
          </tr>
          <tr className="orange-row">
            <td className="bold-text">PCC Commitment (Beneficiaries)</td>
            {years.map(y => <td key={y} className="bold-text right-text">{valOrDash(parameters.beneficiaries[y])}</td>)}
          </tr>
          <tr>
            <td>Pasteurized Milk</td>
            {years.map(y => <td key={y} className="right-text">{valOrDash(parameters.pm_bene[y])}</td>)}
          </tr>
          <tr>
            <td>Sterilized Milk</td>
            {years.map(y => <td key={y} className="right-text">{valOrDash(parameters.sm_bene[y])}</td>)}
          </tr>
          <tr className="orange-row">
            <td className="bold-text">% Commitment</td>
            {years.map(y => {
              const val = parameters.beneficiaries[y] ? (parameters.pm_bene[y] + parameters.sm_bene[y])/parameters.beneficiaries[y] : 0
              return <td key={y} className="bold-text right-text">{val ? (val * 100).toFixed(2) + '%' : '-'}</td>
            })}
          </tr>
          <tr className="yellow-row">
            <td className="bold-text">Raw Milk Used in Liters</td>
            {years.map(y => <td key={y} className="bold-text right-text">{valOrDash(parameters.raw_milk[y])}</td>)}
          </tr>
          <tr className="yellow-row">
            <td className="bold-text">No. of Milk Packs</td>
            {years.map(y => <td key={y} className="bold-text right-text">{valOrDash(parameters.milk_packs[y])}</td>)}
          </tr>
          <tr>
            <td>Pasteurized Milk</td>
            {years.map(y => <td key={y} className="right-text">{valOrDash(parameters.pm_packs[y])}</td>)}
          </tr>
          <tr>
            <td>Sterilized Milk</td>
            {years.map(y => <td key={y} className="right-text">{valOrDash(parameters.sm_packs[y])}</td>)}
          </tr>
          <tr className="yellow-row">
            <td className="bold-text">Gross Income of Dairy Cooperatives, PhP</td>
            {years.map(y => <td key={y} className="bold-text right-text">{curOrDash(parameters.gross_income[y])}</td>)}
          </tr>
          <tr>
            <td>% Service Fee</td>
            {years.map(y => {
              const avg = getAvg(parameters.service_fee_pct[y])
              return <td key={y} className="center-text">{avg ? (avg * 100).toFixed(2) + '%' : '-'}</td>
            })}
          </tr>
          <tr>
            <td>Amount of Service Fee, PhP</td>
            {years.map(y => <td key={y} className="right-text">{curOrDash(parameters.service_fee_amt[y])}</td>)}
          </tr>
          <tr className="yellow-row">
            <td className="bold-text">Total Funds Transferred to PCC</td>
            {years.map(y => <td key={y} className="bold-text right-text">{curOrDash(parameters.total_funds[y])}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  )

  const renderRegion = () => {
    const regKeys = Object.keys(regions).sort()
    return (
      <div className="deped-table-container print-section">
        <div className="print-header">
          <h2>SUMMARY: Department of Education - School-based Feeding Program (DepEd-SBFP)</h2>
          <div className="print-meta">By Region | Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
        </div>
        <table className="deped-table">
          <thead>
            <tr className="header-row">
              <th className="label-col">REGION</th>
              <ThYear />
            </tr>
          </thead>
          <tbody>
            <tr className="light-yellow-row">
              <td className="bold-text">No. of Region</td>
              {years.map(y => <td key={y} className="bold-text center-text">{valOrDash(parameters.regions[y].size)}</td>)}
            </tr>
            {regKeys.map(r => (
              <tr key={r}>
                <td className={r === 'NIR' ? 'red-text' : ''}>{r}</td>
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
      <div className="deped-table-container print-section">
        <div className="print-header">
          <h2>SUMMARY: Department of Education - School-based Feeding Program (DepEd-SBFP)</h2>
          <div className="print-meta">By Province | Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
        </div>
        <table className="deped-table">
          <thead>
            <tr className="header-row">
              <th className="label-col">PROVINCE</th>
              <ThYear />
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

  const renderSDO = () => {
    const sdoKeys = Object.keys(sdos).sort()
    return (
      <div className="deped-table-container print-section">
        <div className="print-header">
          <h2>SUMMARY: Department of Education - School-based Feeding Program (DepEd-SBFP)</h2>
          <div className="print-meta">By SDO | Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
        </div>
        <table className="deped-table">
          <thead>
            <tr className="header-row">
              <th className="label-col">SCHOOL DIVISION OFFICES (SDOs)</th>
              <ThYear />
            </tr>
          </thead>
          <tbody>
            <tr className="light-yellow-row">
              <td className="bold-text">No. of School Division Offices (SDOs)</td>
              {years.map(y => <td key={y} className="bold-text center-text">{valOrDash(parameters.sdos[y].size)}</td>)}
            </tr>
            {sdoKeys.map(s => (
              <tr key={s}>
                <td>{s}</td>
                {years.map(y => <td key={y} className="right-text">{valOrDash(sdos[s][y])}</td>)}
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
      <div className="deped-table-container print-section">
        <div className="print-header">
          <h2>SUMMARY: Department of Education - School-based Feeding Program (DepEd-SBFP)</h2>
          <div className="print-meta">Assisted Cooperatives/Suppliers | Center: {centerFilter || 'All Centers'} | Month: {monthFilter || 'All'}</div>
        </div>
        <table className="deped-table">
          <thead>
            <tr className="header-row">
              <th className="label-col">Assisted Cooperatives/ Suppliers</th>
              <ThYear />
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
    <div className="deped-wrapper">
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --deped-header-blue: #a9c4ec;
          --deped-title-blue: #9fbce8;
          --deped-total-blue: #9fbde9;
          --deped-light-yellow: #ffe599;
          --deped-strong-yellow: #f6bf26;
          --deped-body-gray: #f3f3f3;
          --deped-grid: #202020;
          --deped-red: #ff0000;
          --deped-blue-text: #0000ff;
        }

        .deped-nav {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        
        .deped-nav button {
          padding: 8px 16px;
          background: #e2e8f0;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
        }

        .deped-nav button.active {
          background: #1d4ed8;
          color: white;
          border-color: #1e3a8a;
        }

        .deped-nav button.print-btn {
          background: #10b981;
          color: white;
          border-color: #059669;
          margin-left: auto;
        }

        .deped-table-container {
          overflow-x: auto;
          margin-bottom: 40px;
          background: white;
          padding-bottom: 10px;
        }

        .deped-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 13px;
          color: black;
          font-family: Arial, sans-serif;
        }

        .deped-table th, .deped-table td {
          border: 1px solid var(--deped-grid);
          padding: 4px 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .deped-table td {
          white-space: normal;
        }

        .label-col {
          width: 350px;
          text-align: left;
          font-weight: bold;
        }

        .year-col {
          width: 140px;
          text-align: center;
          font-weight: bold;
        }

        .header-row th {
          background: var(--deped-header-blue);
        }

        .center-text { text-align: center; }
        .right-text { text-align: right; }
        .bold-text { font-weight: bold; }
        .red-text { color: var(--deped-red); }
        .blue-text { color: var(--deped-blue-text); }

        .orange-row td { background: var(--deped-strong-yellow); }
        .yellow-row td { background: var(--deped-light-yellow); }
        .light-yellow-row td { background: var(--deped-light-yellow); }
        .total-row td { background: var(--deped-total-blue); }

        .print-header {
          display: none;
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          body * {
            visibility: hidden;
          }

          .deped-wrapper, .deped-wrapper * {
            visibility: visible;
          }

          .deped-wrapper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }

          .deped-nav {
            display: none;
          }

          .print-section {
            page-break-before: always;
          }
          .print-section:first-child {
            page-break-before: auto;
          }

          .print-header {
            display: block;
            margin-bottom: 20px;
          }

          .print-header h2 {
            font-size: 16px;
            margin: 0 0 5px 0;
            color: black;
          }

          .print-meta {
            font-size: 12px;
            color: #444;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          thead {
            display: table-header-group;
          }

          tr {
            break-inside: avoid;
          }
        }
      `}} />

      <div className="deped-nav">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={activeTab === 'region' ? 'active' : ''} onClick={() => setActiveTab('region')}>By Region</button>
        <button className={activeTab === 'province' ? 'active' : ''} onClick={() => setActiveTab('province')}>By Province</button>
        <button className={activeTab === 'sdo' ? 'active' : ''} onClick={() => setActiveTab('sdo')}>By School Division Office</button>
        <button className={activeTab === 'coop' ? 'active' : ''} onClick={() => setActiveTab('coop')}>Cooperatives / Suppliers</button>
        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>All Tables</button>
        
        <button className="print-btn" onClick={() => handlePrint(activeTab)}>
          Download {activeTab === 'all' ? 'All Tables' : activeTab} PDF
        </button>
      </div>

      <div className="deped-content">
        {(activeTab === 'overview' || activeTab === 'all') && renderOverview()}
        {(activeTab === 'region' || activeTab === 'all') && renderRegion()}
        {(activeTab === 'province' || activeTab === 'all') && renderProvince()}
        {(activeTab === 'sdo' || activeTab === 'all') && renderSDO()}
        {(activeTab === 'coop' || activeTab === 'all') && renderCoops()}
      </div>
    </div>
  )
}
