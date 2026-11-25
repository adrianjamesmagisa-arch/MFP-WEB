'use client'

import { useMemo, useState } from 'react'
import { X, History, Trash2, Sparkles, Pencil } from 'lucide-react'
import { dbYearToSchoolYear } from '@/lib/sbfp-year'
import {
  emptyStatusBreakdown,
  NATIONAL_SNAPSHOT_CENTER,
  summarizeSnapshotsForModal,
  sumBreakdownTotal,
  type SbfpStatusBreakdown,
  type SbfpStatusSnapshotRow,
  type SnapshotDateSummary,
} from '@/lib/sbfp-status-snapshots'

type FormCounts = Omit<SbfpStatusBreakdown, 'sdoCount'>

function emptyFormCounts(): FormCounts {
  return {
    forPreparation: 0,
    ongoingProcurement: 0,
    ongoingForAward: 0,
    forDelivery: 0,
    ongoingDelivery: 0,
    completed: 0,
    failed: 0,
  }
}

function breakdownToFormCounts(b: SbfpStatusBreakdown): FormCounts {
  return {
    forPreparation: b.forPreparation,
    ongoingProcurement: b.ongoingProcurement,
    ongoingForAward: b.ongoingForAward,
    forDelivery: b.forDelivery,
    ongoingDelivery: b.ongoingDelivery,
    completed: b.completed,
    failed: b.failed,
  }
}

type ModalProps = {
  open: boolean
  onClose: () => void
  year: number
  defaultDate: string
  centerOptions: string[]
  snapshots: SbfpStatusSnapshotRow[]
  tableMissing?: boolean
  liveBreakdown?: SbfpStatusBreakdown
  onSaved: () => Promise<void> | void
}

function SbfpStatusSnapshotModalBody({
  onClose,
  year,
  defaultDate,
  centerOptions,
  snapshots,
  tableMissing = false,
  liveBreakdown,
  onSaved,
}: Omit<ModalProps, 'open'>) {
  const [snapshotDate, setSnapshotDate] = useState(defaultDate)
  const [center, setCenter] = useState(NATIONAL_SNAPSHOT_CENTER)
  const [counts, setCounts] = useState<FormCounts>(() =>
    liveBreakdown ? breakdownToFormCounts(liveBreakdown) : emptyFormCounts(),
  )
  const [saving, setSaving] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const summaries = useMemo(
    () => summarizeSnapshotsForModal(snapshots, year),
    [snapshots, year],
  )

  const totalSdos = sumBreakdownTotal(counts)
  const dashboardOngoingProc = counts.ongoingProcurement + counts.ongoingForAward

  const updateCount = (key: keyof FormCounts, raw: string) => {
    const parsed = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0))
    setCounts(prev => ({ ...prev, [key]: parsed }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setErrorMsg(null)
    setStatusMsg(null)
    try {
      const res = await fetch('/api/sbfp/status-snapshots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotDate,
          year,
          center,
          ...counts,
        }),
      })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to save snapshot')
      }
      setStatusMsg(`Saved backfill snapshot for ${snapshotDate}.`)
      await onSaved()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save snapshot')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: SnapshotDateSummary) => {
    const scopeLabel =
      row.center === NATIONAL_SNAPSHOT_CENTER
        ? 'National override'
        : row.center === 'ALL_CENTERS_SUM'
          ? 'all captured centers on this date'
          : row.center
    if (!confirm(`Delete snapshot for ${row.snapshotDate} (${scopeLabel})?`)) return
    const key = `${row.snapshotDate}|${row.center}`
    setDeletingKey(key)
    setErrorMsg(null)
    setStatusMsg(null)
    try {
      const params = new URLSearchParams({
        year: String(year),
        date: row.snapshotDate,
      })
      if (row.center !== 'ALL_CENTERS_SUM') {
        params.set('center', row.center)
      }
      const res = await fetch(`/api/sbfp/status-snapshots?${params.toString()}`, {
        method: 'DELETE',
      })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to delete snapshot')
      }
      setStatusMsg(`Deleted snapshot for ${row.snapshotDate}.`)
      await onSaved()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete snapshot')
    } finally {
      setDeletingKey(null)
    }
  }

  const loadSummaryIntoForm = (row: SnapshotDateSummary) => {
    setSnapshotDate(row.snapshotDate)
    setCenter(row.center === 'ALL_CENTERS_SUM' ? NATIONAL_SNAPSHOT_CENTER : row.center)
    setCounts(breakdownToFormCounts(row.breakdown))
    setErrorMsg(null)
    setStatusMsg(`Loaded ${row.snapshotDate} into form for editing.`)
  }

  const fieldDefs: Array<{ key: keyof FormCounts; label: string; color: string }> = [
    { key: 'completed', label: 'Completed', color: '#065f46' },
    { key: 'ongoingDelivery', label: 'Awarded (Ongoing Delivery)', color: '#3730a3' },
    { key: 'forDelivery', label: 'Awarded (For Delivery)', color: '#5b21b6' },
    { key: 'ongoingProcurement', label: 'Ongoing Procurement', color: '#1e40af' },
    { key: 'ongoingForAward', label: 'Ongoing (For Award)', color: '#1e3a8a' },
    { key: 'forPreparation', label: 'For Preparation', color: '#92400e' },
    { key: 'failed', label: 'Failed', color: '#991b1b' },
  ]

  const liveSource = liveBreakdown ?? emptyStatusBreakdown()

  return (
    <div
      className="no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sbfp-snapshot-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.28)',
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.9rem 1.25rem',
            background: '#033773',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} />
            <div>
              <h2 id="sbfp-snapshot-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Backfill Daily Status Snapshots — SY {dbYearToSchoolYear(year)}
              </h2>
              <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                Super Admin historical SDO status counts used by SBFP Milk Component Dashboard & Tab 2
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close backfill modal"
            style={{
              background: 'rgba(255,255,255,0.14)',
              border: 'none',
              color: '#ffffff',
              width: 30,
              height: 30,
              borderRadius: 6,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tableMissing && (
            <div
              role="alert"
              style={{
                padding: '0.7rem 0.9rem',
                borderRadius: 8,
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                color: '#92400e',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              Table <code>public.sbfp_status_daily_snapshots</code> is not created yet in Supabase SQL Editor. Run the snapshot migration SQL first before saving snapshots.
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', fontWeight: 700, color: '#1e293b' }}>
                Snapshot Date
                <input
                  type="date"
                  value={snapshotDate}
                  onChange={e => setSnapshotDate(e.target.value)}
                  required
                  style={{
                    padding: '0.42rem 0.6rem',
                    borderRadius: 7,
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#0f172a',
                  }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', minWidth: 220 }}>
                Scope
                <select
                  value={center}
                  onChange={e => setCenter(e.target.value)}
                  style={{
                    padding: '0.44rem 0.6rem',
                    borderRadius: 7,
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    background: '#ffffff',
                  }}
                >
                  <option value={NATIONAL_SNAPSHOT_CENTER}>All Centers (National)</option>
                  {centerOptions.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              {liveBreakdown && (
                <button
                  type="button"
                  onClick={() => setCounts(breakdownToFormCounts(liveSource))}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '0.45rem 0.75rem',
                    borderRadius: 7,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#033773',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  <Sparkles size={14} /> Fill from Current Live Counts
                </button>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
                gap: '0.6rem',
              }}
            >
              {fieldDefs.map(f => (
                <label
                  key={f.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '0.5rem 0.65rem',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: f.color }}>{f.label}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={counts[f.key]}
                    onChange={e => updateCount(f.key, e.target.value)}
                    style={{
                      padding: '0.35rem 0.5rem',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: '#0f172a',
                      background: '#ffffff',
                    }}
                  />
                </label>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
                padding: '0.6rem 0.85rem',
                borderRadius: 8,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
              }}
            >
              <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem', color: '#1e3a8a' }}>
                <span>
                  Total SDOs (Tab 2): <strong>{totalSdos}</strong>
                </span>
                <span>
                  Dashboard &ldquo;Ongoing Procurement&rdquo;: <strong>{dashboardOngoingProc}</strong>
                </span>
              </div>
              <button
                type="submit"
                disabled={saving || tableMissing}
                style={{
                  padding: '0.48rem 1rem',
                  borderRadius: 7,
                  border: 'none',
                  background: saving || tableMissing ? '#94a3b8' : '#033773',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.83rem',
                  cursor: saving || tableMissing ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save Backfill Snapshot'}
              </button>
            </div>

            {errorMsg && (
              <div role="alert" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#b91c1c' }}>
                {errorMsg}
              </div>
            )}
            {statusMsg && (
              <div role="status" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#047857' }}>
                {statusMsg}
              </div>
            )}
          </form>

          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
              Saved Snapshots ({summaries.length})
            </h3>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflowX: 'auto', maxHeight: 240, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#1e293b', textAlign: 'left' }}>
                    <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                    <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>Scope</th>
                    <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>Source</th>
                    <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>C / OD / FD / OP+OA / FP / F</th>
                    <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '0.85rem', textAlign: 'center', color: '#64748b' }}>
                        No saved snapshots yet for SY {dbYearToSchoolYear(year)}.
                      </td>
                    </tr>
                  ) : (
                    summaries.map(row => {
                      const b = row.breakdown
                      const opTotal = b.ongoingProcurement + b.ongoingForAward
                      const rowKey = `${row.snapshotDate}|${row.center}`
                      const scopeText =
                        row.center === NATIONAL_SNAPSHOT_CENTER
                          ? 'National override'
                          : row.center === 'ALL_CENTERS_SUM'
                            ? 'All centers (auto sum)'
                            : row.center
                      return (
                        <tr key={rowKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.42rem 0.6rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{row.snapshotDate}</td>
                          <td style={{ padding: '0.42rem 0.6rem' }}>{scopeText}</td>
                          <td style={{ padding: '0.42rem 0.6rem' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.12rem 0.45rem',
                                borderRadius: 999,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: row.source === 'backfill' ? '#ede9fe' : '#dcfce7',
                                color: row.source === 'backfill' ? '#5b21b6' : '#166534',
                              }}
                            >
                              {row.source === 'backfill' ? 'Backfill' : 'Auto'}
                            </span>
                          </td>
                          <td style={{ padding: '0.42rem 0.6rem', textAlign: 'right', fontWeight: 700 }}>{b.sdoCount}</td>
                          <td style={{ padding: '0.42rem 0.6rem', fontVariantNumeric: 'tabular-nums' }}>
                            {b.completed} / {b.ongoingDelivery} / {b.forDelivery} / {opTotal} ({b.ongoingProcurement}+{b.ongoingForAward}) / {b.forPreparation} / {b.failed}
                          </td>
                          <td style={{ padding: '0.42rem 0.6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => loadSummaryIntoForm(row)}
                              title="Edit in form"
                              style={{
                                background: 'transparent',
                                border: '1px solid #cbd5e1',
                                borderRadius: 5,
                                padding: '0.18rem 0.4rem',
                                cursor: 'pointer',
                                marginRight: 4,
                                color: '#033773',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                              }}
                            >
                              <Pencil size={11} /> Edit
                            </button>
                            <button
                              type="button"
                              disabled={deletingKey === rowKey}
                              onClick={() => handleDelete(row)}
                              title="Delete snapshot"
                              style={{
                                background: 'transparent',
                                border: '1px solid #fecaca',
                                borderRadius: 5,
                                padding: '0.18rem 0.4rem',
                                cursor: deletingKey === rowKey ? 'wait' : 'pointer',
                                color: '#b91c1c',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                              }}
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SbfpStatusSnapshotModal(props: ModalProps) {
  if (!props.open) return null
  return <SbfpStatusSnapshotModalBody {...props} />
}
