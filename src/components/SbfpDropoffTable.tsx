'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import type { SbfpDropoffPoint } from '@/lib/types'
import {
  resolveDropoffFeedingDays,
  parseFeedingDaysFromText,
  normalizeSdoName,
  baseSdoName,
  pickPreferredSdoVariant,
} from '@/lib/sbfp-dropoff-sync'
import { calcMilkFormulations, litersPerPackForMilkType } from '@/lib/mfp-formulas'
import { inferSbfpMilkType, normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'

export type DropoffRow = SbfpDropoffPoint

async function apiSyncDropoff(dropoff: DropoffRow): Promise<string | null> {
  const res = await fetch('/api/sbfp/sync-dropoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync', dropoff }),
  })
  const json = await res.json().catch(() => ({} as { error?: string }))
  if (!res.ok) return json.error || 'Masterlist sync failed'
  return null
}

async function apiUnlinkDropoff(dropoffId: string): Promise<string | null> {
  const res = await fetch('/api/sbfp/sync-dropoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unlink', dropoffId }),
  })
  const json = await res.json().catch(() => ({} as { error?: string }))
  if (!res.ok) return json.error || 'Masterlist unlink failed'
  return null
}

type SdoOption = {
  id: string
  sdo: string
  region?: string | null
  feeding_days?: number | null
  remarks?: string | null
  milk_type?: string | null
}

function EditableText({
  value, align = 'left', type = 'text', disabled, onCommit, title, cellStyle,
}: {
  value: string | number | null | undefined
  align?: 'left' | 'right' | 'center'
  type?: 'text' | 'number'
  disabled?: boolean
  onCommit: (next: string | number | null) => void
  title?: string
  cellStyle?: CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState<string>(value == null ? '' : String(value))
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { setVal(value == null ? '' : String(value)) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = () => {
    setEditing(false)
    if (type === 'number') {
      const n = val === '' ? null : Number(val)
      onCommit(n != null && Number.isFinite(n) ? n : null)
    } else {
      onCommit(val)
    }
  }

  if (disabled) {
    return (
      <td style={{ textAlign: align, ...cellStyle }} title={title}>
        {value == null || value === '' ? '—' : type === 'number' ? Number(value).toLocaleString() : String(value)}
      </td>
    )
  }

  if (editing) {
    return (
      <td style={{ padding: 2, background: '#fff', ...cellStyle }}>
        <input
          ref={ref}
          type={type}
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setVal(value == null ? '' : String(value)); setEditing(false) }
          }}
          style={{
            width: '100%', border: '1px solid #3b82f6', outline: 'none',
            padding: '2px 4px', fontSize: 'inherit', textAlign: align, boxSizing: 'border-box',
          }}
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => setEditing(true)}
      title={title || 'Click to edit'}
      style={{ textAlign: align, cursor: 'pointer', ...cellStyle }}
    >
      {value == null || value === ''
        ? '—'
        : type === 'number'
          ? Number(value).toLocaleString()
          : String(value)}
    </td>
  )
}

export function SbfpDropoffTable({
  center,
  year,
  sdoOptions,
  initialRows,
  editable,
}: {
  center: string
  year: number
  sdoOptions: SdoOption[]
  initialRows: DropoffRow[]
  editable: boolean
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<DropoffRow[]>(initialRows || [])
  const [filterSdo, setFilterSdo] = useState<string>('ALL')
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => { setRows(initialRows || []) }, [initialRows])

  const sdoSelectOptions = useMemo(() => {
    // "Nueva Ecija (PM)" + "Nueva Ecija (SM)" → one option "Nueva Ecija"
    const byBase = new Map<string, SdoOption[]>()
    for (const o of sdoOptions) {
      const key = normalizeSdoName(o.sdo)
      if (!key) continue
      if (!byBase.has(key)) byBase.set(key, [])
      byBase.get(key)!.push(o)
    }
    return [...byBase.values()]
      .map(variants => {
        const preferred = pickPreferredSdoVariant(variants) || variants[0]
        return {
          ...preferred,
          sdo: baseSdoName(preferred.sdo) || preferred.sdo,
          variantIds: variants.map(v => v.id),
        }
      })
      .sort((a, b) => a.sdo.localeCompare(b.sdo))
  }, [sdoOptions])

  const visible = useMemo(() => {
    if (filterSdo === 'ALL') return rows
    const opt = sdoSelectOptions.find(o => o.id === filterSdo || (o as any).variantIds?.includes(filterSdo))
    if (opt) {
      const ids = new Set([opt.id, ...((opt as any).variantIds || [])])
      const base = normalizeSdoName(opt.sdo)
      return rows.filter(r =>
        (r.sbfp_data_id && ids.has(r.sbfp_data_id)) ||
        normalizeSdoName(r.sdo) === base,
      )
    }
    return rows.filter(r => r.sdo === filterSdo || r.sbfp_data_id === filterSdo)
  }, [rows, filterSdo, sdoSelectOptions])

  const syncRow = async (row: DropoffRow) => {
    // Service-role API — browser RLS often cannot update mfp_data for encoders
    const err = await apiSyncDropoff(row)
    if (err) setMsg(err)
  }

  const updateField = async (id: string, field: keyof DropoffRow, value: any) => {
    const prev = rows.find(r => r.id === id)
    if (!prev) return

    let patch: Partial<DropoffRow> = { [field]: value }
    if (field === 'sbfp_data_id') {
      const opt = sdoSelectOptions.find(o =>
        o.id === value || ((o as any).variantIds || []).includes(value),
      )
      const inferredDays =
        (opt?.feeding_days && opt.feeding_days > 0 ? opt.feeding_days : null) ||
        parseFeedingDaysFromText(opt?.sdo, opt?.remarks) ||
        0
      // Store geographic SDO only — milk type lives on procurement / masterlist
      patch = {
        sbfp_data_id: opt?.id || value || null,
        sdo: opt ? (baseSdoName(opt.sdo) || opt.sdo) : '',
        region: opt?.region || prev.region,
      }
      if (!(Number(prev.feeding_days) > 0) && inferredDays > 0) {
        patch.feeding_days = inferredDays
      }
    }

    const next = { ...prev, ...patch }
    setRows(p => p.map(r => r.id === id ? next : r))

    const { error } = await supabase
      .from('sbfp_dropoff_points')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      setMsg(error.message)
      setRows(p => p.map(r => r.id === id ? prev : r))
      return
    }
    await syncRow(next)
  }

  const handleAdd = async () => {
    if (!editable || !sdoSelectOptions.length) {
      setMsg(sdoSelectOptions.length ? null : 'Add an SDO in procurement first, then add drop-off schools.')
      return
    }
    setAdding(true)
    const first = sdoSelectOptions[0]
    const inferredDays =
      (first.feeding_days && first.feeding_days > 0 ? first.feeding_days : null) ||
      parseFeedingDaysFromText(first.sdo) ||
      0
    const payload = {
      year,
      center,
      sbfp_data_id: first.id,
      sdo: first.sdo,
      dropoff_name: 'New school',
      beneficiaries: 0,
      feeding_days: inferredDays,
      district: '',
      municipality: '',
      province: '',
      region: first.region || '',
      include_in_masterlist: true,
    }
    const { data, error } = await supabase.from('sbfp_dropoff_points').insert(payload).select().maybeSingle()
    setAdding(false)
    if (error) {
      setMsg(error.message)
      return
    }
    if (data) {
      setRows(p => [...p, data as DropoffRow])
      await syncRow(data as DropoffRow)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this drop-off school? Linked masterlist row will be removed.')) return
    const unlinkErr = await apiUnlinkDropoff(id)
    if (unlinkErr) { setMsg(unlinkErr); return }
    const { error } = await supabase.from('sbfp_dropoff_points').delete().eq('id', id)
    if (error) setMsg(error.message)
    else {
      setRows(p => p.filter(r => r.id !== id))
      setSelected(p => { const n = new Set(p); n.delete(id); return n })
    }
  }

  const deleteSelected = async () => {
    if (!selected.size) return
    if (!confirm(`Delete ${selected.size} drop-off school(s)? Linked masterlist rows will be removed.`)) return
    for (const id of selected) {
      const unlinkErr = await apiUnlinkDropoff(id)
      if (unlinkErr) { setMsg(unlinkErr); return }
      await supabase.from('sbfp_dropoff_points').delete().eq('id', id)
    }
    setRows(p => p.filter(r => !selected.has(r.id)))
    setSelected(new Set())
  }

  const stickyTh = (left: number, width: number, edge = false): CSSProperties => ({
    position: 'sticky', left, top: 0, zIndex: 20,
    width, minWidth: width, maxWidth: width,
    background: 'var(--navy)', color: '#fff',
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.18)' : undefined,
  })
  const stickyTd = (left: number, width: number, bg: string, edge = false): CSSProperties => ({
    position: 'sticky', left, zIndex: 5,
    width, minWidth: width, maxWidth: width,
    background: bg,
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.12)' : undefined,
  })

  return (
    <div className="flex flex-col gap-2">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label className="text-xs text-muted-foreground">Filter SDO</label>
          <select
            value={filterSdo}
            onChange={e => setFilterSdo(e.target.value)}
            className="h-9 px-2 rounded-md border text-sm bg-background"
          >
            <option value="ALL">All SDOs ({rows.length})</option>
            {sdoSelectOptions.map(o => (
              <option key={o.id} value={o.sdo}>{o.sdo}</option>
            ))}
          </select>
          {msg && <span className="text-xs text-red-600">{msg}</span>}
        </div>
        {editable && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={deleteSelected}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium border border-red-500 text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Delete ({selected.size})
              </button>
            )}
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus size={14} />
              {adding ? 'Adding…' : 'Add school'}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
          <table className="data-table" style={{ minWidth: 1600, fontSize: '0.78rem', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'center', ...stickyTh(0, 36) }}>
                  <input
                    type="checkbox"
                    checked={visible.length > 0 && visible.every(r => selected.has(r.id))}
                    onChange={() => {
                      if (visible.every(r => selected.has(r.id))) {
                        setSelected(p => {
                          const n = new Set(p)
                          visible.forEach(r => n.delete(r.id))
                          return n
                        })
                      } else {
                        setSelected(p => {
                          const n = new Set(p)
                          visible.forEach(r => n.add(r.id))
                          return n
                        })
                      }
                    }}
                  />
                </th>
                <th style={{ ...stickyTh(36, 160, true) }}>SDO</th>
                <th style={{ minWidth: 220 }}>Drop-off Point (School)</th>
                <th style={{ minWidth: 110, textAlign: 'right' }}>Beneficiaries</th>
                <th style={{ minWidth: 100, textAlign: 'right' }} title="Encoder input — Milk packs = Beneficiaries × Feeding days">
                  Feeding Days
                </th>
                <th style={{ minWidth: 110, textAlign: 'right', background: '#1e3a5f' }} title="= Beneficiaries × Feeding days">
                  Milk Packs
                </th>
                <th
                  style={{ minWidth: 110, textAlign: 'right', background: '#1e3a5f' }}
                  title="SM: Packs × 0.18 L (180 ml) · PM: Packs × 0.20 L (200 ml)"
                >
                  Total Vol.
                </th>
                <th style={{ minWidth: 100, textAlign: 'right', background: '#1e3a5f' }} title="= Vol × 0.20">
                  Raw Milk (L)
                </th>
                <th style={{ minWidth: 100, textAlign: 'right', background: '#1e3a5f' }} title="= Raw × 0.268">
                  Whole (kg)
                </th>
                <th style={{ minWidth: 100, textAlign: 'right', background: '#1e3a5f' }} title="= Raw × 0.274">
                  Skim (kg)
                </th>
                <th style={{ minWidth: 90, textAlign: 'right', background: '#1e3a5f' }} title="= Vol × 0.02">
                  Sugar (kg)
                </th>
                <th style={{ minWidth: 140 }}>District</th>
                <th style={{ minWidth: 130 }}>Municipality</th>
                <th style={{ minWidth: 120 }}>Province</th>
                <th style={{ minWidth: 100, textAlign: 'center' }}>In Masterlist?</th>
                {editable && <th style={{ minWidth: 70 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={16} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>
                    No drop-off schools yet for {center}.
                  </td>
                </tr>
              )}
              {visible.map(r => {
                const bg = selected.has(r.id) ? '#e0e7ff' : '#fff'
                const parentOpt = sdoSelectOptions.find(o =>
                  o.id === r.sbfp_data_id ||
                  ((o as any).variantIds || []).includes(r.sbfp_data_id) ||
                  (r.sdo && normalizeSdoName(o.sdo) === normalizeSdoName(r.sdo)),
                )
                const selectValue = parentOpt?.id || ''
                const milkType =
                  inferSbfpMilkType(parentOpt?.sdo, parentOpt?.remarks, r.sdo) ||
                  normalizeSbfpMilkType(parentOpt?.milk_type) ||
                  'PM'
                const days = resolveDropoffFeedingDays(r, parentOpt ? {
                  feeding_days: parentOpt.feeding_days,
                  sdo: parentOpt.sdo,
                  remarks: parentOpt.remarks,
                } : null)
                const calc = calcMilkFormulations(Number(r.beneficiaries) || 0, days, milkType)
                const fmt4 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })
                const displaySdo = baseSdoName(r.sdo || '') || r.sdo || '—'
                const volFactor = litersPerPackForMilkType(milkType)
                return (
                  <tr key={r.id} style={{ background: bg }}>
                    <td style={{ textAlign: 'center', ...stickyTd(0, 36, bg) }}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => {
                          setSelected(p => {
                            const n = new Set(p)
                            n.has(r.id) ? n.delete(r.id) : n.add(r.id)
                            return n
                          })
                        }}
                      />
                    </td>
                    <td style={stickyTd(36, 160, bg, true)}>
                      {editable ? (
                        <select
                          value={selectValue}
                          onChange={e => updateField(r.id, 'sbfp_data_id', e.target.value || null)}
                          style={{ width: '100%', border: 0, background: 'transparent', fontSize: 'inherit' }}
                          title={
                            selectValue
                              ? 'SDO (PM/SM/CM variants count as one)'
                              : r.sdo
                                ? `Stored as “${r.sdo}” but not linked — pick an SDO`
                                : 'Select SDO'
                          }
                        >
                          <option value="">
                            {selectValue ? '—' : (displaySdo !== '—' ? `${displaySdo} (not linked)` : '—')}
                          </option>
                          {sdoSelectOptions.map(o => (
                            <option key={o.id} value={o.id}>{o.sdo}</option>
                          ))}
                        </select>
                      ) : displaySdo}
                    </td>
                    <EditableText
                      value={r.dropoff_name}
                      disabled={!editable}
                      onCommit={v => updateField(r.id, 'dropoff_name', String(v || '').trim() || r.dropoff_name)}
                    />
                    <EditableText
                      value={r.beneficiaries}
                      type="number"
                      align="right"
                      disabled={!editable}
                      onCommit={v => updateField(r.id, 'beneficiaries', Number(v) || 0)}
                    />
                    <EditableText
                      value={Number(r.feeding_days) > 0 ? r.feeding_days : ''}
                      type="number"
                      align="right"
                      disabled={!editable}
                      title="Type feeding days — milk packs = beneficiaries × days (saves to masterlist)"
                      cellStyle={{ background: 'rgba(16,185,129,0.06)' }}
                      onCommit={v => updateField(r.id, 'feeding_days', Number(v) > 0 ? Number(v) : 0)}
                    />
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.06)', fontWeight: 600 }}>
                      {calc ? calc.milkPacks.toLocaleString() : '—'}
                    </td>
                    <td
                      style={{ textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}
                      title={calc ? `Packs × ${volFactor} (${milkType === 'SM' ? '180 ml SM' : '200 ml PM'})` : undefined}
                    >
                      {calc ? fmt4(calc.totalVol) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}>
                      {calc ? fmt4(calc.rawMilk) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}>
                      {calc ? fmt4(calc.wholeMilk) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}>
                      {calc ? fmt4(calc.skimMilk) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}>
                      {calc ? fmt4(calc.sugar) : '—'}
                    </td>
                    <EditableText
                      value={r.district}
                      disabled={!editable}
                      onCommit={v => updateField(r.id, 'district', v == null ? '' : String(v))}
                    />
                    <EditableText
                      value={r.municipality}
                      disabled={!editable}
                      onCommit={v => updateField(r.id, 'municipality', v == null ? '' : String(v))}
                    />
                    <EditableText
                      value={r.province}
                      disabled={!editable}
                      onCommit={v => updateField(r.id, 'province', v == null ? '' : String(v))}
                    />
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        disabled={!editable}
                        checked={r.include_in_masterlist !== false}
                        onChange={e => updateField(r.id, 'include_in_masterlist', e.target.checked)}
                        style={{ cursor: editable ? 'pointer' : 'default', width: 15, height: 15 }}
                      />
                    </td>
                    {editable && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className="btn btn-outline"
                          style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', color: '#ef4444', borderColor: '#ef4444' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
