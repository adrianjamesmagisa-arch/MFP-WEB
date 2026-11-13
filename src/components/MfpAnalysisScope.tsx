'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { MfpListFilters } from '@/lib/mfp-list-filters'
import { ALL_MFP_ANALYSIS_COLUMNS, type MfpAnalysisColumnId } from '@/lib/mfp-analysis-columns'

interface AnalysisScope {
  filters: MfpListFilters
  version: string
  selectedIds: ReadonlySet<string>
  mode: 'filtered' | 'selected'
  setMode: (mode: 'filtered' | 'selected') => void
  toggle: (id: string) => void
  toggleAll: () => void
  clear: () => void
  selectedColumns: ReadonlySet<MfpAnalysisColumnId>
  toggleColumn: (id: MfpAnalysisColumnId) => void
  allColumns: () => void
  clearColumns: () => void
}
const ScopeContext = createContext<AnalysisScope | null>(null)

/** Selection for analysis is independent of the table's edit/delete permissions. */
export function MfpAnalysisScope({ children, filters, version, rowIds }: {
  children: ReactNode; filters: MfpListFilters; version: string; rowIds: string[]
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'filtered' | 'selected'>('filtered')
  const [selectedColumns, setSelectedColumns] = useState<Set<MfpAnalysisColumnId>>(new Set(ALL_MFP_ANALYSIS_COLUMNS))
  const value = useMemo<AnalysisScope>(() => ({ filters, version, selectedIds, mode, setMode, selectedColumns,
    toggleColumn: id => setSelectedColumns(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    }),
    allColumns: () => setSelectedColumns(new Set(ALL_MFP_ANALYSIS_COLUMNS)),
    clearColumns: () => setSelectedColumns(new Set()),
    toggle: id => {
      const next = new Set(selectedIds)
      if (next.has(id)) next.delete(id)
      else if (rowIds.includes(id)) next.add(id)
      setSelectedIds(next); setMode(next.size ? 'selected' : 'filtered')
    },
    toggleAll: () => {
      const next = selectedIds.size === rowIds.length ? new Set<string>() : new Set(rowIds)
      setSelectedIds(next); setMode(next.size ? 'selected' : 'filtered')
    },
    clear: () => { setSelectedIds(new Set()); setMode('filtered') },
  }), [filters, version, selectedIds, mode, selectedColumns, rowIds])
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useMfpAnalysisScope() { return useContext(ScopeContext) }
