'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CalendarPlus, Plus, Trash2 } from 'lucide-react'
import type { MonitoringProgramId } from '@/lib/monitoring-programs'
import type { ProgramProcurementRow } from '@/lib/program-dropoff-sync'
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
import {
  fixedPackPriceForMilkType,
  normalizeSbfpMilkType,
  packsFromAmount,
  resolvePackUnitPrice,
  SBFP_MILK_TYPE_VALUES,
} from '@/lib/sbfp-pack-price'

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
  areaColumnLabel,
  initialRows,
  editable,
}: {
  programId: MonitoringProgramId
  center: string
  year: number
  areaColumnLabel: string
  initialRows: ProgramProcurementRow[]
  editable: boolean
}) {
  const supabase = createClient()
  const [rows, setRows] = useState(initialRows)
  const [extraSnapDates, setExtraSnapDates] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const addSnapRef = useRef<HTMLInputElement>(null)
  const dbYear = year

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  const cascadeIfNeeded = async (row: ProgramProcurementRow, field: string) => {
    if (CASCADE_FIELDS.has(field) || field === 'label' || field === 'region') {
      const err = await apiCascade(row)
      if (err) console.warn(err)
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
      await supabase.from(PROC_TABLE).update({ province: String(newV || '') }).eq('id', id)
      nextRow = { ...row, province: String(newV || '') }
      setRows(p => p.map(r => (r.id === id ? { ...r, province: String(newV || '') } : r)))
    }

    if (
      nextRow &&
      (field === 'delivery_snapshots' || field === 'monthly_packs_delivered')
    ) {
      const total = totalPacksDelivered(rawMilkRow(nextRow))
      if (total !== (Number(nextRow.packs_delivered) || 0)) {
        await supabase.from(PROC_TABLE).update({ packs_delivered: total }).eq('id', id)
        nextRow = { ...nextRow, packs_delivered: total }
        setRows(p => p.map(r => (r.id === id ? { ...r, packs_delivered: total } : r)))
      }
    }

    if (
      nextRow &&
      (field === 'amount' || field === 'milk_type' || field === 'pack_unit_price')
    ) {
      const milk = normalizeSbfpMilkType(nextRow.milk_type) || String(nextRow.milk_type || '').toUpperCase()
      let packPrice: number | null | undefined = nextRow.pack_unit_price
      if (milk === 'PM' || milk === 'SM') {
        packPrice = fixedPackPriceForMilkType(milk)
        if (nextRow.pack_unit_price != null) {
          await supabase.from(PROC_TABLE).update({ pack_unit_price: null }).eq('id', id)
          nextRow = { ...nextRow, pack_unit_price: null }
          setRows(p => p.map(r => (r.id === id ? { ...r, pack_unit_price: null } : r)))
        }
      }
      const derived = packsFromAmount(nextRow.amount, milk, packPrice)
      const nextPacks = derived != null ? derived : milk === 'CM' ? 0 : null
      if (nextPacks != null && nextPacks !== (Number(nextRow.packs_to_deliver) || 0)) {
        const { error: packErr } = await supabase
          .from(PROC_TABLE)
          .update({ packs_to_deliver: nextPacks })
          .eq('id', id)
        if (!packErr) {
          nextRow = { ...nextRow, packs_to_deliver: nextPacks }
          setRows(p => p.map(r => (r.id === id ? { ...r, packs_to_deliver: nextPacks } : r)))
        }
      }
    }

    if (nextRow) await cascadeIfNeeded(nextRow, field)
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
  }

  const addRow = async () => {
    setAdding(true)
    const { data, error } = await supabase
      .from(PROC_TABLE)
      .insert({
        year,
        center,
        program: programId,
        label: 'New Province',
        province: 'New Province',
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
    18 + snapDates.length + visibleRawMonths.length * 3 + 3 + (editable ? 1 : 0)

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
              <th rowSpan={2} style={{ textAlign: 'center' }}>In Report?</th>
              <th rowSpan={2}>A — Status</th>
              <th rowSpan={2}>B — {areaColumnLabel}</th>
              <th rowSpan={2}>C — Region</th>
              <th rowSpan={2} style={{ textAlign: 'right' }}>D — Amount (₱)</th>
              <th rowSpan={2} title="PM → packs = Amount÷25 · SM → Amount÷30 · CM → Amount÷Pack ₱">
                — Milk type
              </th>
              <th rowSpan={2} style={{ textAlign: 'right' }} title="₱ per pack">
                — Pack ₱
              </th>
              <th rowSpan={2}>E — Mode of Procurement</th>
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
                    />
                  ) : (
                    <td style={{ textAlign: 'center' }}>{r.include_in_report !== false ? '✓' : '✗'}</td>
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
                    />
                  ) : (
                    <td>{r.procurement_status || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="label"
                      value={r.label || r.province}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{r.label || r.province || 'N/A'}</td>
                  )}
                  {editable ? (
                    <ProcEditableCell
                      table={PROC_TABLE}
                      id={r.id}
                      field="region"
                      value={r.region}
                      onSave={handleSave}
                    />
                  ) : (
                    <td>{r.region || 'N/A'}</td>
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
