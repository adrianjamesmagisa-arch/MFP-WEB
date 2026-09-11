'use client'

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CalendarPlus, Plus, Trash2 } from 'lucide-react'
import type { MonitoringProgramId } from '@/lib/monitoring-programs'
import type { ProgramProcurementRow } from '@/lib/program-dropoff-sync'
import type { Cooperative } from '@/lib/types'
import {
  ProcEditableCell,
  ProcMonthlyPriceCell,
  ProcSnapshotCell,
  ProcSnapshotDateHeader,
} from '@/components/procurement-grid-utils'
import type { SbfpRawMilkRow } from '@/lib/sbfp-raw-milk'
import {
  formatDeliveredAsOf,
  incomeForMonth,
  monthKeyFromDateValue,
  packsForMonth,
  parseSnapshotDate,
  rawMilkUtilizedLiters,
  readMonthlyMap,
  sumRowIncome,
  totalPacksDelivered,
  SBFP_RAW_MILK_MONTHS,
} from '@/lib/sbfp-raw-milk'
import { useAsyncTask } from '@/components/loading/AsyncFeedback'
import {
  fixedPackPriceForMilkType,
  normalizeSbfpMilkType,
  packsFromAmount,
  resolvePackUnitPrice,
  SBFP_MILK_TYPE_VALUES,
} from '@/lib/sbfp-pack-price'
import { nextIncrementedName } from '@/lib/next-incremented-name'

function rawMilkRow(r: ProgramProcurementRow): SbfpRawMilkRow {
  return r as unknown as SbfpRawMilkRow
}

const PROC_TABLE = 'mfp_program_procurement'

const STATUSES = [
  'For Preparation',
  'Ongoing Procurement',
  'Ongoing (For Award)',
  'Awarded (For Delivery)',
  'Awarded (Ongoing Delivery)',
  'Completed',
  'Failed',
] as const

const MODES = [
  'Sagip Saka',
  'Small Value Procurement',
  'Negotiated Procurement',
  'Direct Contracting',
  'Emergency',
]

const MILK_TYPES = [...SBFP_MILK_TYPE_VALUES]

const CASCADE_FIELDS = new Set([
  'procurement_status',
  'contract_amount',
  'packs_to_deliver',
  'packs_delivered',
  'delivery_start',
  'delivery_end',
  'milk_type',
  'amount',
  'mode_of_procurement',
  'delivery_snapshots',
  'monthly_packs_delivered',
  'supplier_id',
])

async function apiCascade(parent: ProgramProcurementRow): Promise<string | null> {
  const res = await fetch('/api/monitoring/sync-dropoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cascade-procurement', procurementId: parent.id, parent }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return json.error || 'Cascade failed'
  return null
}

function fmtNum(v: unknown) {
  return v != null && v !== 0 && v !== '' ? Number(v).toLocaleString() : 'N/A'
}

function fmtPeso(v: unknown) {
  return v != null && v !== 0 && v !== '' ? `₱${Number(v).toLocaleString()}` : 'N/A'
}

function fmtDate(v: unknown) {
  return v
    ? new Date(v as string).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'N/A'
}

export function ProgramProcurementTable({
  programId,
  center,
  year,
  month = 8,
  areaColumnLabel,
  initialRows,
  editable,
  onRowsChange,
}: {
  programId: MonitoringProgramId
  center: string
  year: number
  month?: number
  areaColumnLabel: string
  initialRows: ProgramProcurementRow[]
  editable: boolean
  onRowsChange?: (rows: ProgramProcurementRow[]) => void
}) {
  const supabase = createClient()
  const runTask = useAsyncTask('Saving…')
  const [rows, setRows] = useState(initialRows)
  const [extraSnapDates, setExtraSnapDates] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([])
  const addSnapRef = useRef<HTMLInputElement>(null)
  const reservedLabelsRef = useRef<Set<string>>(new Set())
  const dbYear = year

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])
  useEffect(() => {
    onRowsChange?.(rows)
  }, [rows])
  useEffect(() => {
    supabase
      .from('cooperatives')
      .select('id, name, short_name, region, is_active, created_at')
      .order('name')
      .then(({ data }) => {
        setCooperatives(((data || []) as Cooperative[]).filter(c => c.is_active !== false))
      })
  }, [])

  const cascadeIfNeeded = (row: ProgramProcurementRow, field: string) => {
    if (CASCADE_FIELDS.has(field) || field === 'label' || field === 'region') {
      // Fire-and-forget — do not block cell editing
      void apiCascade(row).then(err => {
        if (err) console.warn(err)
      })
    }
  }

  const handleSave = async (id: string, field: string, oldV: unknown, newV: unknown) => {
    let nextRow: ProgramProcurementRow | null = null
    setRows(p =>
      p.map(r => {
        if (r.id !== id) return r
        nextRow = { ...r, [field]: newV } as ProgramProcurementRow
        return nextRow
      }),
    )

    if (field === 'label' && nextRow) {
      const row = nextRow as ProgramProcurementRow
      nextRow = { ...row, province: String(newV || '') }
      setRows(p => p.map(r => (r.id === id ? { ...r, province: String(newV || '') } : r)))
      void supabase.from(PROC_TABLE).update({ province: String(newV || '') }).eq('id', id)
    }

    if (
      nextRow &&
      (field === 'delivery_snapshots' || field === 'monthly_packs_delivered')
    ) {
      const total = totalPacksDelivered(rawMilkRow(nextRow))
      if (total !== (Number(nextRow.packs_delivered) || 0)) {
        nextRow = { ...nextRow, packs_delivered: total }
        setRows(p => p.map(r => (r.id === id ? { ...r, packs_delivered: total } : r)))
        void supabase.from(PROC_TABLE).update({ packs_delivered: total }).eq('id', id)
      }
    }

    if (
      nextRow &&
      (field === 'amount' || field === 'milk_type' || field === 'pack_unit_price')
    ) {
      const milk = normalizeSbfpMilkType(nextRow.milk_type) || String(nextRow.milk_type || '').toUpperCase()
      let packPrice: number | null | undefined = nextRow.pack_unit_price
      const patch: Record<string, unknown> = {}
      if (milk === 'PM' || milk === 'SM') {
        packPrice = fixedPackPriceForMilkType(milk)
        if (nextRow.pack_unit_price != null) {
          patch.pack_unit_price = null
          nextRow = { ...nextRow, pack_unit_price: null }
        }
      }
      const derived = packsFromAmount(nextRow.amount, milk, packPrice)
      const nextPacks = derived != null ? derived : milk === 'CM' ? 0 : null
      if (nextPacks != null && nextPacks !== (Number(nextRow.packs_to_deliver) || 0)) {
        patch.packs_to_deliver = nextPacks
        nextRow = { ...nextRow, packs_to_deliver: nextPacks }
      }
      if (Object.keys(patch).length) {
        setRows(p => p.map(r => (r.id === id ? { ...r, ...patch } : r)))
        void supabase.from(PROC_TABLE).update(patch).eq('id', id)
      }
    }

    if (nextRow) cascadeIfNeeded(nextRow, field)
  }

  const snapDates = Array.from(
    new Set([
      ...rows.flatMap(r =>
        ((r.delivery_snapshots as { date?: string }[]) || []).map(s => s.date).filter(Boolean),
      ),
      ...extraSnapDates,
    ]),
  ).sort((a, b) => {
    const da = parseSnapshotDate(a)?.getTime() ?? 0
    const db = parseSnapshotDate(b)?.getTime() ?? 0
    return da - db
  })

  const visibleRawMonths = SBFP_RAW_MILK_MONTHS.filter(m =>
    snapDates.some(d => monthKeyFromDateValue(d) === m.key),
  )

  const addSnapDate = (iso: string) => {
    const parsed = parseSnapshotDate(iso)
    if (!parsed) return
    const label = formatDeliveredAsOf(parsed)
    const exists =
      extraSnapDates.includes(label) ||
      rows.some(r =>
        ((r.delivery_snapshots as { date?: string }[]) || []).some(s => s.date === label),
      )
    if (exists) {
      alert(`A “Delivered as of ${label}” column already exists.`)
      return
    }
    setExtraSnapDates(p => [...p, label])
  }

  const deleteSnapDate = async (date: string) => {
    if (!editable || !date) return
    const hasValues = rows.some(r =>
      ((r.delivery_snapshots as { date?: string; packs?: number }[]) || []).some(
        s => s.date === date && Number(s.packs) > 0,
      ),
    )
    const ok = confirm(
      hasValues
        ? `Delete the “Delivered as of ${date}” column and clear its packs for all rows?`
        : `Delete the “Delivered as of ${date}” column?`,
    )
    if (!ok) return
    setExtraSnapDates(p => p.filter(d => d !== date))
    await runTask(
      async () => {
        await Promise.all(
          rows.map(async r => {
            const oldSnaps = [...((r.delivery_snapshots as { date?: string }[]) || [])]
            if (!oldSnaps.some(s => s.date === date)) return
            const newSnaps = oldSnaps.filter(s => s.date !== date)
            const nextRow = { ...r, delivery_snapshots: newSnaps }
            const total = totalPacksDelivered(rawMilkRow(nextRow))
            const { error } = await supabase
              .from(PROC_TABLE)
              .update({ delivery_snapshots: newSnaps, packs_delivered: total })
              .eq('id', r.id)
            if (!error) {
              setRows(p =>
                p.map(row =>
                  row.id === r.id
                    ? { ...row, delivery_snapshots: newSnaps, packs_delivered: total }
                    : row,
                ),
              )
              await apiCascade(nextRow as ProgramProcurementRow)
            }
          }),
        )
      },
      'Updating delivery columns…',
      { blocking: true },
    )
  }

  const addRow = async () => {
    if (adding) return
    setAdding(true)
    const defaultLabel = nextIncrementedName(`New ${areaColumnLabel}`, [
      ...rows.flatMap(r => [r.label, r.province]),
      ...reservedLabelsRef.current,
    ])
    reservedLabelsRef.current.add(defaultLabel.toLowerCase())
    const { data, error } = await supabase
      .from(PROC_TABLE)
      .insert({
        year,
        month,
        center,
        program: programId,
        label: defaultLabel,
        province: defaultLabel,
        region: '',
        procurement_status: 'For Preparation',
        mode_of_procurement: 'Sagip Saka',
        milk_type: 'PM',
        delivery_snapshots: [],
        monthly_packs_delivered: {},
        raw_milk_prices: {},
      })
      .select('*')
      .single()
    reservedLabelsRef.current.delete(defaultLabel.toLowerCase())
    setAdding(false)
    if (error) {
      alert(error.message)
      return
    }
    setRows(p => [...p, data as ProgramProcurementRow])
  }

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this procurement row? Linked drop-offs stay but lose their parent link.')) return
    const { error } = await supabase.from(PROC_TABLE).delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setRows(p => p.filter(r => r.id !== id))
  }

  const colSpan =
    19 + snapDates.length + visibleRawMonths.length * 3 + 3 + (editable ? 1 : 0)

  // Sticky: first 4 columns (In Report? + Status + Province/Area + Region).
  const stickyTh = (left: number, width: number, edge = false, z = 20): CSSProperties => ({
    position: 'sticky', left, top: 0, zIndex: z,
    width, minWidth: width, maxWidth: width,
    background: 'var(--navy)', color: '#fff',
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.18)' : undefined,
  })
  const stickyTd = (left: number, width: number, bg: string, edge = false, z = 5): CSSProperties => ({
    position: 'sticky', left, zIndex: z,
    width, minWidth: width, maxWidth: width,
    background: bg,
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.12)' : undefined,
  })
  const SL = { report: 0, status: 60, area: 210, region: 350 } as const
  const SW = { report: 60, status: 150, area: 140, region: 80 } as const

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {editable && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium border bg-background hover:bg-muted"
            onClick={() => {
              const el = addSnapRef.current
              if (el && typeof el.showPicker === 'function') el.showPicker()
              else el?.click()
            }}
          >
            <CalendarPlus size={14} />
            Add delivered-as-of date
          </button>
          <input
            ref={addSnapRef}
            type="date"
            onChange={e => {
              if (e.target.value) {
                addSnapDate(e.target.value)
                e.target.value = ''
              }
            }}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            tabIndex={-1}
            aria-hidden
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={addRow}
            disabled={adding}
            style={{ fontSize: '0.8rem' }}
          >
            <Plus size={14} /> {adding ? 'Adding…' : `Add ${areaColumnLabel.toLowerCase()}`}
          </button>
        </div>
      )}
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        <table
          className="data-table sbfp-center-table"
          style={{ minWidth: 3200, fontSize: '0.78rem', borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center', ...stickyTh(SL.report, SW.report, false, 24) }}>In Report?</th>
              <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, ...stickyTh(SL.status, SW.status, false, 23) }}>A — Status</th>
              <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, ...stickyTh(SL.area, SW.area, false, 22) }}>B — {areaColumnLabel}</th>
              <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, ...stickyTh(SL.region, SW.region, true, 21) }}>C — Region</th>
              <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right', minWidth: 110 }}>D — Amount (₱)</th>
              <th
                rowSpan={2}
                style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}
                title="PM → packs = Amount÷25 · SM → Amount÷30 · CM → Amount÷Pack ₱"
              >
                — Milk type
              </th>
              <th
                rowSpan={2}
                style={{ whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right', minWidth: 90 }}
                title="₱ per pack"
              >
                — Pack ₱
              </th>
              <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 145 }}>E — Mode of Procurement</th>
              <th rowSpan={2} title="Applies to every municipality under this row in the masterlist">
                — Coop
              </th>
              <th rowSpan={2}>F — Date Recd (Proc)</th>
              <th rowSpan={2}>G — PR Number</th>
              <th rowSpan={2}>H — ORS Date</th>
              <th rowSpan={2}>I — PO Number</th>
              <th rowSpan={2}>J — Batch</th>
              <th rowSpan={2} style={{ textAlign: 'right' }}>K — Beneficiaries</th>
              <th rowSpan={2} style={{ textAlign: 'right' }}>L — Contract Amt (₱)</th>
              <th rowSpan={2}>M — Delivery Start</th>
              <th rowSpan={2}>N — Delivery End</th>
              <th rowSpan={2} style={{ textAlign: 'right' }}>O — Packs to Deliver</th>
              {snapDates.filter(Boolean).map((d, i) => (
                <ProcSnapshotDateHeader
                  key={d}
                  letter={String.fromCharCode(80 + i)}
                  date={d as string}
                  editable={editable}
                  onRename={() => {}}
                  onDelete={deleteSnapDate}
                />
              ))}
              {visibleRawMonths.map(m => (
                <th
                  key={`grp-${m.key}`}
                  colSpan={3}
                  style={{
                    textAlign: 'center',
                    background: '#1e3a5f',
                    color: '#fff',
                    borderLeft: '2px solid rgba(255,255,255,0.25)',
                  }}
                >
                  {m.label} {dbYear}
                </th>
              ))}
              <th
                rowSpan={2}
                style={{ textAlign: 'right', background: '#92400e', color: '#fff' }}
              >
                Total Income
              </th>
              <th rowSpan={2}>— Payment Status</th>
              <th rowSpan={2}>— Remarks</th>
              {editable && <th rowSpan={2}>Actions</th>}
            </tr>
            <tr>
              {visibleRawMonths.map(m => (
                <Fragment key={`sub-${m.key}`}>
                  <th
                    style={{ textAlign: 'right', background: '#1e40af', color: '#fff' }}
                    title="Raw Milk used (L) = (packs ÷ 5) × 0.20"
                  >
                    Raw milk used (L)
                  </th>
                  <th style={{ textAlign: 'right', background: '#166534', color: '#fff' }}>
                    Raw ₱/L
                  </th>
                  <th style={{ textAlign: 'right', background: '#9a3412', color: '#fff' }}>
                    Income
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={colSpan} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                  No procurement rows yet. Add a {areaColumnLabel.toLowerCase()} to group municipalities below.
                </td>
              </tr>
            )}
            {rows.map(r => {
              const rowBg = r.include_in_report === false ? '#fef2f2' : '#fff'
              const snaps = (r.delivery_snapshots as { date?: string; packs?: number | null }[]) || []
              return (
                <tr key={r.id} style={{ background: rowBg }}>
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="include_in_report"
                      value={r.include_in_report !== false}
                      type="checkbox"
                      onSave={handleSave}
                      cellStyle={stickyTd(SL.report, SW.report, rowBg, false, 8)}
                    />
                  ) : (
                    <td style={{ textAlign: 'center', ...stickyTd(SL.report, SW.report, rowBg, false, 8) }}>{r.include_in_report !== false ? '✓' : '✗'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="procurement_status"
                      value={r.procurement_status}
                      type="select"
                      options={[...STATUSES]}
                      onSave={handleSave}
                      cellStyle={stickyTd(SL.status, SW.status, rowBg, false, 7)}
                    />
                  ) : (
                    <td style={stickyTd(SL.status, SW.status, rowBg, false, 7)}>{r.procurement_status || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="label"
                      value={r.label || r.province}
                      onSave={handleSave}
                      cellStyle={stickyTd(SL.area, SW.area, rowBg, false, 6)}
                    />
                  ) : (
                    <td style={stickyTd(SL.area, SW.area, rowBg, false, 6)}>{r.label || r.province || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="region"
                      value={r.region}
                      onSave={handleSave}
                      cellStyle={stickyTd(SL.region, SW.region, rowBg, true, 5)}
                    />
                  ) : (
                    <td style={stickyTd(SL.region, SW.region, rowBg, true, 5)}>{r.region || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="amount"
                      value={r.amount}
                      type="number"
                      align="right"
                      format={fmtPeso}
                      onSave={handleSave}
                    />
                  ) : (
                    <td style={{ textAlign: 'right' }}>{fmtPeso(r.amount)}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="milk_type"
                      value={normalizeSbfpMilkType(r.milk_type) || r.milk_type || 'PM'}
                      type="select"
                      options={MILK_TYPES}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{normalizeSbfpMilkType(r.milk_type) || r.milk_type || 'N/A'}</td>
                  )}
                  {(() => {
                    const milk = normalizeSbfpMilkType(r.milk_type) || r.milk_type
                    const shown = resolvePackUnitPrice(r)
                    if (milk === 'CM' && editable) {
                      return (
                        <ProcEditableCell
                          table={PROC_TABLE}
                          id={r.id}
                          field="pack_unit_price"
                          value={r.pack_unit_price}
                          type="number"
                          align="right"
                          format={v => (v != null && v !== '' ? `₱${Number(v).toLocaleString()}` : '—')}
                          onSave={handleSave}
                        />
                      )
                    }
                    return (
                      <td style={{ textAlign: 'right' }}>
                        {shown ? `₱${shown.toLocaleString()}` : '—'}
                      </td>
                    )
                  })()}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="mode_of_procurement"
                      value={r.mode_of_procurement}
                      type="select"
                      options={MODES}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{r.mode_of_procurement || 'N/A'}</td>
                  )}
                  <td style={{ padding: 2 }}>
                    {editable ? (
                      <select
                        value={r.supplier_id || ''}
                        onChange={async e => {
                          const next = e.target.value || null
                          const { error } = await supabase.from(PROC_TABLE).update({ supplier_id: next }).eq('id', r.id)
                          if (error) {
                            alert(
                              error.message.includes('supplier_id')
                                ? 'Run supabase/migrations/20260909140000_mfp_program_months.sql in Supabase, then refresh.'
                                : error.message,
                            )
                            return
                          }
                          await handleSave(r.id, 'supplier_id', r.supplier_id || null, next)
                        }}
                        style={{ width: '100%', minWidth: 140, fontSize: 'inherit', background: 'transparent', border: 0 }}
                      >
                        <option value="">—</option>
                        {cooperatives.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      cooperatives.find(c => c.id === r.supplier_id)?.name || 'N/A'
                    )}
                  </td>
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="pr_date_received"
                      value={r.pr_date_received}
                      type="date"
                      format={fmtDate}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{fmtDate(r.pr_date_received)}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="pr_number"
                      value={r.pr_number}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{r.pr_number || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="ors_date"
                      value={r.ors_date}
                      type="date"
                      format={fmtDate}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{fmtDate(r.ors_date)}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="po_number"
                      value={r.po_number}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{r.po_number || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="batch"
                      value={r.batch}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{r.batch || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="beneficiaries"
                      value={r.beneficiaries}
                      type="number"
                      align="right"
                      format={fmtNum}
                      onSave={handleSave}
                    />
                  ) : (
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.beneficiaries)}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="contract_amount"
                      value={r.contract_amount}
                      type="number"
                      align="right"
                      format={fmtPeso}
                      onSave={handleSave}
                    />
                  ) : (
                    <td style={{ textAlign: 'right' }}>{fmtPeso(r.contract_amount)}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="delivery_start"
                      value={r.delivery_start}
                      type="date"
                      format={fmtDate}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{fmtDate(r.delivery_start)}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="delivery_end"
                      value={r.delivery_end}
                      type="date"
                      format={fmtDate}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{fmtDate(r.delivery_end)}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="packs_to_deliver"
                      value={r.packs_to_deliver}
                      type="number"
                      align="right"
                      format={fmtNum}
                      onSave={handleSave}
                    />
                  ) : (
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.packs_to_deliver)}</td>
                  )}
                  {snapDates.filter((d): d is string => Boolean(d)).map(d => (
                    <ProcSnapshotCell
                      key={`${r.id}-${d}`}
                      table={PROC_TABLE}
                      id={r.id}
                      date={d}
                      snaps={snaps}
                      editable={editable}
                      onSave={handleSave}
                    />
                  ))}
                  {visibleRawMonths.map(m => {
                    const monthNum = parseInt(m.key, 10)
                    const priceMap = readMonthlyMap(r.raw_milk_prices)
                    const packs = packsForMonth(rawMilkRow(r), monthNum, { year: dbYear })
                    const price = Number(priceMap[m.key]) || 0
                    const income = incomeForMonth(rawMilkRow(r), monthNum, { year: dbYear })
                    const liters = rawMilkUtilizedLiters(packs)
                    return (
                      <Fragment key={`${r.id}-m-${m.key}`}>
                        <td style={{ textAlign: 'right', fontWeight: liters ? 600 : undefined, color: liters ? '#1e40af' : undefined }}>
                          {liters ? liters.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                        </td>
                        {editable ? (
                          <ProcMonthlyPriceCell
                            table={PROC_TABLE}
                            id={r.id}
                            monthKey={m.key}
                            map={priceMap}
                            onSave={handleSave}
                          />
                        ) : (
                          <td style={{ textAlign: 'right' }}>
                            {price ? `₱${price.toLocaleString()}` : '—'}
                          </td>
                        )}
                        <td style={{ textAlign: 'right', color: income ? '#92400e' : undefined }}>
                          {income ? `₱${income.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                        </td>
                      </Fragment>
                    )
                  })}
                  {(() => {
                    const totalIncome = sumRowIncome(rawMilkRow(r), { year: dbYear })
                    return (
                      <td style={{ textAlign: 'right', fontWeight: 700, color: totalIncome ? '#92400e' : undefined }}>
                        {totalIncome ? `₱${totalIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                      </td>
                    )
                  })()}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="status_of_payment"
                      value={r.status_of_payment}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{r.status_of_payment || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="remarks"
                      value={r.remarks}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{r.remarks || 'N/A'}</td>
                  )}
                  {editable && (
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => deleteRow(r.id)}
                        className="btn btn-outline"
                        style={{ padding: 4, color: '#ef4444', borderColor: '#ef4444' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              )}
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
