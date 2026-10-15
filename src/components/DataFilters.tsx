'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useRef, useEffect } from 'react'
import { Search, Filter, ChevronDown, ChevronRight, X } from 'lucide-react'
import { APP_YEAR_STRINGS } from '@/lib/app-years'

type FilterOptions = {
  year?: string[]
  funded_by: string[]
  center: string[]
  region: string[]
  province: string[]
  division: string[]
  municipality: string[]
  milk_type: string[]
  supplier: string[]
}

const MONTH_OPTIONS = [
  '01 - January',
  '02 - February',
  '03 - March',
  '04 - April',
  '05 - May',
  '06 - June',
  '07 - July',
  '08 - August',
  '09 - September',
  '10 - October',
  '11 - November',
  '12 - December',
]

const ALL_FILTER_KEYS = [
  'year',
  'date_started_year',
  'date_started_month',
  'date_completed_year',
  'date_completed_month',
  'funded_by',
  'center',
  'region',
  'province',
  'division',
  'municipality',
  'milk_type',
]

export function DataFilters({ filterOptions }: { filterOptions?: FilterOptions }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Search text state
  const [searchText, setSearchText] = useState(searchParams.get('search') || '')

  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(name, value)
      } else {
        params.delete(name)
      }
      return params.toString()
    },
    [searchParams],
  )

  // localFilters: every filter stores a Set<string> for multi-select support
  const [localFilters, setLocalFilters] = useState<Record<string, Set<string>>>({})

  const dateYearOptions = (filterOptions?.year || APP_YEAR_STRINGS)
    .filter(y => y !== '__ALL_YEARS__')
    .slice()
    .sort((a, b) => Number(b) - Number(a))

  const standardGroups = [
    { key: 'year', label: 'Year', options: filterOptions?.year || [] },
    { key: 'funded_by', label: 'Funded By', options: filterOptions?.funded_by || ['DepEd', 'DSWD', 'LDS'] },
    { key: 'center', label: 'Center', options: filterOptions?.center || [] },
    { key: 'region', label: 'Region', options: filterOptions?.region || [] },
    { key: 'province', label: 'Province', options: filterOptions?.province || [] },
    { key: 'division', label: 'SDO', options: filterOptions?.division || [] },
    { key: 'municipality', label: 'Municipality', options: filterOptions?.municipality || [] },
    { key: 'milk_type', label: 'Milk Type', options: filterOptions?.milk_type || [] },
  ]

  const togglePopover = () => {
    if (!isOpen) {
      const filters: Record<string, Set<string>> = {}
      ALL_FILTER_KEYS.forEach(k => {
        const val = searchParams.get(k)
        if (val) {
          const items = val.split(',').map(v => v.trim()).filter(Boolean)
          if (items.length > 0) {
            filters[k] = new Set(items)
          }
        }
      })
      setLocalFilters(filters)
    }
    setIsOpen(!isOpen)
  }

  const handleLocalFilterChange = (name: string, value: string) => {
    setLocalFilters(prev => {
      const existing = prev[name]
      const set: Set<string> = existing instanceof Set ? new Set(existing) : new Set()

      if (name === 'year') {
        if (value === '__ALL_YEARS__') {
          if (set.has('__ALL_YEARS__')) {
            set.delete('__ALL_YEARS__')
          } else {
            set.clear()
            set.add('__ALL_YEARS__')
          }
        } else {
          set.delete('__ALL_YEARS__')
          if (set.has(value)) {
            set.delete(value)
          } else {
            set.add(value)
          }
        }
      } else {
        if (set.has(value)) {
          set.delete(value)
        } else {
          set.add(value)
        }
      }

      const next = { ...prev }
      if (set.size === 0) {
        delete next[name]
      } else {
        next[name] = set
      }
      return next
    })
  }

  const handleToggleDateYear = (key: 'date_started_year' | 'date_completed_year', year: string) => {
    setLocalFilters(prev => {
      const existing = prev[key]
      const nextSet = existing instanceof Set ? new Set(existing) : new Set<string>()
      if (nextSet.has(year)) {
        nextSet.delete(year)
      } else {
        nextSet.add(year)
      }
      const next = { ...prev }
      if (nextSet.size === 0) {
        delete next[key]
      } else {
        next[key] = nextSet
      }
      return next
    })
  }

  const handleToggleDateMonth = (key: 'date_started_month' | 'date_completed_month', month: string) => {
    setLocalFilters(prev => {
      const existing = prev[key]
      const nextSet = existing instanceof Set ? new Set(existing) : new Set<string>()
      if (nextSet.has(month)) {
        nextSet.delete(month)
      } else {
        nextSet.add(month)
      }
      const next = { ...prev }
      if (nextSet.size === 0) {
        delete next[key]
      } else {
        next[key] = nextSet
      }
      return next
    })
  }

  const handleSetPresetMonths = (key: 'date_started_month' | 'date_completed_month', months: string[]) => {
    setLocalFilters(prev => {
      const next = { ...prev }
      if (months.length === 0) {
        delete next[key]
      } else {
        next[key] = new Set(months)
      }
      return next
    })
  }

  const handleClearDateField = (prefix: 'date_started' | 'date_completed') => {
    setLocalFilters(prev => {
      const next = { ...prev }
      delete next[`${prefix}_year`]
      delete next[`${prefix}_month`]
      return next
    })
  }

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString())
    ALL_FILTER_KEYS.forEach(k => params.delete(k))
    Object.entries(localFilters).forEach(([k, v]) => {
      if (v instanceof Set && v.size > 0) {
        params.set(k, Array.from(v).join(','))
      }
    })
    router.push(`/data?${params.toString()}`)
    setIsOpen(false)
  }

  const clearFilters = () => {
    setLocalFilters({})
    const params = new URLSearchParams(searchParams.toString())
    ALL_FILTER_KEYS.forEach(k => params.delete(k))
    router.push(`/data?${params.toString()}`)
    setIsOpen(false)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/data?${createQueryString('search', searchText)}`)
  }

  // Count active filters (ignoring search)
  let activeFiltersCount = 0
  if (searchParams.has('year')) activeFiltersCount++
  if (searchParams.has('date_started_year') || searchParams.has('date_started_month')) activeFiltersCount++
  if (searchParams.has('date_completed_year') || searchParams.has('date_completed_month')) activeFiltersCount++
  ;['funded_by', 'center', 'region', 'province', 'division', 'municipality', 'milk_type'].forEach(k => {
    if (searchParams.has(k)) activeFiltersCount++
  })

  // Helper: get display label for a standard group header
  const getHeaderLabel = (key: string, rawValue: Set<string> | undefined) => {
    if (!rawValue || rawValue.size === 0) return null
    if (rawValue.size === 1) {
      const v = Array.from(rawValue)[0]
      return v === '__ALL_YEARS__' ? 'All Years' : v
    }
    return `${rawValue.size} selected`
  }

  // Helper: get display label for Date Started / Date Completed header
  const getDateHeaderLabel = (datePrefix: 'date_started' | 'date_completed') => {
    const years = localFilters[`${datePrefix}_year`]
    const months = localFilters[`${datePrefix}_month`]
    const hasYears = years instanceof Set && years.size > 0
    const hasMonths = months instanceof Set && months.size > 0

    if (!hasYears && !hasMonths) return null

    const yearStr = hasYears ? Array.from(years).sort().join(', ') : null

    let monthStr: string | null = null
    if (hasMonths) {
      if (months.size === 12) {
        monthStr = 'All Mos'
      } else if (months.size === 9) {
        const isJanSep = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].every(m =>
          Array.from(months).some(item => item.startsWith(m)),
        )
        monthStr = isJanSep ? 'Jan–Sep' : '9 selected'
      } else if (months.size === 6) {
        const isH1 = ['01', '02', '03', '04', '05', '06'].every(m =>
          Array.from(months).some(item => item.startsWith(m)),
        )
        const isH2 = ['07', '08', '09', '10', '11', '12'].every(m =>
          Array.from(months).some(item => item.startsWith(m)),
        )
        monthStr = isH1 ? 'Jan–Jun' : isH2 ? 'Jul–Dec' : '6 selected'
      } else if (months.size === 1) {
        const single = Array.from(months)[0]
        const name = single.split('-')[1]?.trim() || single
        monthStr = name.substring(0, 3)
      } else {
        monthStr = `${months.size} selected`
      }
    }

    if (yearStr && monthStr) return `${yearStr} · ${monthStr}`
    if (yearStr) return yearStr
    if (monthStr) return monthStr
    return null
  }

  const renderDateFilterGroup = (
    datePrefix: 'date_started' | 'date_completed',
    label: string,
  ) => {
    const isExpanded = expandedGroup === datePrefix
    const selectedYears = localFilters[`${datePrefix}_year`] || new Set<string>()
    const selectedMonths = localFilters[`${datePrefix}_month`] || new Set<string>()
    const hasActive = selectedYears.size > 0 || selectedMonths.size > 0
    const headerLabel = getDateHeaderLabel(datePrefix)

    const isAllMonthsSelected =
      MONTH_OPTIONS.length === selectedMonths.size &&
      MONTH_OPTIONS.every(m => selectedMonths.has(m))

    const janToSepList = MONTH_OPTIONS.slice(0, 9)
    const isJanSepSelected =
      selectedMonths.size === 9 &&
      janToSepList.every(m => selectedMonths.has(m))

    const h1List = MONTH_OPTIONS.slice(0, 6)
    const isH1Selected =
      selectedMonths.size === 6 &&
      h1List.every(m => selectedMonths.has(m))

    const h2List = MONTH_OPTIONS.slice(6, 12)
    const isH2Selected =
      selectedMonths.size === 6 &&
      h2List.every(m => selectedMonths.has(m))

    const yearKey = `${datePrefix}_year` as 'date_started_year' | 'date_completed_year'
    const monthKey = `${datePrefix}_month` as 'date_started_month' | 'date_completed_month'

    return (
      <div key={datePrefix} style={{ borderBottom: '1px solid #e2e8f0' }}>
        <button
          type="button"
          onClick={() => setExpandedGroup(isExpanded ? null : datePrefix)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: isExpanded ? '#f8fafc' : 'white',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: hasActive ? 'var(--navy)' : '#334155',
          }}
        >
          <span>
            {label}
            {headerLabel && (
              <span style={{ color: '#0284c7', fontWeight: 500, marginLeft: '0.5rem', fontSize: '0.8125rem' }}>
                : {headerLabel}
              </span>
            )}
          </span>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {isExpanded && (
          <div style={{ padding: '0.75rem 1rem', background: '#f8fafc' }}>
            {/* YEAR SELECTOR */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.35rem',
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Year(s)
                </span>
                {selectedYears.size > 0 ? (
                  <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 600 }}>
                    {Array.from(selectedYears).sort().join(', ')}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    (Uses Year filter / All)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {dateYearOptions.map(y => {
                  const isSel = selectedYears.has(y)
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => handleToggleDateYear(yearKey, y)}
                      style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        fontSize: '0.78rem',
                        fontWeight: isSel ? 600 : 500,
                        border: isSel ? '1px solid var(--navy)' : '1px solid #cbd5e1',
                        background: isSel ? 'var(--navy)' : 'white',
                        color: isSel ? 'white' : '#334155',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* MONTH SELECTOR */}
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.35rem',
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Month(s)
                </span>
                {selectedMonths.size > 0 && (
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                    {selectedMonths.size} selected
                  </span>
                )}
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleSetPresetMonths(monthKey, isAllMonthsSelected ? [] : MONTH_OPTIONS)}
                  style={{
                    padding: '0.15rem 0.45rem',
                    fontSize: '0.7rem',
                    borderRadius: '4px',
                    border: isAllMonthsSelected ? '1px solid #0284c7' : '1px solid #cbd5e1',
                    background: isAllMonthsSelected ? '#e0f2fe' : 'white',
                    color: isAllMonthsSelected ? '#0369a1' : '#475569',
                    fontWeight: isAllMonthsSelected ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  All (12 mos)
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPresetMonths(monthKey, isJanSepSelected ? [] : janToSepList)}
                  style={{
                    padding: '0.15rem 0.45rem',
                    fontSize: '0.7rem',
                    borderRadius: '4px',
                    border: isJanSepSelected ? '1px solid #0284c7' : '1px solid #cbd5e1',
                    background: isJanSepSelected ? '#e0f2fe' : 'white',
                    color: isJanSepSelected ? '#0369a1' : '#475569',
                    fontWeight: isJanSepSelected ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  Jan – Sep
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPresetMonths(monthKey, isH1Selected ? [] : h1List)}
                  style={{
                    padding: '0.15rem 0.45rem',
                    fontSize: '0.7rem',
                    borderRadius: '4px',
                    border: isH1Selected ? '1px solid #0284c7' : '1px solid #cbd5e1',
                    background: isH1Selected ? '#e0f2fe' : 'white',
                    color: isH1Selected ? '#0369a1' : '#475569',
                    fontWeight: isH1Selected ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  Jan – Jun
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPresetMonths(monthKey, isH2Selected ? [] : h2List)}
                  style={{
                    padding: '0.15rem 0.45rem',
                    fontSize: '0.7rem',
                    borderRadius: '4px',
                    border: isH2Selected ? '1px solid #0284c7' : '1px solid #cbd5e1',
                    background: isH2Selected ? '#e0f2fe' : 'white',
                    color: isH2Selected ? '#0369a1' : '#475569',
                    fontWeight: isH2Selected ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  Jul – Dec
                </button>
                {selectedMonths.size > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSetPresetMonths(monthKey, [])}
                    style={{
                      padding: '0.15rem 0.45rem',
                      fontSize: '0.7rem',
                      borderRadius: '4px',
                      border: 'none',
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Checkbox grid: 2 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem 0.5rem' }}>
                {MONTH_OPTIONS.map(opt => {
                  const isSel = selectedMonths.has(opt)
                  return (
                    <label
                      key={opt}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.18rem 0',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: isSel ? 'var(--navy)' : '#475569',
                        fontWeight: isSel ? 600 : 400,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => handleToggleDateMonth(monthKey, opt)}
                        style={{ accentColor: 'var(--navy)' }}
                      />
                      <span style={{ whiteSpace: 'nowrap' }}>{opt}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {hasActive && (
              <button
                type="button"
                onClick={() => handleClearDateField(datePrefix)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  marginTop: '0.65rem',
                  color: '#ef4444',
                  fontSize: '0.75rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={12} /> Clear {label}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderStandardGroup = (group: { key: string; label: string; options: string[] }) => {
    const isExpanded = expandedGroup === group.key
    const activeValue = localFilters[group.key]
    const headerLabel = getHeaderLabel(group.key, activeValue)
    const hasActive = activeValue instanceof Set && activeValue.size > 0

    return (
      <div key={group.key} style={{ borderBottom: '1px solid #e2e8f0' }}>
        <button
          type="button"
          onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: isExpanded ? '#f8fafc' : 'white',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: hasActive ? 'var(--navy)' : '#334155',
          }}
        >
          <span>
            {group.label}
            {headerLabel && (
              <span style={{ color: '#64748b', fontWeight: 400, marginLeft: '0.5rem' }}>
                : {headerLabel}
              </span>
            )}
          </span>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {/* Expandable Options List */}
        {isExpanded && (
          <div style={{ padding: '0.5rem 1rem', background: '#f8fafc' }}>
            {activeValue instanceof Set && activeValue.size > 1 && (
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.4rem', fontStyle: 'italic' }}>
                {activeValue.size} selected
              </div>
            )}
            {group.options.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.25rem 0' }}>No options available</div>
            ) : (
              group.options.map((opt: string) => {
                const isSelected = activeValue instanceof Set ? activeValue.has(opt) : false
                const label = opt === '__ALL_YEARS__' ? 'All Years' : opt
                return (
                  <label
                    key={opt}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.25rem 0',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: isSelected ? 'var(--navy)' : '#475569',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleLocalFilterChange(group.key, opt)}
                      style={{ marginTop: '0.15rem', accentColor: 'var(--navy)' }}
                    />
                    <span style={{ lineHeight: 1.4 }}>{label}</span>
                  </label>
                )
              })
            )}
            {hasActive && (
              <button
                type="button"
                onClick={() => {
                  setLocalFilters(prev => {
                    const next = { ...prev }
                    delete next[group.key]
                    return next
                  })
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem', color: '#ef4444', fontSize: '0.75rem', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} /> Clear Filter
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Find standard groups
  const yearGroup = standardGroups.find(g => g.key === 'year')
  const otherGroups = standardGroups.filter(g => g.key !== 'year')

  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', position: 'relative' }}>
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
        <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
          <Search size={18} />
        </div>
        <input
          type="text"
          placeholder="Search by Center, Province, School..."
          className="form-input"
          style={{ paddingLeft: '2.5rem', width: '100%', borderRadius: '0.375rem' }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </form>

      {/* Filter Button */}
      <div ref={popoverRef} style={{ position: 'relative' }}>
        <button
          className="btn btn-outline"
          onClick={togglePopover}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isOpen ? '#f8fafc' : 'white' }}
        >
          <Filter size={18} />
          Filters
          {activeFiltersCount > 0 && (
            <span style={{ background: 'var(--navy)', color: 'white', borderRadius: '9999px', padding: '0 0.4rem', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Filter Popover Dropdown */}
        {isOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '0.5rem',
            width: 340,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            zIndex: 50,
            maxHeight: '70vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* 1. Year */}
              {yearGroup && renderStandardGroup(yearGroup)}

              {/* 2. Date Started (Year & Month) */}
              {renderDateFilterGroup('date_started', 'Date Started (Year & Month)')}

              {/* 3. Date Completed (Year & Month) */}
              {renderDateFilterGroup('date_completed', 'Date Completed (Year & Month)')}

              {/* 4. Other Standard Groups */}
              {otherGroups.map(renderStandardGroup)}

              {/* Action Buttons */}
              <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', background: '#f8fafc', borderBottomLeftRadius: '0.5rem', borderBottomRightRadius: '0.5rem' }}>
                <button
                  type="button"
                  onClick={clearFilters}
                  style={{ flex: 1, padding: '0.5rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', color: '#475569', cursor: 'pointer', fontWeight: 500 }}
                >
                  Remove Filters
                </button>
                <button
                  type="button"
                  onClick={applyFilters}
                  style={{ flex: 1, padding: '0.5rem', background: 'var(--navy)', border: '1px solid var(--navy)', borderRadius: '0.375rem', fontSize: '0.875rem', color: 'white', cursor: 'pointer', fontWeight: 500 }}
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
