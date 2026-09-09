'use client'

import { useMemo, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import type { MonitoringProgramId } from '@/lib/monitoring-programs'
import type { ProgramDropoffRow, ProgramProcurementRow } from '@/lib/program-dropoff-sync'
import { calcMilkFormulations } from '@/lib/mfp-formulas'
import { normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'

async function apiSync(dropoff: ProgramDropoffRow): Promise<string | null> {
  const res = await fetch('/api/monitoring/sync-dropoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync', dropoff }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return json.error || 'Sync failed'
  return null
}

async function apiUnlink(id: string): Promise<string | null> {
  const res = await fetch('/api/monitoring/sync-dropoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unlink', dropoffId: id }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return json.error || 'Unlink failed'
  return null
}

type ParentOption = { id: string; label: string; region?: string | null; province?: string | null; milk_type?: string | null }

export function ProgramDropoffTable({
  programId,
  center,
  year,
  areaColumnLabel,
  parentOptions,
  initialRows,
  editable,
}: {
  programId: MonitoringProgramId
  center: string
  year: number
  areaColumnLabel: string
  parentOptions: ParentOption[]
  initialRows: ProgramDropoffRow[]
  editable: boolean
}) {
  const supabase = createClient()
  const [rows, setRows] = useState(initialRows)
  const [filterParent, setFilterParent] = useState<string>('')

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  const filtered = useMemo(() => {
    if (!filterParent) return rows
    return rows.filter(r => r.procurement_id === filterParent)
  }, [rows, filterParent])

  const updateLocal = (id: string, patch: Partial<ProgramDropoffRow>) => {
    setRows(p => p.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  const save = async (row: ProgramDropoffRow, field: string, value: unknown) => {
    const { error } = await supabase.from('mfp_program_dropoffs').update({ [field]: value }).eq('id', row.id)
    if (error) {
      alert(error.message)
      return
    }
    const next = { ...row, [field]: value } as ProgramDropoffRow
    updateLocal(row.id, { [field]: value } as Partial<ProgramDropoffRow>)
    if (['beneficiaries', 'feeding_days', 'include_in_masterlist', 'dropoff_name', 'municipality', 'province', 'procurement_id'].includes(field)) {
      const err = await apiSync(next)
      if (err) alert(err)
    }
  }

  const addMunicipality = async () => {
    const parent = parentOptions[0]
    if (!parent) {
      alert(`Add a ${areaColumnLabel.toLowerCase()} in section 1 first.`)
      return
    }
    const baseName = 'New Municipality'
    const { data, error } = await supabase
      .from('mfp_program_dropoffs')
      .insert({
        year,
        center,
        program: programId,
        procurement_id: parent.id,
        province: parent.province || parent.label,
        municipality: baseName,
        dropoff_name: baseName,
        region: parent.region || '',
        beneficiaries: 0,
        feeding_days: 0,
      })
      .select('*')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    const row = data as ProgramDropoffRow
    setRows(p => [...p, row])
    const err = await apiSync(row)
    if (err) alert(err)
  }

  const remove = async (id: string) => {
    if (!confirm('Remove municipality drop-off and masterlist row?')) return
    await apiUnlink(id)
    const { error } = await supabase.from('mfp_program_dropoffs').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setRows(p => p.filter(r => r.id !== id))
  }

  const milkTypeFor = (row: ProgramDropoffRow) => {
    const p = parentOptions.find(o => o.id === row.procurement_id)
    return normalizeSbfpMilkType(p?.milk_type) || 'PM'
  }

  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8, alignItems: 'center' }}>
        <label style={{ fontSize: '0.8rem' }}>
          Filter {areaColumnLabel}:{' '}
          <select value={filterParent} onChange={e => setFilterParent(e.target.value)} style={{ marginLeft: 4 }}>
            <option value="">All ({rows.length})</option>
            {parentOptions.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {editable && (
          <button type="button" className="btn btn-outline" onClick={addMunicipality} style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>
            <Plus size={14} /> Add municipality
          </button>
        )}
      </div>
      <table className="data-table" style={{ fontSize: '0.75rem', minWidth: 1100 }}>
        <thead>
          <tr>
            <th>{areaColumnLabel}</th>
            <th>Municipality</th>
            <th style={{ textAlign: 'right' }}>Beneficiaries</th>
            <th style={{ textAlign: 'right' }}>Feeding days</th>
            <th style={{ textAlign: 'right' }}>Milk packs</th>
            <th style={{ textAlign: 'right' }}>Raw milk (L)</th>
            <th style={{ textAlign: 'right' }}>Whole (kg)</th>
            <th style={{ textAlign: 'right' }}>Skim (kg)</th>
            <th style={{ textAlign: 'right' }}>Sugar (kg)</th>
            <th>In masterlist?</th>
            <th>F/H masterlist</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const mt = milkTypeFor(r)
            const calc = calcMilkFormulations(Number(r.beneficiaries) || 0, Number(r.feeding_days) || 0, mt)
            const parentLabel = parentOptions.find(p => p.id === r.procurement_id)?.label || r.province || '—'
            return (
              <tr key={r.id}>
                <td>{parentLabel}</td>
                <td>
                  {editable ? (
                    <input
                      defaultValue={r.dropoff_name || r.municipality || ''}
                      onBlur={e => {
                        const v = e.target.value.trim()
                        void save(r, 'dropoff_name', v)
                        void save(r, 'municipality', v)
                      }}
                      style={{ minWidth: 120 }}
                    />
                  ) : (
                    r.dropoff_name || r.municipality
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input
                      type="number"
                      defaultValue={r.beneficiaries ?? 0}
                      onBlur={e => save(r, 'beneficiaries', Number(e.target.value) || 0)}
                      style={{ width: 80, textAlign: 'right' }}
                    />
                  ) : (
                    r.beneficiaries
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input
                      type="number"
                      defaultValue={r.feeding_days ?? 0}
                      onBlur={e => save(r, 'feeding_days', Number(e.target.value) || 0)}
                      style={{ width: 70, textAlign: 'right' }}
                    />
                  ) : (
                    r.feeding_days
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>{calc?.milkPacks?.toLocaleString() ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{calc ? calc.rawMilk.toFixed(2) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{calc ? calc.wholeMilk.toFixed(2) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{calc ? calc.skimMilk.toFixed(2) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{calc ? calc.sugar.toFixed(2) : '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={r.include_in_masterlist !== false}
                    disabled={!editable}
                    onChange={e => save(r, 'include_in_masterlist', e.target.checked)}
                  />
                </td>
                <td style={{ fontSize: '0.68rem', color: 'var(--gray-500)' }}>N/A / N/A</td>
                {editable && (
                  <td>
                    <button type="button" className="btn btn-outline" style={{ padding: 4 }} onClick={() => remove(r.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray-500)' }}>
          No municipality drop-offs yet. Masterlist Division (F) and School (H) stay N/A for {programId.toUpperCase()}.
        </p>
      )}
    </div>
  )
}
