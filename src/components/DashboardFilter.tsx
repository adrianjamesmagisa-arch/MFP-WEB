'use client'

import { useCallback, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { APP_YEAR_STRINGS, defaultReportYearString } from '@/lib/app-years'
import { normalizeSchoolYearParam } from '@/lib/report-year'
import { parseSchoolYear } from '@/lib/sbfp-year'
import { useAsyncFeedback } from '@/components/loading/AsyncFeedback'

const MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

export function DashboardFilter({
  centers = [],
  isEncoder = false,
  basePath,
  /** When set, year dropdown uses SBFP school years (e.g. SY 2026-2027) instead of calendar years. */
  schoolYears,
}: {
  centers?: string[]
  isEncoder?: boolean
  /** Stay on this path when filters change (defaults to current pathname). */
  basePath?: string
  schoolYears?: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const path = basePath || pathname || '/dashboard'
  const [isPending, startTransition] = useTransition()
  const { beginTask, endTask } = useAsyncFeedback()

  const useSchoolYears = Boolean(schoolYears && schoolYears.length > 0)
  const defaultYear = useSchoolYears
    ? parseSchoolYear(null, schoolYears)
    : defaultReportYearString()
  const yearFromUrl = searchParams.get('year')
  const currentYear =
    yearFromUrl === null || yearFromUrl === ''
      ? defaultYear
      : useSchoolYears
        ? normalizeSchoolYearParam(yearFromUrl, schoolYears!)
        : yearFromUrl
  const currentMonth = searchParams.get('month') || ''
  const currentCenter = searchParams.get('center') || ''

  const years = useSchoolYears ? schoolYears! : APP_YEAR_STRINGS

  useEffect(() => {
    if (isPending) beginTask('dashboard-filter', 'Loading dashboard…', { blocking: true })
    else endTask('dashboard-filter')
    return () => endTask('dashboard-filter')
  }, [isPending, beginTask, endTask])

  const updateFilters = useCallback((year: string, month: string, center: string) => {
    const params = new URLSearchParams(searchParams.toString())

    if (year === '__ALL_YEARS__') params.set('year', '__ALL_YEARS__')
    else if (year) params.set('year', year)
    else params.set('year', defaultYear)

    if (month) params.set('month', month)
    else params.delete('month')

    if (center) params.set('center', center)
    else params.delete('center')

    startTransition(() => {
      router.push(`${path}?${params.toString()}`)
    })
  }, [router, searchParams, path, defaultYear])

  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      {!isEncoder && (
        <select
          className="form-input"
          style={{ width: '200px', padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
          value={currentCenter}
          disabled={isPending}
          onChange={(e) => updateFilters(currentYear, currentMonth, e.target.value)}
        >
          <option value="">All Centers</option>
          {centers.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      <select
        className="form-input"
        style={{ width: useSchoolYears ? '190px' : '150px', padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
        value={currentYear}
        disabled={isPending}
        onChange={(e) => updateFilters(e.target.value, currentMonth, currentCenter)}
      >
        <option value="__ALL_YEARS__">{useSchoolYears ? 'All School Years' : 'All Years'}</option>
        {years.map(y => (
          <option key={y} value={y}>{useSchoolYears ? `SY ${y}` : y}</option>
        ))}
      </select>

      <select
        className="form-input"
        style={{ width: '150px', padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
        value={currentMonth}
        disabled={isPending}
        onChange={(e) => updateFilters(currentYear, e.target.value, currentCenter)}
      >
        <option value="">All Months</option>
        {MONTHS.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    </div>
  )
}
