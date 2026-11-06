'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import type { SbfpDropoffPoint } from '@/lib/types'
import {
  parseFeedingDaysFromText,
  composeSdoWithMilkType,
  compareSbfpEncoderRows,
  isPlaceholderDropoffName,
} from '@/lib/sbfp-dropoff-sync'
import { calcMilkFormulationsFromPacks, litersPerPackForMilkType } from '@/lib/mfp-formulas'
import { inferSbfpMilkType, normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'
import { logCenterActivity } from '@/lib/center-activity'
import { SbfpDropoffFinanceKpis } from '@/components/SbfpDropoffFinanceKpis'
import { MAX_DROPOFF_AMOUNT, parseDropoffAmount, type DropoffMoneyField } from '@/lib/sbfp-dropoff-finance'

export type DropoffRow = SbfpDropoffPoint
const MAX_MILK_PACKS_PER_DROPOFF = 2_147_483_647

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
  contract_amount?: number | null
}

/** Default drop-off name; unique per SDO (matches DB index on center, year, sdo, dropoff_name). */
function nextDefaultDropoffName(
  sdo: string,
  rows: DropoffRow[],
  reservedKeys: Set<string>,
): string {
  const sdoKey = (sdo || '').trim().toLowerCase()
  const taken = new Set<string>()
  for (const r of rows) {
    if ((r.sdo || '').trim().toLowerCase() !== sdoKey) continue
    taken.add((r.dropoff_name || '').trim().toLowerCase())
  }
  for (const key of reservedKeys) {
    if (!key.startsWith(`${sdoKey}\u0000`)) continue
    taken.add(key.slice(sdoKey.length + 1).toLowerCase())
  }
  if (!taken.has('new school')) return 'New school'
  for (let n = 2; n < 10_000; n++) {
    const name = `New school ${n}`
    if (!taken.has(name.toLowerCase())) return name
  }
  return `New school ${Date.now()}`
}

function EditableText({
  value, align = 'left', type = 'text', disabled, onCommit, title, cellStyle, wrap, min, max, step, currency, onDraft,
}: {
  value: string | number | null | undefined
  align?: 'left' | 'right' | 'center'
  type?: 'text' | 'number'
  disabled?: boolean
  onCommit: (next: string | number | null) => void
  title?: string
  cellStyle?: CSSProperties
  /** Allow long text to wrap fully inside the cell (no ellipsis / clipping). */
  wrap?: boolean
  min?: number
  max?: number
  step?: number
  currency?: boolean
  onDraft?: (value: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState<string>(value == null ? '' : String(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const committedRef = useRef(false)

  useEffect(() => { setVal(value == null ? '' : String(value)) }, [value])
  useEffect(() => {
    if (!editing) return
    if (wrap && type === 'text') areaRef.current?.focus()
    else inputRef.current?.focus()
  }, [editing, wrap, type])

  const wrapStyle: CSSProperties = wrap
    ? {
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        lineHeight: 1.35,
        verticalAlign: 'top',
        overflow: 'visible',
        textOverflow: 'clip',
      }
    : {}

  const save = () => {
    if (committedRef.current) return
    committedRef.current = true
    setEditing(false)
    onDraft?.(null)
    if (type === 'number') {
      const n = val === '' ? null : Number(val)
      onCommit(n != null && Number.isFinite(n) ? n : null)
    } else {
      onCommit(val)
    }
  }

  const display =
    value == null || value === ''
      ? '—'
      : type === 'number'
        ? (currency ? Number(value).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' }) : Number(value).toLocaleString())
        : String(value)

  if (disabled) {
    return (
      <td style={{ textAlign: align, ...wrapStyle, ...cellStyle }} title={title || (wrap ? String(value || '') : undefined)}>
        {display}
      </td>
    )
  }

  if (editing) {
    const fieldStyle: CSSProperties = {
      width: '100%',
      border: '1px solid #3b82f6',
      outline: 'none',
      padding: '2px 4px',
      fontSize: 'inherit',
      textAlign: align,
      boxSizing: 'border-box',
      ...(wrap
        ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', resize: 'vertical', minHeight: 48, lineHeight: 1.35 }
        : {}),
    }
    return (
      <td style={{ padding: 2, background: '#fff', ...wrapStyle, ...cellStyle }}>
        {wrap && type === 'text' ? (
          <textarea
            ref={areaRef}
            value={val}
            onChange={e => { setVal(e.target.value); onDraft?.(e.target.value) }}
            onBlur={save}
            onKeyDown={e => {
              if (e.key === 'Escape') { committedRef.current = true; onDraft?.(null); setVal(value == null ? '' : String(value)); setEditing(false) }
              // Enter inserts newline; Ctrl/Cmd+Enter saves
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
            }}
            rows={3}
            style={fieldStyle}
          />
        ) : (
          <input
            ref={inputRef}
            type={type}
            min={min}
            max={max}
            step={step}
            value={val}
            onChange={e => { setVal(e.target.value); onDraft?.(e.target.value) }}
            onBlur={save}
            onKeyDown={e => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { committedRef.current = true; onDraft?.(null); setVal(value == null ? '' : String(value)); setEditing(false) }
            }}
            style={fieldStyle}
          />
        )}
      </td>
    )
  }

  return (
    <td
      onClick={() => { committedRef.current = false; setEditing(true) }}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') { committedRef.current = false; setEditing(true) } }}
      title={title || (wrap ? String(value || '') : 'Click to edit')}
      style={{ textAlign: align, cursor: 'pointer', ...wrapStyle, ...cellStyle }}
    >
      {display}
    </td>
  )
}

export function SbfpDropoffTable({
  center,
  year,
  sdoOptions,
  initialRows,
  editable,
  financeReady = false,
  pruneSbfpDataId,
  onPruneComplete,
}: {
  center: string
  year: number
  sdoOptions: SdoOption[]
  initialRows: DropoffRow[]
  editable: boolean
  financeReady?: boolean
  /** When an SDO is deleted from procurement, remove its schools without page refresh. */
  pruneSbfpDataId?: string | null
  onPruneComplete?: () => void
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<DropoffRow[]>(initialRows || [])
  const [filterSdo, setFilterSdo] = useState<string>('ALL')
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [financeNotice, setFinanceNotice] = useState<string | null>(null)
  const [savingFinance, setSavingFinance] = useState<Set<string>>(new Set())
  const savingFinanceRef = useRef(new Set<string>())
  const [financeDraft, setFinanceDraft] = useState<{ id: string; field: DropoffMoneyField; value: string } | null>(null)
  const financeRows = useMemo(() => {
    if (!financeDraft) return rows
    const parsed = parseDropoffAmount(financeDraft.value)
    if (parsed.error) return rows
    return rows.map(row => row.id === financeDraft.id ? { ...row, [financeDraft.field]: parsed.value } : row)
  }, [rows, financeDraft])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const scopeKey = `${center}:${year}`
  /** Row IDs added (or edited from placeholder) in this session — kept at the end so they stay visible while encoding. */
  const [sessionAdded, setSessionAdded] = useState<{ scope: string; ids: string[] }>({
    scope: scopeKey,
    ids: [],
  })
  const sessionAddedIds = useMemo(
    () => (sessionAdded.scope === scopeKey ? sessionAdded.ids : []),
    [sessionAdded, scopeKey],
  )
  const appendSessionAddedId = (id: string) => {
    setSessionAdded(prev => {
      const base = prev.scope === scopeKey ? prev.ids : []
      return base.includes(id) ? { scope: scopeKey, ids: base } : { scope: scopeKey, ids: [...base, id] }
    })
  }
  const removeSessionAddedIds = (idsToRemove: Iterable<string>) => {
    const removeSet = new Set(idsToRemove)
    setSessionAdded(prev => {
      if (prev.scope !== scopeKey) return prev
      return { scope: scopeKey, ids: prev.ids.filter(id => !removeSet.has(id)) }
    })
  }
  const [highlightRow, setHighlightRow] = useState<{ scope: string; id: string | null }>({
    scope: scopeKey,
    id: null,
  })
  const highlightRowId = highlightRow.scope === scopeKey ? highlightRow.id : null
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const pendingScrollRowIdRef = useRef<string | null>(null)
  /** Names reserved while insert is in flight (rapid Add clicks). */
  const reservedDropoffNamesRef = useRef(new Set<string>())

  useEffect(() => { setRows(initialRows || []) }, [initialRows])

  useEffect(() => {
    if (!highlightRowId) return
    const timer = window.setTimeout(() => {
      setHighlightRow(curr => (curr.id === highlightRowId ? { scope: scopeKey, id: null } : curr))
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [highlightRowId, scopeKey])

  useEffect(() => {
    if (!pruneSbfpDataId) return
    setRows(p => p.filter(r => r.sbfp_data_id !== pruneSbfpDataId))
    setFilterSdo(f => (f === pruneSbfpDataId ? 'ALL' : f))
    onPruneComplete?.()
  }, [pruneSbfpDataId, onPruneComplete])

  const sdoSelectOptions = useMemo(() => {
    return sdoOptions
      .map(o => ({
        ...o,
        displayLabel:
          composeSdoWithMilkType(o.sdo, o.milk_type) || o.sdo || '',
      }))
      .filter(o => o.displayLabel)
      .sort(compareSbfpEncoderRows)
  }, [sdoOptions])

  const visible = useMemo(() => {
    const filtered =
      filterSdo === 'ALL'
        ? rows
        : rows.filter(r => r.sbfp_data_id === filterSdo)
    const sessionOrder = new Map(sessionAddedIds.map((id, idx) => [id, idx]))
    return [...filtered].sort((a, b) => {
      const ai = sessionOrder.get(a.id)
      const bi = sessionOrder.get(b.id)
      if (ai !== undefined && bi !== undefined) return ai - bi
      if (ai !== undefined) return 1
      if (bi !== undefined) return -1

      const aPlaceholder = isPlaceholderDropoffName(a.dropoff_name)
      const bPlaceholder = isPlaceholderDropoffName(b.dropoff_name)
      if (aPlaceholder !== bPlaceholder) return aPlaceholder ? 1 : -1

      return (
        compareSbfpEncoderRows(a, b) ||
        (a.dropoff_name || '').localeCompare(b.dropoff_name || '', undefined, { numeric: true })
      )
    })
  }, [rows, filterSdo, sessionAddedIds])

  useEffect(() => {
    const targetId = pendingScrollRowIdRef.current
    if (!targetId) return
    if (!visible.some(r => r.id === targetId)) return
    pendingScrollRowIdRef.current = null

    requestAnimationFrame(() => {
      const scroller = tableScrollRef.current
      if (!scroller) return
      scroller.scrollTop = scroller.scrollHeight
      scroller.scrollLeft = 0
      const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(targetId) : targetId
      const rowEl = scroller.querySelector<HTMLElement>(`tr[data-row-id="${safeId}"]`)
      const targetRect = (rowEl || scroller).getBoundingClientRect()
      if (targetRect.bottom > window.innerHeight - 16) {
        window.scrollBy({
          top: targetRect.bottom - window.innerHeight + 32,
          behavior: 'smooth',
        })
      } else if (targetRect.top < 80) {
        window.scrollBy({
          top: targetRect.top - 100,
          behavior: 'smooth',
        })
      }
    })
  }, [visible])

  const syncRow = (row: DropoffRow) => {
    // Background sync — do not block the encoder
    void apiSyncDropoff(row).then(err => {
      if (err) setMsg(err)
    }).catch(error => setMsg(error instanceof Error ? `School saved; MFP sync failed: ${error.message}` : 'School saved; MFP sync failed.'))
  }

  const updateField = async (id: string, field: keyof DropoffRow, value: any) => {
    const prev = rows.find(r => r.id === id)
    if (!prev) return
    setMsg(null)
    if (isPlaceholderDropoffName(prev.dropoff_name)) {
      appendSessionAddedId(id)
    }

    let patch: Partial<DropoffRow> = { [field]: value }
    if (field === 'milk_packs') {
      const packs = Number(value)
      if (!Number.isSafeInteger(packs) || packs < 0 || packs > MAX_MILK_PACKS_PER_DROPOFF) {
        setMsg('Milk packs must be a whole number between 0 and 2,147,483,647.')
        return
      }
      patch = { milk_packs: packs }
    }
    if (field === 'sbfp_data_id') {
      const opt = sdoSelectOptions.find(o => o.id === value)
      const inferredDays =
        (opt?.feeding_days && opt.feeding_days > 0 ? opt.feeding_days : null) ||
        parseFeedingDaysFromText(opt?.sdo, opt?.remarks) ||
        0
      // Keep full procurement label (… - PM / SM) so rows stay tied to the correct milk type.
      patch = {
        sbfp_data_id: value || null,
        sdo: opt ? (composeSdoWithMilkType(opt.sdo, opt.milk_type) || opt.sdo) : '',
        region: opt?.region || prev.region,
      }
      if (!(Number(prev.feeding_days) > 0) && inferredDays > 0) {
        patch.feeding_days = inferredDays
      }
    }

    const next = { ...prev, ...patch }
    // Preserve fields saved by another in-flight operation on this same school.
    const previousFields = Object.fromEntries(
      (Object.keys(patch) as Array<keyof DropoffRow>).map(key => [key, prev[key]]),
    )
    setRows(p => p.map(r => r.id === id ? { ...r, ...patch } : r))

    const { error } = await supabase
      .from('sbfp_dropoff_points')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      setMsg(error.message)
      setRows(p => p.map(r => r.id === id ? { ...r, ...previousFields } : r))
      return
    }
    void logCenterActivity(supabase, {
      center: next.center,
      action: 'updated',
      source: 'sbfp_dropoff_points',
      sourceId: id,
      summary: `Updated drop-off · ${String(next.dropoff_name || 'school').trim() || 'school'}`,
      detail: `Field: ${field}${next.sdo ? ` · ${next.sdo}` : ''}`,
    })
    syncRow(next)
  }

  const updateFinancialField = async (id: string, field: DropoffMoneyField, value: string | number | null) => {
    const previous = rows.find(row => row.id === id)
    if (!previous || !editable || !financeReady || savingFinanceRef.current.has(id)) return
    const parsed = parseDropoffAmount(value)
    if (parsed.error) { setMsg(parsed.error); return }
    if (parsed.value == null && previous[field] != null) {
      setMsg('Enter 0 to remove an amount that was already encoded.')
      return
    }
    if (parsed.value === (previous[field] ?? null)) return
    setMsg(null)
    setFinanceNotice(null)
    savingFinanceRef.current.add(id)
    setSavingFinance(new Set(savingFinanceRef.current))
    setRows(current => current.map(row => row.id === id ? { ...row, [field]: parsed.value } : row))
    try {
      const response = await fetch('/api/sbfp/dropoff-finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field, value: parsed.value, expectedValue: previous[field] ?? null }),
      })
      const result: { error?: string; warning?: string | null; dropoff?: DropoffRow } = await response.json()
      if (!response.ok || !result.dropoff) throw new Error(result.error || 'Could not save school amounts.')
      // Merge only financial fields; an unrelated school edit may have finished meanwhile.
      setRows(current => current.map(row => row.id === id ? {
        ...row, contract_amount: result.dropoff?.contract_amount, service_fee: result.dropoff?.service_fee,
      } : row))
      setFinanceNotice(result.warning || null)
      void logCenterActivity(supabase, {
        center: previous.center, action: 'updated', source: 'sbfp_dropoff_points', sourceId: id,
        summary: `Updated school financial allocation · ${previous.dropoff_name}`, detail: `Field: ${field}`,
      })
    } catch (error) {
      setRows(current => current.map(row => row.id === id ? { ...row, [field]: previous[field] } : row))
      setMsg(error instanceof Error ? error.message : 'Could not save school amounts.')
    } finally {
      savingFinanceRef.current.delete(id)
      setSavingFinance(new Set(savingFinanceRef.current))
    }
  }

  const handleAdd = async () => {
    if (!editable || !sdoSelectOptions.length) {
      setMsg(sdoSelectOptions.length ? null : 'Add an SDO in procurement first, then add drop-off schools.')
      return
    }
    setAdding(true)
    const first =
      filterSdo !== 'ALL'
        ? sdoSelectOptions.find(o => o.id === filterSdo) || sdoSelectOptions[0]
        : sdoSelectOptions[0]
    const inferredDays =
      (first.feeding_days && first.feeding_days > 0 ? first.feeding_days : null) ||
      parseFeedingDaysFromText(first.sdo) ||
      0
    const sdoLabel =
      first.displayLabel ||
      composeSdoWithMilkType(first.sdo, first.milk_type) ||
      first.sdo
    const sdoKey = (sdoLabel || '').trim().toLowerCase()
    const dropoff_name = nextDefaultDropoffName(sdoLabel, rows, reservedDropoffNamesRef.current)
    const reserveKey = `${sdoKey}\u0000${dropoff_name}`
    reservedDropoffNamesRef.current.add(reserveKey)
    const payload = {
      year,
      center,
      sbfp_data_id: first.id,
      sdo: sdoLabel,
      dropoff_name,
      beneficiaries: 0,
      feeding_days: inferredDays,
      milk_packs: 0,
      district: '',
      municipality: '',
      province: '',
      region: first.region || '',
      include_in_masterlist: true,
    }
    const { data, error } = await supabase.from('sbfp_dropoff_points').insert(payload).select().maybeSingle()
    reservedDropoffNamesRef.current.delete(reserveKey)
    setAdding(false)
    if (error) {
      setMsg(error.message)
      return
    }
    if (data) {
      const added = data as DropoffRow
      pendingScrollRowIdRef.current = added.id
      appendSessionAddedId(added.id)
      setHighlightRow({ scope: scopeKey, id: added.id })
      setRows(p => [...p, added])
      syncRow(added)
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
      removeSessionAddedIds([id])
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
    removeSessionAddedIds(selected)
    setSelected(new Set())
  }

  // Sticky: first 3 columns (checkbox + SDO + Drop-off school).
  const stickyTh = (left: number, width: number, edge = false, wrap = false): CSSProperties => ({
    position: 'sticky', left, top: 0, zIndex: 20,
    width, minWidth: width, maxWidth: width,
    background: 'var(--navy)', color: '#fff',
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.18)' : undefined,
    ...(wrap
      ? { whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.25 }
      : {}),
  })
  const stickyTd = (left: number, width: number, bg: string, edge = false, wrap = false): CSSProperties => ({
    position: 'sticky', left, zIndex: 5,
    width, minWidth: width, maxWidth: width,
    background: bg,
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.12)' : undefined,
    ...(wrap
      ? {
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          lineHeight: 1.35,
          verticalAlign: 'top',
          overflow: 'visible',
          textOverflow: 'clip',
        }
      : {}),
  })
  const SL = { check: 0, sdo: 36, school: 216 } as const
  const SW = { check: 36, sdo: 180, school: 280 } as const

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
            <option value="ALL">All SDOs</option>
            {sdoSelectOptions.map(o => (
              <option key={o.id} value={o.id}>{o.displayLabel}</option>
            ))}
          </select>
          {msg && <span role="alert" className="text-xs text-red-600">{msg}</span>}
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

      {financeNotice && <p role="status" className="text-xs text-amber-800">{financeNotice}</p>}
      {financeReady && (
        <SbfpDropoffFinanceKpis parents={sdoOptions} schools={financeRows} selectedSdo={filterSdo}
          saving={savingFinance.size > 0} drafting={financeDraft != null} />
      )}
      <div className="card center-dropoff-card" style={{ overflow: 'hidden' }}>
        <p className="center-table-scroll-hint">Swipe horizontally to see all columns</p>
        <div ref={tableScrollRef} className="center-dropoff-scroll" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
          <table className="data-table center-dropoff-table" style={{ minWidth: 2050, fontSize: '0.78rem', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'center', ...stickyTh(SL.check, SW.check) }}>
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
                <th style={{ ...stickyTh(SL.sdo, SW.sdo) }}>SDO</th>
                <th style={{ ...stickyTh(SL.school, SW.school, true, true) }}>Drop-off Point (School)</th>
                <th style={{ minWidth: 110, textAlign: 'right' }}>Beneficiaries</th>
                <th style={{ minWidth: 100, textAlign: 'right' }} title="Encoder input">
                  Feeding Days
                </th>
                <th style={{ minWidth: 110, textAlign: 'right', background: '#1e3a5f' }} title="Encoder input; volume and formulations calculate from this value">
                  Milk Packs
                </th>
                <th style={{ minWidth: 150, textAlign: 'right' }}>Contract Amount (₱)</th>
                <th style={{ minWidth: 150, textAlign: 'right' }}>Shipping / Service Fee (₱)</th>
                <th style={{ minWidth: 150, textAlign: 'right' }}>Total Funds (₱)</th>
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
                  <td colSpan={editable ? 19 : 18} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>
                    No drop-off schools yet for {center}.
                  </td>
                </tr>
              )}
              {visible.map(r => {
                const bg = selected.has(r.id) ? '#e0e7ff' : r.id === highlightRowId ? '#fef9c3' : '#fff'
                const parentOpt = sdoSelectOptions.find(o => o.id === r.sbfp_data_id)
                const selectValue = parentOpt?.id || ''
                const milkType =
                  inferSbfpMilkType(parentOpt?.sdo, parentOpt?.remarks, r.sdo) ||
                  normalizeSbfpMilkType(parentOpt?.milk_type) ||
                  'PM'
                const calc = calcMilkFormulationsFromPacks(Number(r.milk_packs) || 0, milkType)
                const fmt4 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })
                const displaySdo =
                  (parentOpt
                    ? composeSdoWithMilkType(parentOpt.sdo, parentOpt.milk_type) || parentOpt.sdo
                    : composeSdoWithMilkType(r.sdo, milkType) || r.sdo) || '—'
                const volFactor = litersPerPackForMilkType(milkType)
                return (
                  <tr key={r.id} data-row-id={r.id} style={{ background: bg }}>
                    <td style={{ textAlign: 'center', ...stickyTd(SL.check, SW.check, bg) }}>
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
                    <td style={{ ...stickyTd(SL.sdo, SW.sdo, bg), whiteSpace: 'normal', verticalAlign: 'top' }}>
                      {editable ? (
                        <select
                          value={selectValue}
                          onChange={e => updateField(r.id, 'sbfp_data_id', e.target.value || null)}
                          style={{
                            width: '100%',
                            border: 0,
                            background: 'transparent',
                            fontSize: 'inherit',
                            whiteSpace: 'normal',
                          }}
                          title={
                            selectValue
                              ? displaySdo
                              : r.sdo
                                ? `Stored as “${r.sdo}” but not linked — pick an SDO`
                                : 'Select SDO'
                          }
                        >
                          <option value="">
                            {selectValue ? '—' : (displaySdo !== '—' ? `${displaySdo} (not linked)` : '—')}
                          </option>
                          {sdoSelectOptions.map(o => (
                            <option key={o.id} value={o.id}>{o.displayLabel}</option>
                          ))}
                        </select>
                      ) : displaySdo}
                    </td>
                    <EditableText
                      value={r.dropoff_name}
                      disabled={!editable}
                      wrap
                      onCommit={v => updateField(r.id, 'dropoff_name', String(v || '').trim() || r.dropoff_name)}
                      cellStyle={stickyTd(SL.school, SW.school, bg, true, true)}
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
                      title="Type feeding days (saves to the masterlist)"
                      cellStyle={{ background: 'rgba(16,185,129,0.06)' }}
                      onCommit={v => updateField(r.id, 'feeding_days', Number(v) > 0 ? Number(v) : 0)}
                    />
                    <EditableText
                      value={r.milk_packs ?? 0}
                      type="number"
                      min={0}
                      max={MAX_MILK_PACKS_PER_DROPOFF}
                      step={1}
                      align="right"
                      disabled={!editable}
                      title="Enter the milk-pack count; volume and formulations update from this number"
                      cellStyle={{ background: 'rgba(59,130,246,0.06)', fontWeight: 600 }}
                      onCommit={v => updateField(r.id, 'milk_packs', v == null ? 0 : Number(v))}
                    />
                    {(['contract_amount', 'service_fee'] as const).map(field => (
                      <EditableText key={field} value={r[field]} type="number" currency align="right"
                        min={0} max={MAX_DROPOFF_AMOUNT} step={0.01}
                        disabled={!editable || !financeReady || savingFinance.has(r.id)}
                        title={field === 'contract_amount' ? 'School milk-only contract allocation; shipping is separate' : 'School shipping/service fee; enter 0 when there is no fee'}
                        cellStyle={{ background: 'rgba(16,185,129,0.06)' }}
                        onDraft={value => setFinanceDraft(value == null ? null : { id: r.id, field, value })}
                        onCommit={value => updateFinancialField(r.id, field, value)} />
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }} title="Milk cost + shipping; both amounts must be encoded">
                      {r.contract_amount == null || r.service_fee == null ? '—' :
                        ((Math.round(r.contract_amount * 100) + Math.round(r.service_fee * 100)) / 100)
                          .toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
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
