'use client'

import { Fragment, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  officialSbfpStatusLabel,
  SBFP_PROCUREMENT_STATUSES,
  type SbfpProcurementStatus,
  type SbfpReportSourceRow,
  type SbfpReportViewRow,
  type SbfpSenateMetrics,
} from '@/lib/sbfp-report-sync'
import { milkTypeLabel } from '@/lib/sbfp-pack-price'
import { packsForMonth, rawMilkUtilizedLiters } from '@/lib/sbfp-raw-milk'
import {
  formatMajorValue,
  MAJOR_INDICATORS,
  type MajorAccomplishmentMetrics,
  type MajorIndicatorKey,
  type MajorTargetsBySchoolYear,
} from '@/lib/sbfp-major-accomplishments'
import { getIslandCluster, type ProgramReportMeta } from '@/lib/program-spreadsheet-report'

const PESO = '\u20B1'
const fmtPeso = (n: number) =>
  `${PESO}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
const fmtL = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const fmtPct = (n: number) => `${n.toFixed(1)}%`

const th: CSSProperties = {
  border: '1px solid #cbd5e1',
  padding: '8px 8px',
  textAlign: 'right',
  whiteSpace: 'normal',
  lineHeight: 1.2,
}
const thC: CSSProperties = { ...th, textAlign: 'center' }
const tdR: CSSProperties = { border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right' }
const tdC: CSSProperties = { border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }

export const IMPLEMENTATION_STATUS_COLORS: Record<SbfpProcurementStatus, string> = {
  'For Preparation': '#92400e',
  'Ongoing Procurement': '#1e40af',
  'Ongoing (For Award)': '#1e3a8a',
  'Awarded (For Delivery)': '#5b21b6',
  'Awarded (Ongoing Delivery)': '#3730a3',
  Completed: '#065f46',
  Failed: '#991b1b',
}

export const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  'For Preparation': { bg: '#fef3c7', color: '#92400e' },
  Ongoing: { bg: '#dbeafe', color: '#1e40af' },
  'Ongoing Procurement': { bg: '#dbeafe', color: '#1e40af' },
  'Ongoing (For Award)': { bg: '#bfdbfe', color: '#1e3a8a' },
  'Awarded (For Delivery)': { bg: '#ede9fe', color: '#5b21b6' },
  'Awarded (Ongoing Delivery)': { bg: '#e0e7ff', color: '#3730a3' },
  Completed: { bg: '#d1fae5', color: '#065f46' },
  Failed: { bg: '#fee2e2', color: '#991b1b' },
}

export type ProgramReportTab =
  | 'master'
  | 'senate_perf'
  | 'senate_status'
  | 'senate_region'
  | 'senate_center'
  | 'senate_delivery'
  | 'milk_procurement'
  | 'monthly_cummulated'
  | 'major_accomplishments'

export interface ProgramReportStats {
  count: number
  rowCount: number
  totalPacks: number
  totalDelivered: number
  totalContractAmt: number
  totalPaid: number
  totalRemainingPay: number
  totalContractedL: number
  totalDeliveredL: number
  totalUndeliveredL: number
  totalValueDelivered: number
  totalRemainingContract: number
  totalAmount: number
  totalBeneficiaries: number
  totalCoops: number
  pctDelivered: number
}

export interface ProgramGroupRow extends SbfpSenateMetrics {
  sdoCount: number
  beneficiaries: number
  coopCount: number
}

export interface ProgramDeliveryDetailRow {
  id: string
  sdoKey: string
  sdo: string
  region: string
  center: string
  contractValue: number
  contractedVolumeLiters: number
  volumeDelivered: number
  amountPaid: number
  deliveryRate: number
  status: string
  procurementStatus: SbfpProcurementStatus
  number: number
  sdoSpan: number
}

export interface ProgramImplSummary {
  buckets: Record<
    SbfpProcurementStatus,
    SbfpSenateMetrics & { sdoCount: number; sdoKeys: Set<string> }
  >
  reasons: Array<{
    id: string
    sdo: string
    region: string
    center: string
    status: SbfpProcurementStatus
    undeliveredL: number
    remainingContract: number
    remarks: string
  }>
}

export function ProgramSpreadsheetSecondaryTabs({
  activeTab,
  meta,
  year,
  filteredRecords,
  getViewForSource,
  sdoIndexMeta,
  stats,
  regionalSummary,
  centerSummary,
  deliveryDetailsRows,
  implSummary,
  milkAsOfMonth,
  setMilkAsOfMonth,
  milkAsOfYear,
  setMilkAsOfYear,
  mcFromMonth,
  setMcFromMonth,
  mcToMonth,
  setMcToMonth,
  majorAsOf,
  setMajorAsOf,
  todayIso,
  majorLoading,
  liveYears,
  liveMajor,
  majorTargets,
  editingCell,
  setEditingCell,
  editingValue,
  setEditingValue,
  savingCell,
  saveMajorTarget,
}: {
  activeTab: ProgramReportTab
  meta: ProgramReportMeta
  year: string
  filteredRecords: SbfpReportSourceRow[]
  getViewForSource: (id: string | undefined) => SbfpReportViewRow | undefined
  sdoIndexMeta: Array<{ number: number; rowSpan: number }>
  stats: ProgramReportStats
  regionalSummary: Array<ProgramGroupRow & { region: string }>
  centerSummary: Array<ProgramGroupRow & { center: string }>
  deliveryDetailsRows: ProgramDeliveryDetailRow[]
  implSummary: ProgramImplSummary
  milkAsOfMonth: string
  setMilkAsOfMonth: (v: string) => void
  milkAsOfYear: string
  setMilkAsOfYear: (v: string) => void
  mcFromMonth: number
  setMcFromMonth: (v: number) => void
  mcToMonth: number
  setMcToMonth: (v: number) => void
  majorAsOf: string
  setMajorAsOf: (v: string) => void
  todayIso: () => string
  majorLoading: boolean
  liveYears: number[]
  liveMajor: Record<string, MajorAccomplishmentMetrics>
  majorTargets: MajorTargetsBySchoolYear
  editingCell: { sy: string; key: MajorIndicatorKey } | null
  setEditingCell: (v: { sy: string; key: MajorIndicatorKey } | null) => void
  editingValue: string
  setEditingValue: (v: string) => void
  savingCell: string | null
  saveMajorTarget: (sy: string, key: MajorIndicatorKey, raw: string | null) => Promise<void>
}) {
  const majorAsOfLabel = (() => {
    const d = new Date(majorAsOf + 'T12:00:00')
    return Number.isNaN(d.getTime())
      ? majorAsOf
      : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  return (
    <>
      {(activeTab === 'senate_perf' ||
        activeTab === 'senate_status' ||
        activeTab === 'senate_region' ||
        activeTab === 'senate_center' ||
        activeTab === 'senate_delivery') && (
        <div
          className="print-only"
          style={{ display: 'none', padding: '0 0 0.75rem', textAlign: 'center' }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, textTransform: 'uppercase' }}>
            {meta.senatePrintTitle}
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
            PCC milk component only. Volume: PM/CM 5 packs = 1 L; SM 5.5555555556 packs = 1 L. Paid
            amounts come from supplier payment entries.
          </p>
        </div>
      )}

      {activeTab === 'senate_perf' && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            maxWidth: 920,
          }}
        >
          <div
            style={{
              padding: '0.875rem 1.25rem',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
              1. Procurement and Delivery Performance
            </h3>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
              PCC milk component only — contracted vs actual. PM/CM = packs ÷ 5; SM = packs ÷
              5.5555555556. Paid = sum of payment entries.
            </div>
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
              fontFamily: 'Arial, sans-serif',
            }}
          >
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
                [
                  'Disbursement rate (paid ÷ contract)',
                  fmtPct(
                    stats.totalContractAmt > 0
                      ? (stats.totalPaid / stats.totalContractAmt) * 100
                      : 0,
                  ),
                ],
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
              style={{
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                2. Status of Implementation
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                Same Status values as the {meta.shortLabel} procurement dropdown.
              </div>
            </div>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              <thead>
                <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Status</th>
                  <th style={th}>{meta.entityPlural}</th>
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
                      <td style={{ ...tdR, textAlign: 'left', fontWeight: 800, color }}>
                        {status}
                      </td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{b.sdoCount}</td>
                      <td style={tdR}>{fmtPeso(b.contractAmt)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: '#15803d' }}>
                        {fmtPeso(b.paidAmt)}
                      </td>
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
              style={{
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                {meta.entitySingular} list
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                Status is the same value encoded on each {meta.entitySingular.toLowerCase()} row.
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.8rem',
                  fontFamily: 'Arial, sans-serif',
                }}
              >
                <thead>
                  <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                    <th style={{ ...th, textAlign: 'left' }}>{meta.entitySingular}</th>
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
                      return [
                        <tr key={`${status}-empty`}>
                          <td colSpan={3} style={{ ...tdR, textAlign: 'left', color: '#94a3b8' }}>
                            —
                          </td>
                          <td style={{ ...tdR, textAlign: 'left', fontWeight: 800, color }}>
                            {status}
                          </td>
                          <td colSpan={3} style={{ ...tdR, textAlign: 'left', color: '#94a3b8' }}>
                            No {meta.entityPlural} with this status
                          </td>
                        </tr>,
                      ]
                    }
                    return rows.map((row, i) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ ...tdR, textAlign: 'left', fontWeight: 700 }}>{row.sdo}</td>
                        <td style={tdC}>{row.region}</td>
                        <td style={{ ...tdR, textAlign: 'left' }}>{row.center}</td>
                        <td style={{ ...tdR, textAlign: 'left', fontWeight: 700, color }}>
                          {row.status}
                        </td>
                        <td style={tdR}>{fmtL(row.undeliveredL)} L</td>
                        <td style={tdR}>{fmtPeso(row.remainingContract)}</td>
                        <td
                          style={{
                            ...tdR,
                            textAlign: 'left',
                            color: row.remarks ? '#334155' : '#94a3b8',
                          }}
                        >
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
            style={{
              padding: '0.875rem 1.25rem',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
              3. Regional Distribution
            </h3>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
              Contracted vs actual per region. Volume: PM/CM packs ÷ 5; SM packs ÷ 5.5555555556.
              Delivery % uses packs; disbursement % uses payments ÷ contract.
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              <thead>
                <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                  <th style={thC}>Region</th>
                  <th style={th}>{meta.entityPlural}</th>
                  <th style={th}>Beneficiaries</th>
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
                    <td style={tdR}>{reg.beneficiaries.toLocaleString()}</td>
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
                  <td style={tdR}>{stats.totalBeneficiaries.toLocaleString()}</td>
                  <td style={tdR}>{fmtPeso(stats.totalContractAmt)}</td>
                  <td style={tdR}>{fmtL(stats.totalContractedL)} L</td>
                  <td style={tdR}>{fmtPeso(stats.totalPaid)}</td>
                  <td style={tdR}>{fmtL(stats.totalDeliveredL)} L</td>
                  <td style={tdR}>{fmtPeso(stats.totalValueDelivered)}</td>
                  <td style={tdR}>{fmtPct(stats.pctDelivered)}</td>
                  <td style={tdR}>
                    {fmtPct(
                      stats.totalContractAmt > 0
                        ? (stats.totalPaid / stats.totalContractAmt) * 100
                        : 0,
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'senate_center' && (
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
            style={{
              padding: '0.875rem 1.25rem',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
              4. Center Distribution
            </h3>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
              Same columns as Regional Distribution, grouped by PCC center.
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              <thead>
                <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Center</th>
                  <th style={th}>{meta.entityPlural}</th>
                  <th style={th}>Beneficiaries</th>
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
                    <td style={tdR}>{c.beneficiaries.toLocaleString()}</td>
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
                  <td style={tdR}>{stats.totalBeneficiaries.toLocaleString()}</td>
                  <td style={tdR}>{fmtPeso(stats.totalContractAmt)}</td>
                  <td style={tdR}>{fmtL(stats.totalContractedL)} L</td>
                  <td style={tdR}>{fmtPeso(stats.totalPaid)}</td>
                  <td style={tdR}>{fmtL(stats.totalDeliveredL)} L</td>
                  <td style={tdR}>{fmtPeso(stats.totalValueDelivered)}</td>
                  <td style={tdR}>{fmtPct(stats.pctDelivered)}</td>
                  <td style={tdR}>
                    {fmtPct(
                      stats.totalContractAmt > 0
                        ? (stats.totalPaid / stats.totalContractAmt) * 100
                        : 0,
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'senate_delivery' && (
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
            style={{
              padding: '0.875rem 1.25rem',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
              5. Contract & Delivery Details
            </h3>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
              Contract value, volume, delivery progress, and payment status per{' '}
              {meta.entitySingular.toLowerCase()}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 1200,
                borderCollapse: 'collapse',
                fontSize: '0.75rem',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              <thead>
                <tr style={{ background: '#1e293b', color: '#fff' }}>
                  <th style={{ ...thC, color: '#fff', borderColor: '#334155' }}>No.</th>
                  <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>
                    {meta.entitySingular}
                  </th>
                  <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>
                    Region
                  </th>
                  <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>
                    Center
                  </th>
                  <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Contract Value</th>
                  <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>
                    Contracted Volume (L)
                  </th>
                  <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>
                    Volume Delivered (L)
                  </th>
                  <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>Amount Paid</th>
                  <th style={{ ...th, color: '#fff', borderColor: '#334155' }}>
                    Delivery Rate %
                  </th>
                  <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>
                    Status
                  </th>
                  <th style={{ ...th, textAlign: 'left', color: '#fff', borderColor: '#334155' }}>
                    Procurement Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {deliveryDetailsRows.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    {row.sdoSpan > 0 ? (
                      <td
                        style={{ ...tdC, fontWeight: 800, verticalAlign: 'middle' }}
                        rowSpan={row.sdoSpan}
                      >
                        {row.number}
                      </td>
                    ) : null}
                    <td style={{ ...tdR, textAlign: 'left', fontWeight: 700 }}>{row.sdo}</td>
                    <td style={{ ...tdR, textAlign: 'left' }}>{row.region}</td>
                    <td style={{ ...tdR, textAlign: 'left' }}>{row.center}</td>
                    <td style={tdR}>{fmtPeso(row.contractValue)}</td>
                    <td style={tdR}>{fmtL(row.contractedVolumeLiters)}</td>
                    <td style={tdR}>{fmtL(row.volumeDelivered)}</td>
                    <td style={tdR}>{fmtPeso(row.amountPaid)}</td>
                    <td style={tdR}>{fmtPct(row.deliveryRate)}</td>
                    <td
                      style={{
                        ...tdR,
                        textAlign: 'left',
                        fontWeight: 600,
                        color: row.status === 'Completed' ? '#15803d' : '#ea580c',
                      }}
                    >
                      {row.status}
                    </td>
                    <td style={{ ...tdR, textAlign: 'left' }}>{row.procurementStatus}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                  <td style={tdC} colSpan={2}>
                    TOTAL
                  </td>
                  <td style={tdC} colSpan={2}>
                    {deliveryDetailsRows.filter(r => r.sdoSpan > 0).length} {meta.entityPlural} /{' '}
                    {deliveryDetailsRows.length} rows
                  </td>
                  <td style={tdR}>
                    {fmtPeso(deliveryDetailsRows.reduce((sum, r) => sum + r.contractValue, 0))}
                  </td>
                  <td style={tdR}>
                    {fmtL(
                      deliveryDetailsRows.reduce((sum, r) => sum + r.contractedVolumeLiters, 0),
                    )}
                  </td>
                  <td style={tdR}>
                    {fmtL(deliveryDetailsRows.reduce((sum, r) => sum + r.volumeDelivered, 0))}
                  </td>
                  <td style={tdR}>
                    {fmtPeso(deliveryDetailsRows.reduce((sum, r) => sum + r.amountPaid, 0))}
                  </td>
                  <td style={tdR}>
                    {fmtPct(
                      deliveryDetailsRows.reduce((sum, r) => sum + r.contractedVolumeLiters, 0) > 0
                        ? (deliveryDetailsRows.reduce((sum, r) => sum + r.volumeDelivered, 0) /
                            deliveryDetailsRows.reduce(
                              (sum, r) => sum + r.contractedVolumeLiters,
                              0,
                            )) *
                            100
                        : 0,
                    )}
                  </td>
                  <td style={tdC} colSpan={2}>
                    {deliveryDetailsRows.filter(r => r.status === 'Completed').length} Completed /{' '}
                    {deliveryDetailsRows.filter(r => r.status === 'Ongoing').length} Ongoing
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'milk_procurement' &&
        (() => {
          const milkRows = filteredRecords.map((r, idx) => {
            const view = getViewForSource(r.id)
            const packsToDeliver = view?.packs_to_deliver ?? Number(r.packs_to_deliver) ?? 0
            let deliveredPacks = 0
            if (milkAsOfMonth === 'ALL') {
              deliveredPacks = view?.delivered_packs ?? Number(r.packs_delivered) ?? 0
            } else {
              const dbYearNum = Number(year)
              const targetMonth = parseInt(milkAsOfMonth, 10)
              if (targetMonth >= 1 && targetMonth <= 12 && Number.isFinite(dbYearNum)) {
                const snaps = Array.isArray(r.delivery_snapshots) ? r.delivery_snapshots : []
                const useSnapshots = snaps.some(s => Number(s?.packs) > 0)
                const monthOpts = { year: dbYearNum, preferSnapshotsOverMonthly: useSnapshots }
                for (let m = 1; m <= targetMonth; m++) {
                  deliveredPacks += packsForMonth(r, m, monthOpts)
                }
              } else {
                deliveredPacks = view?.delivered_packs ?? Number(r.packs_delivered) ?? 0
              }
            }
            const balance = Math.max(0, packsToDeliver - deliveredPacks)
            const milkTypeStr = view?.milk_type ?? milkTypeLabel(r.milk_type ?? '')
            const packLabel = milkTypeStr
              ? `${packsToDeliver.toLocaleString()} (${milkTypeStr})`
              : packsToDeliver.toLocaleString()
            const fmt = (d: string | null | undefined) => {
              if (!d) return ''
              const dt = new Date(d)
              if (Number.isNaN(dt.getTime())) return d
              return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            }
            const startFmt = fmt(r.delivery_start)
            const endFmt = fmt(r.delivery_end)
            let schedule = ''
            if (startFmt && endFmt && startFmt !== endFmt) schedule = `${startFmt} to ${endFmt}`
            else if (startFmt) schedule = startFmt
            else if (endFmt) schedule = endFmt
            const status = officialSbfpStatusLabel(view?.procurement_status ?? r.procurement_status)
            const rowMeta = sdoIndexMeta[idx] || { number: idx + 1, rowSpan: 1 }
            return {
              meta: rowMeta,
              r,
              status,
              packsToDeliver,
              packLabel,
              schedule,
              deliveredPacks,
              balance,
            }
          })

          const totalPacksToDeliver = milkRows.reduce((s, x) => s + x.packsToDeliver, 0)
          const totalDelivered = milkRows.reduce((s, x) => s + x.deliveredPacks, 0)
          const totalBalance = milkRows.reduce((s, x) => s + x.balance, 0)
          const cellBorder = '1px solid #cbd5e1'
          const hdrBorder = '1px solid #334155'
          const monthOpts = [
            { val: 'ALL', label: 'All Months' },
            { val: '1', label: 'January' },
            { val: '2', label: 'February' },
            { val: '3', label: 'March' },
            { val: '4', label: 'April' },
            { val: '5', label: 'May' },
            { val: '6', label: 'June' },
            { val: '7', label: 'July' },
            { val: '8', label: 'August' },
            { val: '9', label: 'September' },
            { val: '10', label: 'October' },
            { val: '11', label: 'November' },
            { val: '12', label: 'December' },
          ]
          const yearOpts = Array.from({ length: 5 }, (_, i) => String(Number(year) - 1 + i))

          return (
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
                style={{
                  padding: '0.875rem 1.25rem',
                  borderBottom: '1px solid #e2e8f0',
                  background: '#f8fafc',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                  Table 1. Milk Procurement Status
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                  Per-{meta.entitySingular.toLowerCase()} delivery schedule, packs contracted, packs
                  delivered, and remaining balance.
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.82rem',
                    fontFamily: 'Arial, sans-serif',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#1e293b', color: '#fff' }}>
                      <th
                        style={{
                          border: hdrBorder,
                          padding: '8px 8px',
                          textAlign: 'center',
                          fontWeight: 700,
                          width: 45,
                        }}
                      >
                        #
                      </th>
                      <th
                        style={{
                          border: hdrBorder,
                          padding: '8px 10px',
                          textAlign: 'center',
                          fontWeight: 700,
                          width: 70,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Region
                      </th>
                      <th
                        style={{
                          border: hdrBorder,
                          padding: '8px 10px',
                          textAlign: 'left',
                          fontWeight: 700,
                          minWidth: 160,
                        }}
                      >
                        {meta.entitySingular}
                      </th>
                      <th
                        style={{
                          border: hdrBorder,
                          padding: '8px 10px',
                          textAlign: 'center',
                          fontWeight: 700,
                          minWidth: 160,
                        }}
                      >
                        Procurement Status
                      </th>
                      <th
                        style={{
                          border: hdrBorder,
                          padding: '8px 10px',
                          textAlign: 'right',
                          fontWeight: 700,
                          minWidth: 145,
                        }}
                      >
                        No. of Milk Packs to be Delivered
                      </th>
                      <th
                        style={{
                          border: hdrBorder,
                          padding: '8px 10px',
                          textAlign: 'center',
                          fontWeight: 700,
                          minWidth: 185,
                        }}
                      >
                        Expected Schedule of Delivery
                      </th>
                      <th
                        style={{
                          border: hdrBorder,
                          padding: '8px 10px',
                          textAlign: 'right',
                          fontWeight: 700,
                          minWidth: 165,
                        }}
                      >
                        <div style={{ marginBottom: 4 }}>No. of Milk Packs Delivered</div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 4,
                            fontWeight: 400,
                          }}
                        >
                          <span>as of</span>
                          <select
                            value={milkAsOfMonth}
                            onChange={e => setMilkAsOfMonth(e.target.value)}
                            style={{
                              background: 'transparent',
                              color: '#fff',
                              border: '1px solid #475569',
                              borderRadius: 4,
                              padding: '2px 4px',
                              fontSize: '0.75rem',
                              outline: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {monthOpts.map(o => (
                              <option key={o.val} value={o.val} style={{ color: '#000' }}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {milkAsOfMonth !== 'ALL' && (
                            <select
                              value={milkAsOfYear}
                              onChange={e => setMilkAsOfYear(e.target.value)}
                              style={{
                                background: 'transparent',
                                color: '#fff',
                                border: '1px solid #475569',
                                borderRadius: 4,
                                padding: '2px 4px',
                                fontSize: '0.75rem',
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              {yearOpts.map(y => (
                                <option key={y} value={y} style={{ color: '#000' }}>
                                  {y}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </th>
                      <th
                        style={{
                          border: hdrBorder,
                          padding: '8px 10px',
                          textAlign: 'right',
                          fontWeight: 700,
                          minWidth: 110,
                        }}
                      >
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {milkRows.map(
                      (
                        {
                          meta: rowMeta,
                          r,
                          status,
                          packLabel,
                          schedule,
                          deliveredPacks,
                          balance,
                        },
                        i,
                      ) => {
                        const statusBadge =
                          STATUS_BADGE[status] ?? STATUS_BADGE['For Preparation']
                        const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc'
                        const isFirst = rowMeta.rowSpan > 0
                        return (
                          <tr key={String(r.id ?? i)} style={{ background: rowBg }}>
                            {isFirst && (
                              <td
                                rowSpan={rowMeta.rowSpan}
                                style={{
                                  border: cellBorder,
                                  padding: '6px 8px',
                                  textAlign: 'center',
                                  fontWeight: 800,
                                  verticalAlign: 'middle',
                                  background: '#f8fafc',
                                  color: '#1e293b',
                                }}
                              >
                                {rowMeta.number}
                              </td>
                            )}
                            <td
                              style={{
                                border: cellBorder,
                                padding: '6px 8px',
                                textAlign: 'center',
                                fontWeight: 700,
                                color: '#1e293b',
                              }}
                            >
                              {r.region || '—'}
                            </td>
                            <td
                              style={{
                                border: cellBorder,
                                padding: '6px 10px',
                                textAlign: 'left',
                                fontWeight: 600,
                                color: '#1e293b',
                              }}
                            >
                              {r.sdo || '—'}
                            </td>
                            <td style={{ border: cellBorder, padding: '6px 8px', textAlign: 'center' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  background: statusBadge.bg,
                                  color: statusBadge.color,
                                }}
                              >
                                {status}
                              </span>
                            </td>
                            <td
                              style={{
                                border: cellBorder,
                                padding: '6px 10px',
                                textAlign: 'right',
                                color: '#1e40af',
                                fontWeight: 600,
                              }}
                            >
                              {packLabel}
                            </td>
                            <td
                              style={{
                                border: cellBorder,
                                padding: '6px 10px',
                                textAlign: 'center',
                                color: '#475569',
                              }}
                            >
                              {schedule || '—'}
                            </td>
                            <td
                              style={{
                                border: cellBorder,
                                padding: '6px 10px',
                                textAlign: 'right',
                                color: '#047857',
                                fontWeight: 600,
                              }}
                            >
                              {deliveredPacks > 0 ? deliveredPacks.toLocaleString() : ''}
                            </td>
                            <td
                              style={{
                                border: cellBorder,
                                padding: '6px 10px',
                                textAlign: 'right',
                                fontWeight: 700,
                                color: balance > 0 ? '#b45309' : '#15803d',
                              }}
                            >
                              {balance > 0 ? balance.toLocaleString() : '0'}
                            </td>
                          </tr>
                        )
                      },
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 800 }}>
                      <td
                        colSpan={4}
                        style={{ border: '1px solid #93c5fd', padding: '7px 10px', textAlign: 'center' }}
                      >
                        TOTAL
                      </td>
                      <td
                        style={{ border: '1px solid #93c5fd', padding: '7px 10px', textAlign: 'right' }}
                      >
                        {totalPacksToDeliver.toLocaleString()}
                      </td>
                      <td style={{ border: '1px solid #93c5fd', padding: '7px 10px' }} />
                      <td
                        style={{ border: '1px solid #93c5fd', padding: '7px 10px', textAlign: 'right' }}
                      >
                        {totalDelivered.toLocaleString()}
                      </td>
                      <td
                        style={{ border: '1px solid #93c5fd', padding: '7px 10px', textAlign: 'right' }}
                      >
                        {totalBalance.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })()}

      {activeTab === 'monthly_cummulated' &&
        (() => {
          const ALL_MONTHS = [
            { val: 1, label: 'January' },
            { val: 2, label: 'February' },
            { val: 3, label: 'March' },
            { val: 4, label: 'April' },
            { val: 5, label: 'May' },
            { val: 6, label: 'June' },
            { val: 7, label: 'July' },
            { val: 8, label: 'August' },
            { val: 9, label: 'September' },
            { val: 10, label: 'October' },
            { val: 11, label: 'November' },
            { val: 12, label: 'December' },
          ]
          const toMonthLabel =
            ALL_MONTHS.find(m => m.val === mcToMonth)?.label.toUpperCase() || 'DECEMBER'

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
            Unknown: {
              regions: new Set(),
              beneficiaries: 0,
              coops: new Set(),
              rawMilkLiters: 0,
              packs: 0,
              contractAmount: 0,
            },
          }

          const start = Math.min(mcFromMonth, mcToMonth)
          const end = Math.max(mcFromMonth, mcToMonth)

          filteredRecords.forEach(r => {
            let deliveredPacksInRange = 0
            for (let m = start; m <= end; m++) {
              deliveredPacksInRange += packsForMonth(r, m, { year: Number(year) })
            }
            if (deliveredPacksInRange <= 0) return
            const cluster = getIslandCluster(r.region || '')
            const group = clusterMap[cluster]
            if (!group) return
            if (r.region && r.region !== '—') group.regions.add(r.region)
            group.beneficiaries +=
              (Number(r.beneficiaries_pm) || 0) +
              (Number(r.beneficiaries_sm) || 0) +
              (Number(r.beneficiaries_cm) || 0)
            if (r.supplier_id) group.coops.add(String(r.supplier_id))
            group.packs += deliveredPacksInRange
            group.rawMilkLiters += rawMilkUtilizedLiters(deliveredPacksInRange)
            group.contractAmount += Number(r.contract_amount) || Number(r.amount) || 0
          })

          const clusterRows = (['Luzon', 'Visayas', 'Mindanao'] as const).map(c => {
            const g = clusterMap[c]
            return {
              cluster: c,
              region: Array.from(g.regions).join(', '),
              beneficiaries: g.beneficiaries,
              coops: g.coops.size,
              rawMilkLiters: g.rawMilkLiters,
              packs: g.packs,
              contractAmount: g.contractAmount,
            }
          })

          const totalBeneficiaries = clusterRows.reduce((s, r) => s + r.beneficiaries, 0)
          const totalCoops = clusterRows.reduce((s, r) => s + r.coops, 0)
          const totalRawMilk = clusterRows.reduce((s, r) => s + r.rawMilkLiters, 0)
          const totalPacks = clusterRows.reduce((s, r) => s + r.packs, 0)
          const totalContractAmount = clusterRows.reduce((s, r) => s + r.contractAmount, 0)

          return (
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
                style={{
                  padding: '1rem',
                  background: '#f8fafc',
                  borderBottom: '1px solid #cbd5e1',
                  display: 'flex',
                  gap: '1.5rem',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <label
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      marginRight: '0.5rem',
                      color: '#475569',
                    }}
                  >
                    From Month:
                  </label>
                  <select
                    value={mcFromMonth}
                    onChange={e => setMcFromMonth(Number(e.target.value))}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#fff',
                      fontSize: '0.9rem',
                      color: '#1e293b',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {ALL_MONTHS.map(m => (
                      <option key={m.val} value={m.val}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <label
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      marginRight: '0.5rem',
                      color: '#475569',
                    }}
                  >
                    To Month:
                  </label>
                  <select
                    value={mcToMonth}
                    onChange={e => setMcToMonth(Number(e.target.value))}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#fff',
                      fontSize: '0.9rem',
                      color: '#1e293b',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {ALL_MONTHS.map(m => (
                      <option key={m.val} value={m.val}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                style={{
                  background: '#1e3a8a',
                  padding: '1rem',
                  textAlign: 'center',
                  color: '#fff',
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                >
                  MILK FEEDING PROGRAM AS OF {toMonthLabel} {year}
                </h2>
              </div>
              <div
                style={{
                  background: '#3b82f6',
                  padding: '0.5rem',
                  textAlign: 'center',
                  color: '#fff',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {meta.cdpBannerTitle}
                </h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.85rem',
                    fontFamily: 'Arial, sans-serif',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#e0f2fe', color: '#0369a1' }}>
                      <th style={{ ...thC, borderColor: '#bae6fd' }}>CLUSTER</th>
                      <th style={{ ...thC, borderColor: '#bae6fd' }}>REGION</th>
                      <th style={{ ...thC, borderColor: '#bae6fd' }}>BENEFICIARIES</th>
                      <th style={{ ...thC, borderColor: '#bae6fd' }}>NO. OF COOPS</th>
                      <th style={{ ...thC, borderColor: '#bae6fd' }}>RAW MILK USED IN LITERS</th>
                      <th style={{ ...thC, borderColor: '#bae6fd' }}>MILK PACKS</th>
                      <th style={{ ...thC, borderColor: '#bae6fd' }}>CONTRACT AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusterRows.map(r => (
                      <tr key={r.cluster} style={{ background: '#334155', color: '#fff' }}>
                        <td
                          style={{
                            border: '1px solid #475569',
                            padding: '8px 10px',
                            textAlign: 'left',
                            fontWeight: 700,
                            background: '#1e3a8a',
                          }}
                        >
                          {r.cluster}
                        </td>
                        <td
                          style={{
                            border: '1px solid #475569',
                            padding: '8px 10px',
                            textAlign: 'center',
                          }}
                        >
                          {r.region}
                        </td>
                        <td
                          style={{
                            border: '1px solid #475569',
                            padding: '8px 10px',
                            textAlign: 'center',
                          }}
                        >
                          {r.beneficiaries > 0 ? r.beneficiaries.toLocaleString() : ''}
                        </td>
                        <td
                          style={{
                            border: '1px solid #475569',
                            padding: '8px 10px',
                            textAlign: 'center',
                          }}
                        >
                          {r.coops > 0 ? r.coops : ''}
                        </td>
                        <td
                          style={{
                            border: '1px solid #475569',
                            padding: '8px 10px',
                            textAlign: 'center',
                          }}
                        >
                          {r.rawMilkLiters > 0
                            ? r.rawMilkLiters.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 1,
                              })
                            : ''}
                        </td>
                        <td
                          style={{
                            border: '1px solid #475569',
                            padding: '8px 10px',
                            textAlign: 'center',
                          }}
                        >
                          {r.packs > 0 ? r.packs.toLocaleString() : ''}
                        </td>
                        <td
                          style={{
                            border: '1px solid #475569',
                            padding: '8px 10px',
                            textAlign: 'center',
                          }}
                        >
                          {r.contractAmount > 0 ? fmtPeso(r.contractAmount) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eab308', color: '#fff', fontWeight: 800 }}>
                      <td
                        style={{
                          border: '1px solid #ca8a04',
                          padding: '8px 10px',
                          textAlign: 'right',
                        }}
                        colSpan={2}
                      >
                        TOTAL
                      </td>
                      <td
                        style={{
                          border: '1px solid #ca8a04',
                          padding: '8px 10px',
                          textAlign: 'center',
                        }}
                      >
                        {totalBeneficiaries > 0 ? totalBeneficiaries.toLocaleString() : ''}
                      </td>
                      <td
                        style={{
                          border: '1px solid #ca8a04',
                          padding: '8px 10px',
                          textAlign: 'center',
                        }}
                      >
                        {totalCoops > 0 ? totalCoops : ''}
                      </td>
                      <td
                        style={{
                          border: '1px solid #ca8a04',
                          padding: '8px 10px',
                          textAlign: 'center',
                        }}
                      >
                        {totalRawMilk > 0
                          ? totalRawMilk.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 1,
                            })
                          : ''}
                      </td>
                      <td
                        style={{
                          border: '1px solid #ca8a04',
                          padding: '8px 10px',
                          textAlign: 'center',
                        }}
                      >
                        {totalPacks > 0 ? totalPacks.toLocaleString() : ''}
                      </td>
                      <td
                        style={{
                          border: '1px solid #ca8a04',
                          padding: '8px 10px',
                          textAlign: 'center',
                        }}
                      >
                        {totalContractAmount > 0 ? fmtPeso(totalContractAmount) : ''}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })()}

      {activeTab === 'major_accomplishments' &&
        (() => {
          const NAVY = '#002654'
          const GOLD = '#facc15'
          const hdr: CSSProperties = {
            background: NAVY,
            color: GOLD,
            border: '1.5px solid #0f172a',
            padding: '10px 8px',
            textAlign: 'center',
            fontWeight: 800,
            fontFamily: "'Oswald', 'Arial Narrow', Arial, sans-serif",
            letterSpacing: '0.01em',
            fontSize: '0.95rem',
          }
          const cell: CSSProperties = {
            border: '1.5px solid #0f172a',
            padding: '14px 10px',
            textAlign: 'center',
            fontWeight: 700,
            color: '#0f172a',
            fontSize: '0.95rem',
            background: '#fff',
          }

          const renderTarget = (targetKey: string, key: MajorIndicatorKey) => {
            const cellId = `${targetKey}|${key}`
            const isEditing = editingCell?.sy === targetKey && editingCell.key === key
            const val = majorTargets[targetKey]?.[key]
            const overridden = val != null
            if (isEditing) {
              return (
                <td style={{ ...cell, padding: 4, background: '#fefce8' }}>
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={e => setEditingValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setEditingCell(null)
                        void saveMajorTarget(targetKey, key, editingValue)
                      }
                      if (e.key === 'Escape') setEditingCell(null)
                    }}
                    onBlur={() => {
                      setEditingCell(null)
                      void saveMajorTarget(targetKey, key, editingValue)
                    }}
                    style={{
                      width: '100%',
                      minWidth: 110,
                      padding: '6px',
                      border: `2px solid ${NAVY}`,
                      borderRadius: 4,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                    }}
                  />
                </td>
              )
            }
            return (
              <td
                style={{ ...cell, cursor: 'pointer', position: 'relative' }}
                title="Click to edit target"
                onClick={() => {
                  setEditingCell({ sy: targetKey, key })
                  setEditingValue(val != null ? String(val) : '')
                }}
                className="major-target-cell"
              >
                {savingCell === cellId ? (
                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Saving…</span>
                ) : (
                  formatMajorValue(key, val) || (
                    <span className="no-print" style={{ color: '#cbd5e1' }}>
                      —
                    </span>
                  )
                )}
                {overridden && savingCell !== cellId && (
                  <button
                    className="no-print"
                    title="Reset target"
                    onClick={e => {
                      e.stopPropagation()
                      void saveMajorTarget(targetKey, key, null)
                    }}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      border: 'none',
                      background: 'transparent',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 0,
                    }}
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </td>
            )
          }

          return (
            <div
              className="major-acc"
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(0,38,84,0.08)',
              }}
            >
              <div
                className="no-print"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                  Accomplishment As Of:
                </label>
                <input
                  type="date"
                  value={majorAsOf}
                  onChange={e => e.target.value && setMajorAsOf(e.target.value)}
                  style={{
                    height: 32,
                    padding: '0 0.5rem',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setMajorAsOf(todayIso())}
                  style={{
                    height: 32,
                    padding: '0 0.75rem',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RotateCcw size={13} /> Latest / Today
                </button>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b' }}>
                  {majorLoading
                    ? `Loading live ${meta.shortLabel} data…`
                    : 'Click any Target cell to edit · saved for all users'}
                </span>
              </div>

              <div style={{ padding: '1.5rem 1.5rem 0.75rem', textAlign: 'center' }}>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "'Oswald', 'Arial Narrow', Impact, sans-serif",
                    fontWeight: 900,
                    fontSize: '2.6rem',
                    letterSpacing: '0.02em',
                    color: '#1e3a6e',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                  }}
                >
                  Major Accomplishments
                </h2>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "'Oswald', 'Arial Narrow', Impact, sans-serif",
                    fontWeight: 800,
                    fontSize: '1.35rem',
                    color: '#1e3a6e',
                    textTransform: 'uppercase',
                  }}
                >
                  {meta.majorSubtitle}{' '}
                  <span style={{ color: '#eab308' }}>
                    {liveYears.length > 1
                      ? `${liveYears[0]}–${liveYears[liveYears.length - 1]}`
                      : liveYears[0]}
                  </span>
                </div>
                <div style={{ marginTop: 4, fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                  Live accomplishment as of {majorAsOfLabel}
                </div>
              </div>

              <div style={{ overflowX: 'auto', padding: '0.5rem 1.5rem 1.5rem' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontFamily: 'Arial, sans-serif',
                  }}
                >
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ ...hdr, minWidth: 200 }}>
                        Performance Indicator
                      </th>
                      {liveYears.map(y => (
                        <th key={y} colSpan={2} style={hdr}>
                          CY {y}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {liveYears.flatMap(y => [
                        <th key={`${y}-t`} style={hdr}>
                          Target
                        </th>,
                        <th key={`${y}-a`} style={hdr}>
                          Accomplishment
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {MAJOR_INDICATORS.map(ind => {
                      const label =
                        ind.key === 'sdo_count' ? meta.majorEntityCountLabel : ind.label
                      return (
                        <tr key={ind.key}>
                          <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>{label}</td>
                          {liveYears.flatMap(y => {
                            const targetKey = `${meta.id}:${y}`
                            return [
                              <Fragment key={`${y}-t`}>
                                {renderTarget(targetKey, ind.key)}
                              </Fragment>,
                              <td key={`${y}-a`} style={{ ...cell, background: '#f0f9ff' }}>
                                {majorLoading
                                  ? '…'
                                  : formatMajorValue(ind.key, liveMajor[String(y)]?.[ind.key] ?? 0)}
                              </td>,
                            ]
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#64748b' }}>
                  CY {liveYears.join(', ')} accomplishments are computed live from{' '}
                  {meta.shortLabel} deliveries (non-failed, In-Report rows) cumulative through{' '}
                  {majorAsOfLabel}.
                </div>
              </div>
            </div>
          )
        })()}
    </>
  )
}

