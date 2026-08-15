import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Calendar, ChevronLeft, List, FileSpreadsheet } from 'lucide-react'
import { format } from 'date-fns'

export default async function CenterDetailPage({ params }: { params: Promise<{ center: string }> }) {
  const { center } = await params
  const decodedCenter = decodeURIComponent(center)
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user?.id).single()

  if (profile?.role === 'encoder' && profile?.center !== decodedCenter) {
    // Prevent encoders from viewing other centers' masterlists
    redirect('/dashboard')
  }

  // Fetch all record timestamps for this center
  const { data: records } = await supabase
    .from('mfp_data')
    .select('id, created_at, year')
    .eq('center', decodedCenter)
    .order('created_at', { ascending: false })

  if (!records) return <div>Failed to load center data</div>

  // Group by "Month YYYY" (e.g. "August 2026") based on created_at
  const monthlyGroups: Record<string, { count: number, monthStr: string, yearStr: string }> = {}
  // Also group by Data "Year" (the year column in the data)
  const yearlyGroups: Record<number, number> = {}

  records.forEach(r => {
    const d = new Date(r.created_at)
    const monthKey = format(d, 'yyyy-MM')
    
    if (!monthlyGroups[monthKey]) {
      monthlyGroups[monthKey] = {
        count: 0,
        monthStr: format(d, 'MM'),
        yearStr: format(d, 'yyyy')
      }
    }
    monthlyGroups[monthKey].count++

    if (r.year) {
      if (!yearlyGroups[r.year]) yearlyGroups[r.year] = 0
      yearlyGroups[r.year]++
    }
  })

  // Sort months descending
  const sortedMonths = Object.keys(monthlyGroups).sort((a, b) => b.localeCompare(a))
  const sortedYears = Object.keys(yearlyGroups).map(Number).sort((a, b) => b - a)

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/centers" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#64748b', textDecoration: 'none', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            <ChevronLeft size={14} /> Back to Centers
          </Link>
          <h1 className="page-title">{decodedCenter}</h1>
          <p className="page-subtitle">{records.length} total records across all time</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Monthly Masterlists */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} style={{ color: 'var(--gold)' }} />
            Monthly Masterlists (Based on Input Date)
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
            Consolidates all separate inputs made during a specific month into a single masterlist.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sortedMonths.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                No input history found for this center.
              </div>
            ) : (
              sortedMonths.map(key => {
                const group = monthlyGroups[key]
                const d = new Date(Number(group.yearStr), Number(group.monthStr) - 1)
                
                return (
                  <Link 
                    key={key}
                    href={`/centers/${encodeURIComponent(decodedCenter)}/masterlist?month=${group.monthStr}&year=${group.yearStr}`}
                    style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
                      textDecoration: 'none', color: '#1e293b', transition: 'border-color 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <List size={16} style={{ color: '#94a3b8' }} />
                      <span style={{ fontWeight: 600 }}>{format(d, 'MMMM yyyy')}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#e2e8f0', padding: '0.2rem 0.6rem', borderRadius: 9999 }}>
                      {group.count} records
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>

        {/* Yearly Masterlists */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={18} style={{ color: 'var(--gold)' }} />
            Yearly Masterlists (Based on Data Year)
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
            Consolidates all records marked for a specific feeding year.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sortedYears.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                No yearly records found.
              </div>
            ) : (
              sortedYears.map(year => (
                <Link 
                  key={year}
                  href={`/centers/${encodeURIComponent(decodedCenter)}/masterlist?data_year=${year}`}
                  style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
                    textDecoration: 'none', color: '#1e293b', transition: 'border-color 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <List size={16} style={{ color: '#94a3b8' }} />
                    <span style={{ fontWeight: 600 }}>FY {year}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#e2e8f0', padding: '0.2rem 0.6rem', borderRadius: 9999 }}>
                    {yearlyGroups[year]} records
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
