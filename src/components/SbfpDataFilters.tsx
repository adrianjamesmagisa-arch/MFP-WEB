'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useRef, useEffect } from 'react'
import { Search, Filter, ChevronDown, ChevronRight, X } from 'lucide-react'

type FilterOptions = {
  year?: string[]
  region: string[]
  sdo: string[]
  procurement_status: string[]
  center: string[]
}

export function SbfpDataFilters({ filterOptions }: { filterOptions?: FilterOptions }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  
  const [searchText, setSearchText] = useState(searchParams.get('search') || '')
  const popoverRef = useRef<HTMLDivElement>(null)

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

  const filterGroups = [
    { id: 'year', label: 'Year', options: filterOptions?.year || [] },
    { id: 'region', label: 'Region', options: filterOptions?.region || [] },
    { id: 'sdo', label: 'SDO', options: filterOptions?.sdo || [] },
    { id: 'procurement_status', label: 'Status', options: filterOptions?.procurement_status || [] },
    { id: 'center', label: 'Center', options: filterOptions?.center || [] },
  ]

  const togglePopover = () => {
    if (!isOpen) {
      const filters: Record<string, string> = {}
      filterGroups.forEach(g => {
        const val = searchParams.get(g.id)
        if (val) filters[g.id] = val
      })
      setLocalFilters(filters)
    }
    setIsOpen(!isOpen)
  }

  const handleApply = () => {
    const params = new URLSearchParams(searchParams.toString())
    filterGroups.forEach(g => {
      if (localFilters[g.id]) {
        params.set(g.id, localFilters[g.id])
      } else {
        params.delete(g.id)
      }
    })
    router.push(`?${params.toString()}`)
    setIsOpen(false)
  }

  const handleClear = () => {
    const params = new URLSearchParams(searchParams.toString())
    filterGroups.forEach(g => params.delete(g.id))
    setLocalFilters({})
    router.push(`?${params.toString()}`)
    setIsOpen(false)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`?${createQueryString('search', searchText)}`)
  }

  const removeFilter = (id: string) => {
    router.push(`?${createQueryString(id, '')}`)
  }

  const activeFilters = filterGroups.filter(g => searchParams.has(g.id))

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search SDO, Region..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-9"
          />
        </form>
        
        <div className="relative">
          <button
            onClick={togglePopover}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 gap-2"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilters.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {activeFilters.length}
              </span>
            )}
          </button>

          {isOpen && (
            <div ref={popoverRef} className="absolute right-0 top-full mt-2 w-72 rounded-md border bg-popover text-popover-foreground shadow-md outline-none z-50">
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Filters</h4>
                  <p className="text-sm text-muted-foreground">
                    Refine your data view.
                  </p>
                </div>
                
                <div className="space-y-1">
                  {filterGroups.map((group) => (
                    <div key={group.id} className="border rounded-md">
                      <button
                        onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                        className="flex items-center justify-between w-full p-2 text-sm font-medium hover:bg-muted/50"
                      >
                        {group.label}
                        {expandedGroup === group.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      
                      {expandedGroup === group.id && group.options.length > 0 && (
                        <div className="p-2 border-t bg-muted/20 max-h-48 overflow-y-auto">
                          <select
                            value={localFilters[group.id] || ''}
                            onChange={(e) => setLocalFilters({ ...localFilters, [group.id]: e.target.value })}
                            className="w-full text-sm rounded-md border border-input bg-background px-3 py-1"
                          >
                            <option value="">All</option>
                            {group.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleClear}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={handleApply}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-4"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map(group => (
            <div
              key={group.id}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <span className="text-muted-foreground mr-1">{group.label}:</span>
              {searchParams.get(group.id)}
              <button
                onClick={() => removeFilter(group.id)}
                className="ml-1 rounded-full outline-none hover:bg-secondary focus:bg-secondary"
              >
                <X className="h-3 w-3" />
                <span className="sr-only">Remove filter</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
