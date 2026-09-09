'use client'

import { useEffect, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { APP_YEAR_STRINGS } from '@/lib/app-years'
import { PROGRAM_MONTHS } from '@/lib/monitoring-programs'
import { PCC_CENTERS } from '@/lib/types'
import { useAsyncFeedback } from '@/components/loading/AsyncFeedback'

export function ProgramOverallFilter({
  hideCenter = false,
}: {
  hideCenter?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const { beginTask, endTask } = useAsyncFeedback()

  const year = searchParams.get('year') || ''
  const month = searchParams.get('month') || ''
  const center = searchParams.get('center') || ''

  useEffect(() => {
    if (isPending) beginTask('program-dash-filter', 'Loading dashboard…', { blocking: true })
    else endTask('program-dash-filter')
    return () => endTask('program-dash-filter')
  }, [isPending, beginTask, endTask])

  function apply(nextYear: string, nextMonth: string, nextCenter: string) {
    const params = new URLSearchParams()
    if (nextYear) params.set('year', nextYear)
    if (nextMonth) params.set('month', nextMonth)
    if (nextCenter) params.set('center', nextCenter)
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  const selectStyle = {
    minWidth: 150,
    padding: '0.55rem 0.75rem',
    fontSize: '0.95rem',
    fontWeight: 600,
  } as const

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.85rem',
        alignItems: 'flex-end',
        padding: '1rem 1.15rem',
        marginBottom: '1.25rem',
      }}
    >
      {!hideCenter && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', fontWeight: 700, color: 'var(--gray-600)' }}>
          Center
          <select className="form-input" style={selectStyle} value={center} onChange={e => apply(year, month, e.target.value)}>
            <option value="">All centers</option>
            {PCC_CENTERS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', fontWeight: 700, color: 'var(--gray-600)' }}>
        Year
        <select className="form-input" style={selectStyle} value={year} onChange={e => apply(e.target.value, month, center)}>
          <option value="">All years</option>
          {APP_YEAR_STRINGS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', fontWeight: 700, color: 'var(--gray-600)' }}>
        Month
        <select className="form-input" style={selectStyle} value={month} onChange={e => apply(year, e.target.value, center)}>
          <option value="">All months</option>
          {PROGRAM_MONTHS.map(m => (
            <option key={m.value} value={String(m.value)}>{m.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
