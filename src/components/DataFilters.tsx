'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useRef, useEffect } from 'react'
import { Search, Filter, ChevronDown, ChevronRight, X } from 'lucide-react'

type FilterOptions = {
  funded_by: string[]
  center: string[]
  region: string[]
  province: string[]
  division: string[]
  municipality: string[]
  milk_type: string[]
  supplier: string[]
}

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
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
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
    [searchParams]
  )

  const [localFilters, setLocalFilters] = useState<Record<string, string>>({})

  const togglePopover = () => {
    if (!isOpen) {
      const filters: Record<string, string> = {}
      // Sync from URL when opening
      filterGroups.forEach(g => {
        const val = searchParams.get(g.key)
        if (val) filters[g.key] = val
      })
      setLocalFilters(filters)
    }
    setIsOpen(!isOpen)
  }

  const handleLocalFilterChange = (name: string, value: string) => {
    setLocalFilters(prev => {
      const newFilters = { ...prev }
      if (newFilters[name] === value) {
        delete newFilters[name]
      } else {
        newFilters[name] = value
      }
      return newFilters
    })
  }

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString())
    filterGroups.forEach(g => params.delete(g.key))
    Object.entries(localFilters).forEach(([k, v]) => {
      params.set(k, v)
    })
    router.push(`/data?${params.toString()}`)
    setIsOpen(false)
  }

  const clearFilters = () => {
    setLocalFilters({})
    const params = new URLSearchParams(searchParams.toString())
    filterGroups.forEach(g => params.delete(g.key))
    router.push(`/data?${params.toString()}`)
    setIsOpen(false)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/data?${createQueryString('search', searchText)}`)
  }

  const filterGroups = [
    { key: 'year', label: 'Year', options: filterOptions?.year || [] },
    { key: 'date_started_month', label: 'Date Started (Month)', options: [
      '01 - January', '02 - February', '03 - March', '04 - April',
      '05 - May', '06 - June', '07 - July', '08 - August',
      '09 - September', '10 - October', '11 - November', '12 - December'
    ] },
    { key: 'date_completed_month', label: 'Date Completed (Month)', options: [
      '01 - January', '02 - February', '03 - March', '04 - April',
      '05 - May', '06 - June', '07 - July', '08 - August',
      '09 - September', '10 - October', '11 - November', '12 - December'
    ] },
    { key: 'funded_by', label: 'Funded By', options: filterOptions?.funded_by || ['DepEd', 'DSWD', 'LDS'] },
    { key: 'center', label: 'Center', options: filterOptions?.center || [] },
    { key: 'region', label: 'Region', options: filterOptions?.region || [] },
    { key: 'province', label: 'Province', options: filterOptions?.province || [] },
    { key: 'division', label: 'SDO', options: filterOptions?.division || [] },
    { key: 'municipality', label: 'Municipality', options: filterOptions?.municipality || [] },
    { key: 'milk_type', label: 'Milk Type', options: filterOptions?.milk_type || [] },
  ]

  // Count active filters (ignoring search)
  let activeFiltersCount = 0
  filterGroups.forEach(g => {
    if (searchParams.has(g.key)) activeFiltersCount++
  })

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
      <div ref={popoverRef}>
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
            left: 408, // Approx position next to search bar
            marginTop: '0.5rem',
            width: 320,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            zIndex: 50,
            maxHeight: '60vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filterGroups.map(group => {
                const isExpanded = expandedGroup === group.key
                const activeValue = localFilters[group.key]

                return (
                  <div key={group.key} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <button
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
                        color: activeValue ? 'var(--navy)' : '#334155'
                      }}
                    >
                      <span>
                        {group.label}
                        {activeValue && <span style={{ color: '#64748b', fontWeight: 400, marginLeft: '0.5rem' }}>: {activeValue}</span>}
                      </span>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    
                    {/* Expandable Options List */}
                    {isExpanded && (
                      <div style={{ padding: '0.5rem 1rem', background: '#f8fafc' }}>
                        {group.options.length === 0 ? (
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.25rem 0' }}>No options available</div>
                        ) : (
                          group.options.map(opt => {
                            const isSelected = activeValue === opt
                            return (
                              <label key={opt} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.25rem 0', cursor: 'pointer', fontSize: '0.875rem', color: isSelected ? 'var(--navy)' : '#475569', fontWeight: isSelected ? 500 : 400 }}>
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => handleLocalFilterChange(group.key, opt)}
                                  style={{ marginTop: '0.15rem' }}
                                />
                                <span style={{ lineHeight: 1.4 }}>{opt}</span>
                              </label>
                            )
                          })
                        )}
                        {activeValue && (
                           <button 
                             onClick={() => handleLocalFilterChange(group.key, activeValue)}
                             style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem', color: '#ef4444', fontSize: '0.75rem', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                           >
                             <X size={12} /> Clear Filter
                           </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Action Buttons */}
              <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', background: '#f8fafc', borderBottomLeftRadius: '0.5rem', borderBottomRightRadius: '0.5rem' }}>
                <button 
                  onClick={clearFilters}
                  style={{ flex: 1, padding: '0.5rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', color: '#475569', cursor: 'pointer', fontWeight: 500 }}
                >
                  Remove Filters
                </button>
                <button 
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
