'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { Edit2, Trash2, Lock } from 'lucide-react'
import { Spinner } from '@/components/loading/Spinner'
import { useAsyncTask } from '@/components/loading/AsyncFeedback'
import { logCenterActivity } from '@/lib/center-activity'

function EditableCell({ id, field, value, type = 'text', className, style, format, render, onSave, readOnly = false }: { id: string, field: string, value: any, type?: string, className?: string, style?: any, format?: (v: any) => any, render?: (v: any) => any, onSave?: (id: string, field: string, oldVal: any, newVal: any) => void, readOnly?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const supabase = createClient();

  useEffect(() => {
    setVal(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const save = async () => {
    let saveVal = val;
    if (type === 'number') {
      saveVal = val === '' || val == null ? null : Number(val);
    }
    if (type === 'date') {
      saveVal = val === '' || val == null ? null : val;
    }
    if (saveVal === value || (saveVal == null && (value == null || value === ''))) {
      setVal(value);
      setIsEditing(false);
      return;
    }
    setIsEditing(false);
    setIsSaving(true);
    if (onSave) onSave(id, field, value, saveVal);
    try {
      const { data: updated, error } = await supabase
        .from('mfp_data')
        .update({ [field]: saveVal, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id,center,elementary_school,municipality')
        .maybeSingle();
      if (error) throw error;
      if (updated?.center) {
        const label = String(updated.elementary_school || updated.municipality || 'record').trim()
        void logCenterActivity(supabase, {
          center: updated.center,
          action: 'updated',
          source: 'mfp_data',
          sourceId: id,
          summary: `Updated MFP record · ${label}`,
          detail: `Field: ${field}`,
        })
      }
    } catch (e) {
      console.error('Error saving:', e);
      setVal(value);
      if (onSave) onSave(id, field, saveVal, value);
      alert('Failed to save cell — change was reverted.');
    } finally {
      setIsSaving(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      save();
    }
    if (e.key === 'Escape') {
      setVal(value);
      setIsEditing(false);
    }
  }

  const stickyCol = Boolean(className?.startsWith('col-'))

  if (isEditing) {
    if (type === 'date') {
      return (
        <td className={className} style={{ ...style, padding: '2px', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input
              ref={inputRef as any}
              type="date"
              value={val ?? ''}
              onChange={e => setVal(e.target.value)}
              onBlur={e => {
                if (e.relatedTarget && (e.relatedTarget as HTMLElement).dataset?.action === 'clear-date') return
                save()
              }}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
              style={{ flex: 1, minWidth: 0, height: '100%', border: '1px solid #3b82f6', outline: 'none', padding: '2px 4px', fontSize: 'inherit', boxSizing: 'border-box' }}
            />
            {val && (
              <button
                type="button"
                data-action="clear-date"
                title="Remove date"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setVal('')
                  void save()
                }}
                style={{
                  border: 'none',
                  background: '#fee2e2',
                  color: '#dc2626',
                  borderRadius: '3px',
                  padding: '2px 5px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        </td>
      )
    }

    return (
      <td className={className} style={{ ...style, padding: '2px', background: '#fff' }}>
        <input
          ref={inputRef as any}
          type={type}
          value={val ?? ''}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          style={{ width: '100%', height: '100%', border: '1px solid #3b82f6', outline: 'none', padding: '2px 4px', fontSize: 'inherit', boxSizing: 'border-box' }}
        />
      </td>
    )
  }

  return (
    <td
      className={className}
      style={{
        ...style,
        cursor: readOnly ? 'default' : 'text',
        opacity: isSaving ? 0.85 : 1,
        // Do not set position:relative on sticky cols — it breaks position:sticky from .col-*.
        ...(stickyCol ? { position: 'sticky' as const } : { position: 'relative' as const }),
      }}
      onClick={() => !readOnly && !isSaving && setIsEditing(true)}
    >
      {(val === null || val === undefined || val === '') ? 'N/A' : render ? render(val) : format ? format(val) : val}
      {isSaving && (
        <div className="cell-saving-overlay">
          <Spinner size={12} />
        </div>
      )}
    </td>
  )
}

export function DataTable({
  records,
  resyncDelivery,
  resyncProgram,
  readOnly = false,
  userRole = 'viewer',
}: {
  records: any[]
  resyncDelivery?: { center: string; year: number } | null
  /** Push DSWD/LDS/etc. monitoring drop-offs into masterlist for this center/year. */
  resyncProgram?: { center: string; year: number; program?: string } | null
  readOnly?: boolean
  /** The current user's role — used to lock historical (pre-2026) rows for non-admins. */
  userRole?: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const runTask = useAsyncTask('Syncing delivery totals…')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [localRecords, setLocalRecords] = useState(records)
  const [undoStack, setUndoStack] = useState<any[]>([])
  const [redoStack, setRedoStack] = useState<any[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [pageSize, setPageSize] = useState<number>(100)
  const [currentPage, setCurrentPage] = useState<number>(1)

  useEffect(() => {
    setLocalRecords(records)
    setCurrentPage(1)
  }, [records])

  const displayRecords = useMemo(() => {
    const seenIds = new Set<string>()
    const unique = localRecords.filter(r => {
      if (!r?.id) return true
      if (seenIds.has(r.id)) return false
      seenIds.add(r.id)
      return true
    })

    return unique.sort((a, b) => {
      const y = (Number(b.year) || 0) - (Number(a.year) || 0)
      if (y !== 0) return y
      const c = String(a.center || '').localeCompare(String(b.center || ''))
      if (c !== 0) return c
      const d = String(a.division || '').localeCompare(String(b.division || ''))
      if (d !== 0) return d
      return String(a.elementary_school || '').localeCompare(String(b.elementary_school || ''))
    })
  }, [localRecords])

  const totalPages = pageSize === -1 ? 1 : Math.ceil(displayRecords.length / pageSize) || 1
  const paginatedRecords = useMemo(() => {
    if (pageSize === -1 || pageSize >= displayRecords.length) return displayRecords
    const start = (currentPage - 1) * pageSize
    return displayRecords.slice(start, start + pageSize)
  }, [displayRecords, currentPage, pageSize])

  // SDO-level AD/AE (one target + delivered total per year+center+division)
  const divisionDelivery = useMemo(() => {
    const keyData: Record<string, { target: number; delivered: number }> = {}
    displayRecords.forEach(r => {
      const key = `${r.year}|${r.center}|${r.division}`
      if (!keyData[key]) keyData[key] = { target: 0, delivered: 0 }
      const t = Number(r.target_milk_packs_to_deliver) || 0
      const d = Number(r.total_milk_packs_delivered) || 0
      if (t > keyData[key].target) keyData[key].target = t
      if (d > keyData[key].delivered) keyData[key].delivered = d
    })
    return keyData
  }, [displayRecords])

  // One merged AD/AE block per consecutive SDO group on current page (Excel-style)
  const divisionRowSpan = useMemo(() => {
    const result: { firstInGroup: boolean; rowspan: number; target: number; delivered: number }[] = []
    let i = 0
    while (i < paginatedRecords.length) {
      const r = paginatedRecords[i]
      const key = `${r.year}|${r.center}|${r.division}`
      let span = 1
      while (i + span < paginatedRecords.length) {
        const nr = paginatedRecords[i + span]
        if (`${nr.year}|${nr.center}|${nr.division}` === key) span++
        else break
      }
      const data = divisionDelivery[key] ?? { target: 0, delivered: 0 }
      result.push({ firstInGroup: true, rowspan: span, ...data })
      for (let j = 1; j < span; j++) {
        result.push({ firstInGroup: false, rowspan: 0, ...data })
      }
      i += span
    }
    return result
  }, [paginatedRecords, divisionDelivery])

  useEffect(() => {
    if (!resyncDelivery?.center || !resyncDelivery?.year) return
    const storageKey = `mfp-delivery-resync:${resyncDelivery.center}:${resyncDelivery.year}`
    if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) return
    let cancelled = false
      ; (async () => {
        try {
          await runTask(
            async () => {
              const res = await fetch('/api/sbfp/sync-dropoff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'resync-center-delivery',
                  center: resyncDelivery.center,
                  year: resyncDelivery.year,
                }),
              })
              if (!res.ok || cancelled) return
              sessionStorage.setItem(storageKey, '1')
              // No router.refresh() — keep encoders on the current table; next navigation picks up totals.
            },
            'Syncing delivery totals in background…',
            { blocking: false },
          )
        } catch {
          // ignore — table still shows best available DB values
        }
      })()
    return () => { cancelled = true }
  }, [resyncDelivery?.center, resyncDelivery?.year, runTask])

  useEffect(() => {
    if (!resyncProgram?.center || !resyncProgram?.year) return
    const program = resyncProgram.program || 'dswd'
    const storageKey = `mfp-program-resync:${program}:${resyncProgram.center}:${resyncProgram.year}`
    if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) return
    let cancelled = false
      ; (async () => {
        try {
          await runTask(
            async () => {
              const res = await fetch('/api/monitoring/sync-dropoff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'resync-center-program',
                  program,
                  center: resyncProgram.center,
                  year: resyncProgram.year,
                }),
              })
              if (!res.ok || cancelled) return
              sessionStorage.setItem(storageKey, '1')
              // Quiet background sync — do not block UI or force a full RSC reload.
            },
            'Syncing monitoring to masterlist in background…',
            { blocking: false },
          )
        } catch {
          // ignore
        }
      })()
    return () => { cancelled = true }
  }, [resyncProgram?.center, resyncProgram?.year, resyncProgram?.program, runTask])

  const handleCellSave = (id: string, field: string, oldVal: any, newVal: any) => {
    const target = localRecords.find(r => r.id === id)
    if (target && Number(target.year) < 2026 && !canEditHistorical) {
      alert('Historical records (2019–2025) can only be edited by an Administrator.')
      return
    }
    setLocalRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: newVal } : r))
    setUndoStack(prev => [...prev, { id, field, oldVal, newVal }])
    setRedoStack([])
  }

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          // Redo
          if (redoStack.length === 0) return;
          const action = redoStack[redoStack.length - 1];
          setRedoStack(prev => prev.slice(0, -1));
          await supabase.from('mfp_data').update({ [action.field]: action.newVal, updated_at: new Date().toISOString() }).eq('id', action.id);
          setLocalRecords(prev => prev.map(r => r.id === action.id ? { ...r, [action.field]: action.newVal } : r));
          setUndoStack(prev => [...prev, action]);
        } else {
          // Undo
          if (undoStack.length === 0) return;
          const action = undoStack[undoStack.length - 1];
          setUndoStack(prev => prev.slice(0, -1));
          await supabase.from('mfp_data').update({ [action.field]: action.oldVal, updated_at: new Date().toISOString() }).eq('id', action.id);
          setLocalRecords(prev => prev.map(r => r.id === action.id ? { ...r, [action.field]: action.oldVal } : r));
          setRedoStack(prev => [...prev, action]);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (redoStack.length === 0) return;
        const action = redoStack[redoStack.length - 1];
        setRedoStack(prev => prev.slice(0, -1));
        await supabase.from('mfp_data').update({ [action.field]: action.newVal, updated_at: new Date().toISOString() }).eq('id', action.id);
        setLocalRecords(prev => prev.map(r => r.id === action.id ? { ...r, [action.field]: action.newVal } : r));
        setUndoStack(prev => [...prev, action]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack]);


  const toggleSelectAll = () => {
    const selectableRecords = canEditHistorical ? records : records.filter(r => Number(r.year) >= 2026)
    if (selectedIds.size === selectableRecords.length && selectableRecords.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableRecords.map(r => r.id)))
    }
  }

  const toggleRow = (id: string) => {
    const target = records.find(r => r.id === id)
    if (target && Number(target.year) < 2026 && !canEditHistorical) {
      return
    }
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const handleBulkEdit = () => {
    if (!canEditHistorical) {
      const hasHistorical = records.some(r => selectedIds.has(r.id) && Number(r.year) < 2026)
      if (hasHistorical) {
        alert('Only Administrators can edit historical records (2019–2025).')
        return
      }
    }
    sessionStorage.setItem('bulkEditIds', JSON.stringify(Array.from(selectedIds)))
    router.push('/data/bulk-edit')
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0 || bulkDeleting) return
    if (!canEditHistorical) {
      const hasHistorical = records.some(r => selectedIds.has(r.id) && Number(r.year) < 2026)
      if (hasHistorical) {
        alert('Only Administrators can delete historical records (2019–2025).')
        return
      }
    }
    const ok = confirm(
      `Delete ${ids.length} selected record${ids.length === 1 ? '' : 's'} from MFP Data? This cannot be undone.`,
    )
    if (!ok) return

    setBulkDeleting(true)
    try {
      await runTask(
        async () => {
          const chunkSize = 100
          for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize)
            const { error } = await supabase.from('mfp_data').delete().in('id', chunk)
            if (error) throw error
          }
          setLocalRecords(prev => prev.filter(r => !selectedIds.has(r.id)))
          setSelectedIds(new Set())
          setUndoStack([])
          setRedoStack([])
          router.refresh()
        },
        `Deleting ${ids.length} record${ids.length === 1 ? '' : 's'}…`,
        { blocking: true },
      )
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Could not delete selected records.')
    } finally {
      setBulkDeleting(false)
    }
  }

  /** Only admin / super_admin can edit historical (pre-2026) rows. */
  const canEditHistorical = userRole === 'admin' || userRole === 'super_admin'

  return (
    <>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table
            className="data-table mfp-data-table"
            style={{ minWidth: 2700, fontSize: '0.78rem', borderCollapse: 'separate', borderSpacing: 0 }}
          >
            <thead>
              <tr>
                {/* CHECKBOX */}
                {!readOnly && (
                  <th className="col-check" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 40, width: 40 }}>
                    <input type="checkbox" checked={records.length > 0 && selectedIds.size === records.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                )}
                {/* A-G */}
                <th className="col-year" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 60 }}>A — Year</th>
                <th className="col-funded" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 80 }}>B — Funded By</th>
                <th className="col-region" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 70 }}>C — Region</th>
                <th className="col-center" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 70 }}>D — Center</th>
                <th className="col-prov" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>E — Province</th>
                <th className="col-div" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>F — Division</th>
                <th className="col-muni" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 120 }}>G — Municipality</th>
                <th className="col-school" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 160 }}>H — Elementary School</th>
                {/* I-N auto-calc */}
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>I — Milk Packs</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>J — Total Vol. Req (L)</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>K — Raw Milk (L)</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>L — Whole Milk (kg)</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>M — Skimmed Milk (kg)</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>N — Sugar (kg)</th>
                {/* O-S user inputs */}
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>O — Feeding Days</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 80 }}>P — Batch</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>Q — Beneficiaries</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>R — Milk Type</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>S — Price (₱)</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 160 }}>T — Supplier</th>
                {/* U-X financial & mode */}
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>U — Milk Cost (₱)</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>V — Service Fee (₱)</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>W — Total Funds (₱)</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 120 }}>X — Mode of Procurement</th>
                {/* Y-AC Dates */}
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>Y — MOA Signing</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>Z — Fund Transfer</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>AA — Date Started</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>AB — Date Completed</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>AC — Liquidation</th>
                {/* AD-AE Delivery tracking */}
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 110 }}>AD — Target Milk Packs to Deliver</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 110 }}>AE — Total Milk Packs Delivered</th>
                {!readOnly && <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 80 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {paginatedRecords?.map((r, rIdx) => {
                const isHistorical = Number(r.year) < 2026
                const canEditThisRow = !readOnly && (!isHistorical || canEditHistorical)
                return (
                  <tr
                    key={r.id || `row-${rIdx}`}
                    className={selectedIds.has(r.id) ? 'mfp-data-row-selected' : undefined}
                    style={{ background: selectedIds.has(r.id) ? '#e0e7ff' : (isHistorical ? '#fcfdfd' : undefined) }}
                  >
                    {!readOnly && (
                      <td className="col-check" style={{ textAlign: 'center' }}>
                        {isHistorical && !canEditHistorical ? (
                          <input type="checkbox" disabled title="Historical archive (2019–2025) cannot be deleted or bulk-edited by non-admins" style={{ opacity: 0.25, cursor: 'not-allowed' }} />
                        ) : (
                          <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleRow(r.id)} style={{ cursor: 'pointer' }} />
                        )}
                      </td>
                    )}
                    <EditableCell
                      readOnly={!canEditThisRow}
                      onSave={handleCellSave}
                      id={r.id}
                      field="year"
                      value={r.year}
                      type="number"
                      className="col-year"
                      style={{ fontWeight: 700 }}
                    />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="funded_by" value={r.funded_by} className="col-funded" render={v => <span className={'badge badge-' + (v?.toLowerCase() || '')}>{v}</span>} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="region" value={r.region} className="col-region" />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="center" value={r.center} className="col-center" style={{ fontWeight: 600, color: 'var(--navy)' }} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="province" value={r.province} className="col-prov" />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="division" value={r.division} className="col-div" />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="municipality" value={r.municipality} className="col-muni" />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="elementary_school" value={r.elementary_school} className="col-school" />

                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="milk_packs" value={r.milk_packs} type="number" format={formatNumber} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="total_volume_requirements" value={r.total_volume_requirements} type="number" format={formatNumber} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="raw_milk_liters" value={r.raw_milk_liters} type="number" format={formatNumber} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="whole_milk_kg" value={r.whole_milk_kg} type="number" format={v => v?.toFixed(2) ?? 'N/A'} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="skimmed_milk_kg" value={r.skimmed_milk_kg} type="number" format={v => v?.toFixed(2) ?? 'N/A'} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="sugar" value={r.sugar} type="number" format={v => v?.toFixed(2) ?? 'N/A'} />

                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="feeding_days" value={r.feeding_days} type="number" />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="batch" value={r.batch} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="beneficiaries" value={r.beneficiaries} type="number" format={formatNumber} style={{ fontWeight: 600 }} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="milk_type" value={r.milk_type} render={v => <span className={'badge badge-' + (v?.toLowerCase() || '')}>{v || 'N/A'}</span>} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="price" value={r.price} type="number" format={v => v ? '₱' + v.toFixed(2) : 'N/A'} />

                    <td>{(r as any).cooperatives?.name ?? 'N/A'}</td>

                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="milk_cost" value={r.milk_cost} type="number" format={v => v ? '₱' + formatNumber(v) : 'N/A'} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="service_fee" value={r.service_fee} type="number" format={v => v ? '₱' + formatNumber(v) : 'N/A'} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="total_funds_transferred" value={r.total_funds_transferred} type="number" format={v => v ? '₱' + formatNumber(v) : 'N/A'} style={{ fontWeight: 600 }} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="mode_of_procurement" value={r.mode_of_procurement} />

                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="moa_signing" value={r.moa_signing} type="date" format={formatDate} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="fund_transfer" value={r.fund_transfer} type="date" format={formatDate} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="date_started" value={r.date_started} type="date" format={formatDate} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="date_completed" value={r.date_completed} type="date" format={formatDate} />
                    <EditableCell readOnly={!canEditThisRow} onSave={handleCellSave} id={r.id} field="liquidation" value={r.liquidation} type="date" format={formatDate} />

                    {/* AD/AE — one merged cell per SDO (division), like Excel */}
                    {(() => {
                      const info = divisionRowSpan[rIdx]
                      if (!info?.firstInGroup) return null
                      const { rowspan, target, delivered } = info
                      const pct = target > 0 ? Math.round((delivered / target) * 100) : null
                      const pctColor =
                        pct === null ? '#6b7280' : pct >= 100 ? '#16a34a' : pct >= 75 ? '#d97706' : '#dc2626'
                      const cellStyle: React.CSSProperties = {
                        textAlign: 'right',
                        fontSize: '0.78rem',
                        verticalAlign: 'middle',
                        borderLeft: '2px solid #e2e8f0',
                        background: rowspan > 1 ? '#f8faff' : undefined,
                      }
                      return (
                        <>
                          <td
                            rowSpan={rowspan}
                            title="Target milk packs for this division (from SBFP Packs to Deliver)"
                            style={{ ...cellStyle, fontWeight: 600, color: target > 0 ? 'var(--navy)' : '#9ca3af' }}
                          >
                            {target > 0 ? formatNumber(target) : 'N/A'}
                          </td>
                          <td
                            rowSpan={rowspan}
                            title="Total milk packs delivered for this division (from SBFP delivery)"
                            style={{ ...cellStyle, borderLeft: '1px solid #e2e8f0' }}
                          >
                            {delivered > 0 ? (
                              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{formatNumber(delivered)}</span>
                                {pct !== null && (
                                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: pctColor }}>
                                    {pct}%
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af' }}>N/A</span>
                            )}
                          </td>
                        </>
                      )
                    })()}

                    {!readOnly && (
                      <td>
                        {canEditThisRow ? (
                          <Link
                            href={`/data/${r.id}/edit`}
                            className="btn btn-outline"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          >
                            Edit
                          </Link>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              fontSize: '0.7rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: '#f1f5f9',
                              color: '#64748b',
                              padding: '0.25rem 0.5rem',
                            }}
                            title="Archived record (2019–2025) — editable only by Admin"
                          >
                            <Lock size={11} /> Archived
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.6rem 1rem',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            fontSize: '0.82rem',
            color: '#475569',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span>
              Showing{' '}
              <strong>
                {displayRecords.length === 0
                  ? 0
                  : (currentPage - 1) * (pageSize === -1 ? displayRecords.length : pageSize) + 1}
              </strong>{' '}
              to{' '}
              <strong>
                {pageSize === -1
                  ? displayRecords.length
                  : Math.min(currentPage * pageSize, displayRecords.length)}
              </strong>{' '}
              of <strong>{displayRecords.length.toLocaleString()}</strong> records
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
                <option value={-1}>All ({displayRecords.length})</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(1)}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                title="First page"
              >
                « First
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                title="Previous page"
              >
                ‹ Prev
              </button>
              <span style={{ margin: '0 0.5rem', fontWeight: 600 }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                title="Next page"
              >
                Next ›
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                title="Last page"
              >
                Last »
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--navy)',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '50px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          zIndex: 50
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {selectedIds.size} row{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleBulkEdit}
            disabled={bulkDeleting}
            className="btn btn-gold"
            style={{ padding: '0.5rem 1rem', borderRadius: '50px' }}
          >
            <Edit2 size={16} /> Bulk Edit
          </button>
          <button
            onClick={() => void handleBulkDelete()}
            disabled={bulkDeleting}
            className="btn btn-outline"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '50px',
              color: '#fecaca',
              borderColor: 'rgba(254, 202, 202, 0.5)',
              background: 'rgba(220, 38, 38, 0.15)',
            }}
          >
            {bulkDeleting ? <Spinner size={16} className="border-red-200 border-t-transparent" /> : <Trash2 size={16} />}
            {bulkDeleting ? 'Deleting…' : 'Bulk Delete'}
          </button>
        </div>
      )}
    </>
  )
}
