'use client'

import { useMemo, useState, useEffect, useRef, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import type { MonitoringProgramId } from '@/lib/monitoring-programs'
import type { ProgramDropoffRow, ProgramProcurementRow } from '@/lib/program-dropoff-sync'
import { calcMilkFormulations } from '@/lib/mfp-formulas'
import { normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'
import { useAsyncTask } from '@/components/loading/AsyncFeedback'
import { Spinner } from '@/components/loading/Spinner'
import { nextIncrementedName } from '@/lib/next-incremented-name'

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
  month = 8,
  areaColumnLabel,
  parentOptions,
  initialRows,
  editable,
  onRowsChange,
}: {
  programId: MonitoringProgramId
  center: string
  year: number
  month?: number
  areaColumnLabel: string
  parentOptions: ParentOption[]
  initialRows: ProgramDropoffRow[]
  editable: boolean
  onRowsChange?: (rows: ProgramDropoffRow[]) => void
}) {
  const supabase = createClient()
  const runTask = useAsyncTask('Saving…')
  const [rows, setRows] = useState(initialRows)
  const [filterParent, setFilterParent] = useState<string>('')
  const [busyRowId, setBusyRowId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const reservedNamesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])
  useEffect(() => {
    onRowsChange?.(rows)
  }, [rows])

  const filtered = useMemo(() => {
    if (!filterParent) return rows
    return rows.filter(r => r.procurement_id === filterParent)
  }, [rows, filterParent])

  const updateLocal = (id: string, patch: Partial<ProgramDropoffRow>) => {
    setRows(p => p.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  const save = async (row: ProgramDropoffRow, field: string, value: unknown) => {
    setBusyRowId(row.id)
    try {
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
    } finally {
      setBusyRowId(null)
    }
  }

  const addMunicipality = async () => {
    const parent = (filterParent && parentOptions.find(p => p.id === filterParent)) || parentOptions[0]
    if (!parent) {
      alert(`Add a ${areaColumnLabel.toLowerCase()} in section 1 first, then you can add a municipality.`)
      return
    }
    if (adding) return
    setAdding(true)
    try {
      await runTask(async () => {
        const province = parent.province || parent.label || ''
        const provinceKey = String(province).trim().toLowerCase()
        const sameProvinceNames = rows
          .filter(r => String(r.province || '').trim().toLowerCase() === provinceKey)
          .flatMap(r => [r.dropoff_name, r.municipality])
        const reservedForProvince = [...reservedNamesRef.current]
          .filter(k => k.startsWith(`${provinceKey}\u0000`))
          .map(k => k.slice(provinceKey.length + 1))
        const baseName = nextIncrementedName('New Municipality', [
          ...sameProvinceNames,
          ...reservedForProvince,
        ])
        const reserveKey = `${provinceKey}\u0000${baseName.toLowerCase()}`
        reservedNamesRef.current.add(reserveKey)
        try {
          const { data, error } = await supabase
            .from('mfp_program_dropoffs')
            .insert({
              year,
              month,
              center,
              program: programId,
              procurement_id: parent.id,
              province,
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
        } finally {
          reservedNamesRef.current.delete(reserveKey)
        }
      }, 'Adding municipality…', { blocking: false })
    } finally {
      setAdding(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove municipality drop-off and masterlist row?')) return
    setBusyRowId(id)
    try {
      await runTask(async () => {
        await apiUnlink(id)
        const { error } = await supabase.from('mfp_program_dropoffs').delete().eq('id', id)
        if (error) {
          alert(error.message)
          return
        }
        setRows(p => p.filter(r => r.id !== id))
      }, 'Removing…', { blocking: true })
    } finally {
      setBusyRowId(null)
    }
  }

  const milkTypeFor = (row: ProgramDropoffRow) => {
    const p = parentOptions.find(o => o.id === row.procurement_id)
    return normalizeSbfpMilkType(p?.milk_type) || 'PM'
  }

  // Sticky: first 3 columns (Province/Area + Municipality + Beneficiaries).
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
  const SL = { area: 0, muni: 140, bene: 300 } as const
  const SW = { area: 140, muni: 160, bene: 110 } as const

  return (
    <div className="flex flex-col gap-2">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: '0.8rem' }}>
          Filter {areaColumnLabel}:{' '}
          <select value={filterParent} onChange={e => setFilterParent(e.target.value)} style={{ marginLeft: 4 }}>
            <option value="">All ({parentOptions.length} {areaColumnLabel.toLowerCase()}{parentOptions.length === 1 ? '' : 's'})</option>
            {parentOptions.map(p => (
              <option key={p.id} value={p.id}>
                {p.label || 'Untitled'}
              </option>
            ))}
          </select>
        </label>
        {editable && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={addMunicipality}
            disabled={adding || parentOptions.length === 0}
            title={parentOptions.length === 0 ? `Add a ${areaColumnLabel.toLowerCase()} in section 1 first` : undefined}
            style={{
              marginLeft: 'auto',
              fontSize: '0.8rem',
              cursor: adding ? 'wait' : parentOptions.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {adding ? <Spinner size={14} /> : <Plus size={14} />} {adding ? 'Adding…' : 'Add municipality'}
          </button>
        )}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
          <table
            className="data-table"
            style={{ fontSize: '0.75rem', minWidth: 1100, borderCollapse: 'separate', borderSpacing: 0 }}
          >
            <thead>
              <tr>
                <th style={stickyTh(SL.area, SW.area)}>{areaColumnLabel}</th>
                <th style={stickyTh(SL.muni, SW.muni)}>Municipality</th>
                <th style={{ textAlign: 'right', ...stickyTh(SL.bene, SW.bene, true) }}>Beneficiaries</th>
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
                const rowBg = '#fff'
                return (
                  <tr key={r.id} style={{ opacity: busyRowId === r.id ? 0.7 : 1, background: rowBg }}>
                    <td style={stickyTd(SL.area, SW.area, rowBg)}>{parentLabel}</td>
                    <td style={stickyTd(SL.muni, SW.muni, rowBg)}>
                      {editable ? (
                        <input
                          defaultValue={r.dropoff_name || r.municipality || ''}
                          onBlur={e => {
                            const v = e.target.value.trim()
                            void save(r, 'dropoff_name', v)
                            void save(r, 'municipality', v)
                          }}
                          style={{ minWidth: 120, width: '100%', border: 0, background: 'transparent' }}
                        />
                      ) : (
                        r.dropoff_name || r.municipality
                      )}
                    </td>
                    <td style={{ textAlign: 'right', ...stickyTd(SL.bene, SW.bene, rowBg, true) }}>
                      {editable ? (
                        <input
                          type="number"
                          defaultValue={r.beneficiaries ?? 0}
                          onBlur={e => save(r, 'beneficiaries', Number(e.target.value) || 0)}
                          style={{ width: 80, textAlign: 'right', border: 0, background: 'transparent' }}
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
      </div>
    </div>
  )
}
