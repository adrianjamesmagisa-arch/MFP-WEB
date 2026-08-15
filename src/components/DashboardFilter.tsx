'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

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

export function DashboardFilter({ centers = [], isEncoder = false }: { centers?: string[], isEncoder?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentYear = searchParams.get('year') || ''
  const currentMonth = searchParams.get('month') || ''
  const currentCenter = searchParams.get('center') || ''

  // Build a range of years from 2019 to current year + 1
  const years = []
  const maxYear = new Date().getFullYear() + 1
  for (let y = 2019; y <= maxYear; y++) {
    years.push(y.toString())
  }

  const updateFilters = useCallback((year: string, month: string, center: string) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (year) params.set('year', year)
    else params.delete('year')

    if (month) params.set('month', month)
    else params.delete('month')

    if (center) params.set('center', center)
    else params.delete('center')

    router.push(`/dashboard?${params.toString()}`)
  }, [router, searchParams])

  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      {!isEncoder && (
        <select
          className="form-input"
          style={{ width: '200px', padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
          value={currentCenter}
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
        style={{ width: '150px', padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
        value={currentYear}
        onChange={(e) => updateFilters(e.target.value, currentMonth, currentCenter)}
      >
        <option value="">All Years</option>
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <select
        className="form-input"
        style={{ width: '150px', padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
        value={currentMonth}
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
