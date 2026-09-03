'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'

type ActivityRow = {
  id: string
  year: number
  activity: string
  status: string
  remarks: string | null
  sort_order: number | null
}

const STATUS_OPTS = ['Not Started', 'Ongoing', 'Done', 'Completed', 'Deferred']

export function SbfpActivitiesChecklist({
  year,
  initialRows,
  canEdit,
}: {
  year: number
  initialRows: ActivityRow[]
  canEdit: boolean
}) {
  const supabase = createClient()
  const [rows, setRows] = useState(initialRows)
  const [busy, setBusy] = useState(false)

  const addRow = async () => {
    if (!canEdit) return
    setBusy(true)
    const sort_order = (rows[rows.length - 1]?.sort_order || rows.length) + 1
    const { data, error } = await supabase
      .from('sbfp_activities')
      .insert({
        year,
        activity: 'New activity',
        status: 'Not Started',
        remarks: null,
        sort_order,
      })
      .select()
      .maybeSingle()
    setBusy(false)
    if (!error && data) setRows(p => [...p, data as ActivityRow])
    else if (error) alert(error.message)
  }

  const saveField = async (id: string, field: string, value: string) => {
    if (!canEdit) return
    const { error } = await supabase.from('sbfp_activities').update({ [field]: value }).eq('id', id)
    if (!error) setRows(p => p.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const remove = async (id: string) => {
    if (!canEdit || !confirm('Delete this activity?')) return
    const { error } = await supabase.from('sbfp_activities').delete().eq('id', id)
    if (!error) setRows(p => p.filter(r => r.id !== id))
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b">
        <div>
          <h2 className="text-base font-semibold">Admin checklist</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            National milestones for this school year{canEdit ? '' : ' (read-only)'}.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={addRow}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Plus size={14} /> Add activity
          </button>
        )}
      </div>

      <div style={{ overflow: 'auto' }}>
        <table className="data-table" style={{ minWidth: 700, fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>#</th>
              <th>A — Activity</th>
              <th style={{ minWidth: 140 }}>B — Status</th>
              <th style={{ minWidth: 160 }}>C — Remarks / Dates</th>
              {canEdit && <th style={{ width: 60 }}> </th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 5 : 4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>
                  No checklist items for this school year yet.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: 'var(--gray-400)' }}>{idx + 1}</td>
                <td>
                  {canEdit ? (
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      defaultValue={r.activity}
                      onBlur={e => {
                        if (e.target.value !== r.activity) saveField(r.id, 'activity', e.target.value)
                      }}
                    />
                  ) : r.activity}
                </td>
                <td>
                  {canEdit ? (
                    <select
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={r.status || 'Not Started'}
                      onChange={e => saveField(r.id, 'status', e.target.value)}
                    >
                      {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                      {(r.status || 'Not Started').toUpperCase()}
                    </span>
                  )}
                </td>
                <td>
                  {canEdit ? (
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      defaultValue={r.remarks || ''}
                      onBlur={e => {
                        if (e.target.value !== (r.remarks || '')) saveField(r.id, 'remarks', e.target.value)
                      }}
                    />
                  ) : (r.remarks || '—')}
                </td>
                {canEdit && (
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" onClick={() => remove(r.id)} className="text-red-500 p-1">
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
