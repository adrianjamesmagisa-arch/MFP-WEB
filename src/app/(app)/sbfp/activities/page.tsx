import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SbfpActivitiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('sbfp_activities')
    .select('*')
    .order('sort_order', { ascending: true })

  const fmtDate = (d: string) => {
    if (!d) return ''
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return d
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Status of Activities</h1>
          <p className="page-subtitle">Overall milestones and timelines for SBFP FY 2026</p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
          <table className="data-table" style={{ minWidth: 700, fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 40, width: 40, textAlign: 'center' }}>#</th>
                <th style={{ minWidth: 350, whiteSpace: 'normal', lineHeight: 1.2 }}>A — Activity</th>
                <th style={{ minWidth: 130, whiteSpace: 'normal', lineHeight: 1.2 }}>B — Status</th>
                <th style={{ minWidth: 150, whiteSpace: 'normal', lineHeight: 1.2 }}>C — Remarks / Dates</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r, idx) => {
                const s = r.status || ''
                const isDone = s.toLowerCase() === 'done' || s.toLowerCase() === 'completed'
                const isOngoing = s.toLowerCase().includes('ongoing')
                let badgeClass = 'bg-slate-100 text-slate-700'
                if (isDone) badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                if (isOngoing) badgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'

                // Simple date regex test to format remarks if it's a date
                const isDateStr = /^\d{4}-\d{2}-\d{2}$/.test(r.remarks || '')
                const displayRemarks = isDateStr ? fmtDate(r.remarks) : r.remarks

                return (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center', color: 'var(--gray-400)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 500 }}>{r.activity}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${badgeClass}`}>
                        {(r.status || 'Not Started').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ color: isDateStr ? '#2563eb' : 'inherit', fontWeight: isDateStr ? 600 : 400 }}>
                      {displayRemarks || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(!rows || rows.length === 0) && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)', background: 'white', borderRadius: 12, border: '1px solid var(--gray-200)', marginTop: '-1rem' }}>
          No activities found. Run the seed script to populate from the Excel file.
        </div>
      )}
    </div>
  )
}
