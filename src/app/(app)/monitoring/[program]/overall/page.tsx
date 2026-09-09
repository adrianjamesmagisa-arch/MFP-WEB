import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MONITORING_PROGRAMS, parseMonitoringProgram, monitoringCenterPath, rowMatchesMonitoringProgram } from '@/lib/monitoring-programs'
import { PCC_CENTERS } from '@/lib/types'
import { monitoringEncoderHomePath } from '@/lib/center-aliases'

export default async function MonitoringOverallPage({
  params,
}: {
  params: Promise<{ program: string }>
}) {
  const { program: programParam } = await params
  const programId = parseMonitoringProgram(programParam)
  if (!programId) notFound()
  const program = MONITORING_PROGRAMS[programId]

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()
  if (profile?.role === 'encoder') {
    redirect(monitoringEncoderHomePath(programId, profile.center))
  }

  const { data: rows } = await supabase
    .from('mfp_data')
    .select('center,funded_by')
    .limit(10000)

  const counts = new Map<string, number>()
  for (const c of PCC_CENTERS) counts.set(c, 0)
  for (const r of rows || []) {
    if (!rowMatchesMonitoringProgram(r.funded_by, programId)) continue
    const center = String(r.center || '').trim()
    if (counts.has(center)) counts.set(center, (counts.get(center) || 0) + 1)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: program.accent }}>
            {program.label}
          </h1>
          <p className="page-subtitle">{program.subtitle} — pick a center</p>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {PCC_CENTERS.map(center => (
          <Link
            key={center}
            href={monitoringCenterPath(programId, center)}
            className="card"
            style={{
              padding: '1.25rem',
              textDecoration: 'none',
              color: 'inherit',
              borderLeft: `4px solid ${program.accent}`,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--navy)' }}>{center}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: 6 }}>
              {counts.get(center) || 0} record(s)
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
