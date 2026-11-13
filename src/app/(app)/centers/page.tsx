import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PCC_CENTERS } from '@/lib/types'
import { loadCenterActivitySummaries } from '@/lib/center-activity'
import Link from 'next/link'
import { Building2, Calendar, CheckCircle2, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default async function CentersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  if (profile?.role === 'encoder') {
    redirect('/dashboard')
  }

  const centerStats = await loadCenterActivitySummaries(supabase, PCC_CENTERS)

  // Activity uses the same create/edit/log sources as each center's timeline.
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">PCC Centers</h1>
          <p className="page-subtitle">Click a center to view its create/edit activity log</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {PCC_CENTERS.map(center => {
          const lastInputDate = centerStats[center]?.at
          const incomplete = centerStats[center]?.hasReadErrors
          const isActive = lastInputDate ? new Date(lastInputDate) > thirtyDaysAgo : false
          const activityStatus = incomplete ? lastInputDate ? 'Activity incomplete' : 'Activity unavailable'
            : isActive ? 'Active recently' : 'Inactive'

          return (
            <Link
              key={center}
              href={`/centers/${encodeURIComponent(center)}`}
              className="card"
              style={{ display: 'block', textDecoration: 'none', transition: 'all 0.2s', border: '1px solid #e2e8f0', padding: '1.25rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy)' }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>{center}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.75rem', color: incomplete ? '#92400e' : isActive ? '#16a34a' : '#64748b' }}>
                    {isActive && !incomplete ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {activityStatus}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.375rem', fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={14} style={{ color: '#94a3b8' }} />
                <span>{incomplete ? 'Last known activity: ' : 'Last activity: '}</span>
                <strong style={{ color: '#1e293b' }}>
                  {lastInputDate ? formatDistanceToNow(new Date(lastInputDate), { addSuffix: true }) : incomplete ? 'Unavailable' : 'No activity found'}
                </strong>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
