import { Suspense } from 'react'
import { SbfpSubSidebar } from '@/components/SbfpSubSidebar'
import { loadSchoolYears } from '@/lib/sbfp-school-years'

export default async function SbfpLayout({ children }: { children: React.ReactNode }) {
  const schoolYears = await loadSchoolYears()

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <Suspense fallback={<aside style={{ width: 200, flexShrink: 0 }} />}>
        <SbfpSubSidebar schoolYears={schoolYears} />
      </Suspense>
      <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {children}
      </main>
    </div>
  )
}
