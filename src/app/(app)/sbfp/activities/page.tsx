'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'Done':                  { label: 'Done',               color: '#16a34a', bg: '#dcfce7' },
  'Ongoing Procurement':   { label: 'Ongoing Procurement', color: '#d97706', bg: '#fef3c7' },
  'Ongoing':               { label: 'Ongoing',            color: '#2563eb', bg: '#dbeafe' },
  'For Follow-up':         { label: 'For Follow-up',      color: '#dc2626', bg: '#fee2e2' },
  'Documents prepared':    { label: 'Docs Prepared',      color: '#7c3aed', bg: '#ede9fe' },
  'Not Started':           { label: 'Not Started',        color: '#64748b', bg: '#f1f5f9' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#64748b', bg: '#f1f5f9' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: 12, fontSize: '0.72rem', fontWeight: 600,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap'
    }}>
      {cfg.label}
    </span>
  )
}

export default function SbfpActivitiesPage() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('sbfp_activities').select('*').order('sort_order').order('created_at')
      .then(({ data }) => { setRows(data || []); setLoading(false) })
  }, [])

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Status of Activities</h1>
      <p className="text-muted-foreground text-sm mb-6">Program milestones and procurement activities for SBFP FY 2026</p>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.values(STATUS_CONFIG).map(cfg => (
          <span key={cfg.label} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px',
            borderRadius: 12, fontSize: '0.7rem', fontWeight: 600,
            color: cfg.color, background: cfg.bg
          }}>
            {cfg.label}
          </span>
        ))}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-10 px-4 text-left font-semibold" style={{ width: '55%' }}>ACTIVITIES</th>
              <th className="h-10 px-4 text-center font-semibold" style={{ width: '15%' }}>STATUS</th>
              <th className="h-10 px-4 text-left font-semibold">REMARKS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="px-4 py-2">{r.activity}</td>
                <td className="px-4 py-2 text-center"><StatusBadge status={r.status || 'Not Started'} /></td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{r.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border rounded-md mt-4">
          No activities data yet. Run the seed script to populate from the Excel file.
        </div>
      )}
    </div>
  )
}
