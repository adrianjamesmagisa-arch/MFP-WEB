import { createClient } from '@/lib/supabase/server'
import { PCC_CENTERS } from '@/lib/types'
import Link from 'next/link'
import { Building2, Calendar, CheckCircle2, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default async function CentersPage() {
  const supabase = await createClient()

  // Get the latest input date for each center to determine active status
  const { data: latestInputs } = await supabase
    .from('mfp_data')
    .select('center, created_at')
    .order('created_at', { ascending: false })
  
  // Aggregate to find the most recent created_at per center
  const centerStats = PCC_CENTERS.reduce((acc, center) => {
    acc[center] = { lastInput: null }
    return acc
  }, {} as Record<string, { lastInput: string | null }>)

  if (latestInputs) {
    latestInputs.forEach(row => {
      // Ignore initial seeded data (which has exactly 12:00:00 UTC timestamp on the 15th)
      const isSeededData = row.created_at.includes('T12:00:00+00:00')
      
      if (!isSeededData && !centerStats[row.center]?.lastInput) {
        centerStats[row.center] = { lastInput: row.created_at }
      }
    })
  }

  // A center is considered "active" if they inputted something in the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">PCC Centers</h1>
          <p className="page-subtitle">Monitor center input activity and monthly masterlists</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {PCC_CENTERS.map(center => {
          const lastInputDate = centerStats[center]?.lastInput
          const isActive = lastInputDate ? new Date(lastInputDate) > thirtyDaysAgo : false

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.75rem', color: isActive ? '#16a34a' : '#64748b' }}>
                    {isActive ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {isActive ? 'Active recently' : 'Inactive'}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.375rem', fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={14} style={{ color: '#94a3b8' }} />
                <span>Last input: </span>
                <strong style={{ color: '#1e293b' }}>
                  {lastInputDate ? formatDistanceToNow(new Date(lastInputDate), { addSuffix: true }) : 'Never'}
                </strong>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
