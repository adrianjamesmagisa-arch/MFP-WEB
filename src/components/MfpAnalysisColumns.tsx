'use client'

import { useMfpAnalysisScope } from '@/components/MfpAnalysisScope'
import { MFP_ANALYSIS_COLUMNS, analysisColumnLabel, type MfpAnalysisColumnId } from '@/lib/mfp-analysis-columns'

export function MfpAnalysisColumnCheckbox({ column }: { column: MfpAnalysisColumnId }) {
  const scope = useMfpAnalysisScope()
  if (!scope) return null
  return <label style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6, fontSize: '0.65rem', fontWeight: 400 }} onClick={event => event.stopPropagation()}>
    <input type="checkbox" aria-label={`Analyze column ${analysisColumnLabel(column)}`}
      checked={scope.selectedColumns.has(column)} onChange={() => scope.toggleColumn(column)} /> Analyze column
  </label>
}

export function MfpAnalysisColumnSelection() {
  const scope = useMfpAnalysisScope()
  if (!scope) return null
  const all = scope.selectedColumns.size === MFP_ANALYSIS_COLUMNS.length
  return <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: '0.75rem', lineHeight: 1.6 }}>
    <strong>Columns:</strong>
    <span aria-live="polite">{all ? `All ${MFP_ANALYSIS_COLUMNS.length} supported columns` : scope.selectedColumns.size
      ? MFP_ANALYSIS_COLUMNS.filter(column => scope.selectedColumns.has(column.id)).map(column => `${column.letter} — ${column.label}`).join('; ')
      : 'Choose columns in the table headers or use All supported columns.'}</span>
    <button type="button" className="btn btn-outline" style={{ fontSize: '0.7rem', padding: '2px 6px' }} disabled={all} onClick={scope.allColumns}>All supported columns</button>
    <button type="button" className="btn btn-outline" style={{ fontSize: '0.7rem', padding: '2px 6px' }} disabled={!scope.selectedColumns.size} onClick={scope.clearColumns}>Clear columns</button>
  </div>
}
