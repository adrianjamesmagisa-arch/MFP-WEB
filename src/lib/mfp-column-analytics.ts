import type { MfpListRow } from '@/lib/mfp-sbfp-source'
import { answerMfpQuestion, summarizeMfpRows, formatMfpTotal, normalizeMfpQuestion, mfpRankingMetric, type MfpAnalytics, type KnownTotal } from '@/lib/mfp-analytics'
import { MFP_ANALYSIS_COLUMNS, analysisColumnLabel, type MfpAnalysisColumn, type MfpAnalysisColumnId } from '@/lib/mfp-analysis-columns'

const safeCell = (value: unknown) => String(value ?? '').trim().replace(/[|`*<>\r\n]/g, ' ').slice(0, 100)
const money = (id: string) => ['milk_cost', 'service_fee', 'total_funds_transferred'].includes(id)
const chosen = (ids: readonly MfpAnalysisColumnId[]) => MFP_ANALYSIS_COLUMNS.filter(column => ids.includes(column.id))
function valueFor(summary: MfpAnalytics, column: MfpAnalysisColumn): KnownTotal {
  if (!('metric' in column)) return { value: null, known: 0, missing: 0 }
  if (column.metric === 'schools') return { value: summary.schools.count, known: summary.schools.count, missing: 0 }
  if (column.metric === 'target') return summary.target
  if (column.metric === 'delivered') return summary.delivered
  return summary.metrics[column.metric]
}
function groupedRows(rows: MfpListRow[], column: MfpAnalysisColumn) {
  const groups = new Map<string, { label: string; rows: MfpListRow[] }>()
  for (const row of rows) {
    const raw = column.id === 'supplier_id' ? row.cooperatives?.name || row.supplier_id : row[column.id]
    const label = String(raw || 'Unspecified').trim()
    // Keep combined supplier labels intact, and preserve distinct known supplier IDs.
    const id = JSON.stringify([column.id === 'supplier_id' ? row.supplier_id : '', label.toLowerCase()])
    const group = groups.get(id) || { label, rows: [] }
    group.rows.push(row); groups.set(id, group)
  }
  return [...groups.values()]
}
function notes(summary: MfpAnalytics, ids: readonly MfpAnalysisColumnId[]) {
  return [
    ...(ids.includes('elementary_school') ? [`School count unit: ${summary.schools.unit}. ${summary.schools.basis}`,
      `${summary.schools.missingNames} DepEd row(s) lack school names; ${summary.schools.ambiguousRows} row(s) have ambiguous geography.${summary.schools.ambiguousRows ? ' The exact unique-school count is unresolved.' : ''} School counts are not additive across groups.`] : []),
    ...(ids.includes('beneficiaries') ? ['Combined Original/Add beneficiaries use the original contract only; missing original counts remain unavailable.'] : []),
    ...(ids.some(id => id === 'target_milk_packs_to_deliver' || id === 'total_milk_packs_delivered')
      ? ['Each represented source contract counts once. These are full contract totals, not delivery allocations to selected schools. Contract totals can overlap across breakdown groups.'] : []),
    ...(ids.includes('supplier_id') ? ['Combined supplier labels cover multiple suppliers together; amounts cannot be allocated to each supplier separately. Known supplier IDs remain distinct. Supplier groups are displayed label/ID combinations, not a unique-cooperative count.'] : []),
    'Missing values are not zero. Amounts marked partial include known values only.',
  ]
}

function breakdown(rows: MfpListRow[], dimension: MfpAnalysisColumn, metrics: MfpAnalysisColumn[], rank: MfpAnalysisColumn | 'rows' | undefined, limit: number) {
  const groups = groupedRows(rows, dimension).map(group => ({ ...group, summary: summarizeMfpRows(group.rows) }))
  groups.sort((a, b) => rank ? (rank === 'rows' ? b.rows.length - a.rows.length
    : (valueFor(b.summary, rank).value ?? -Infinity) - (valueFor(a.summary, rank).value ?? -Infinity)) || a.label.localeCompare(b.label)
    : a.label.localeCompare(b.label))
  const headers = [dimension.label, 'Rows', ...metrics.map(column => `${column.letter} — ${column.label}`)]
  return `**By ${dimension.label}**${rank ? ` (descending by ${rank === 'rows' ? 'rows' : rank.label})` : ''}\n\n| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n` +
    groups.slice(0, limit).map(group => `| ${[safeCell(group.label), group.rows.length, ...metrics.map(column => formatMfpTotal(valueFor(group.summary, column), money(column.id)))].join(' | ')} |`).join('\n') +
    `\n\n${groups.length} group(s) total.${groups.length > limit ? ` Showing ${limit}; narrow the table filters to see remaining groups.` : ''}`
}

/** Explicit analysis action: exact totals and bounded comparisons, without an LLM call. */
export function analyzeMfpColumns(rows: MfpListRow[], ids: readonly MfpAnalysisColumnId[], summary = summarizeMfpRows(rows)) {
  const columns = chosen(ids)
  const metrics = columns.filter(column => 'metric' in column)
  const totals = metrics.map(column => `- ${analysisColumnLabel(column.id)}: **${formatMfpTotal(valueFor(summary, column), money(column.id))}**${column.id === 'elementary_school' ? ` ${summary.schools.unit}` : ''}`)
  if (ids.includes('target_milk_packs_to_deliver') && ids.includes('total_milk_packs_delivered')) {
    totals.push(`- Contract completion: **${summary.completion == null ? 'Unavailable (target or delivery incomplete)' : `${summary.completion.toFixed(1)}%`}**`)
  }
  const comparisons = columns.filter(column => 'group' in column).map(column => breakdown(rows, column, metrics, undefined, 5))
  return [`**Selected-column analysis · ${rows.length.toLocaleString()} rows**`, totals.join('\n'), ...comparisons, ...notes(summary, ids)].filter(Boolean).join('\n\n')
}

// Question detection identifies requested fields only; the existing strict operation
// parser still rejects named constraints, dates and predicates before any totals.
function requestedColumns(question: string): MfpAnalysisColumnId[] {
  const q = question.toLowerCase()
  const withoutContractPacks = q.replace(/(?:contract )?(?:target|delivered)(?: milk)? packs|milk packs delivered/g, '')
  const patterns: Array<[MfpAnalysisColumnId, RegExp]> = [
    ['funded_by', /funding sources?|funders?/], ['region', /\bregions?\b/], ['center', /\bcent(?:er|re)s?\b/],
    ['province', /\bprovinces?\b/], ['division', /\bdivisions?\b/], ['municipality', /\bmunicipalit(?:y|ies)\b/],
    ['milk_type', /\bmilk types?\b/], ['supplier_id', /\bcooperatives?|\bsuppliers?\b/],
    ['elementary_school', /\bschools?\b/], ['beneficiaries', /\bbeneficiar/],
    ['milk_cost', /milk cost|col(?:umn)?\s*u\b/], ['service_fee', /shipping|service fees?|col(?:umn)?\s*v\b/],
    ['total_funds_transferred', /\bfunds\b|col(?:umn)?\s*w\b/],
    ['total_volume_requirements', /total vol|volume requirements?|\bvolume\b/], ['raw_milk_liters', /raw milk/],
    ['whole_milk_kg', /whole milk/], ['skimmed_milk_kg', /skim(?:med)? milk/], ['sugar', /\bsugar\b/],
    ['target_milk_packs_to_deliver', /\btarget\b|\bcompletion\b/],
    ['total_milk_packs_delivered', /\bdelivered\b|\bdeliveries\b|\bcompletion\b/],
  ]
  const result = patterns.filter(([, pattern]) => pattern.test(q)).map(([id]) => id)
  if (/\bmilk packs\b/.test(withoutContractPacks)) result.push('milk_packs')
  for (const column of MFP_ANALYSIS_COLUMNS) {
    if (new RegExp(`\\bcol(?:umn)?\\s+${column.letter}\\b`, 'i').test(q) && !result.includes(column.id)) result.push(column.id)
  }
  return result
}

export function answerMfpColumnQuestion(rows: MfpListRow[], question: string, ids: readonly MfpAnalysisColumnId[], summary = summarizeMfpRows(rows)): string | null {
  const explicit = requestedColumns(question)
  const missing = explicit.filter(id => !ids.includes(id))
  if (missing.length) return `Select these analysis columns first: ${missing.map(analysisColumnLabel).join('; ')}. No total was calculated for unselected columns.`
  const canonicalQuestion = question.replace(/\bcol(?:umn)?\s+(AD|AE|[BCDEFGHIJKLMNQRTUVW])\b/gi, (_, letter: string) => {
    const column = MFP_ANALYSIS_COLUMNS.find(item => item.letter === letter.toUpperCase())!
    return column.id === 'target_milk_packs_to_deliver' ? 'target milk packs' : column.id === 'total_milk_packs_delivered'
      ? 'delivered milk packs' : column.id === 'service_fee' ? 'shipping fee' : column.id === 'funded_by'
        ? 'funding sources' : column.label.replace(/\s*\([^)]*\)/g, '')
  })
  const supported = answerMfpQuestion(rows, canonicalQuestion, summary)
  if (!supported || ids.length === MFP_ANALYSIS_COLUMNS.length) return supported
  const normalized = normalizeMfpQuestion(canonicalQuestion)
  if (/^(summarize|summary|give .*summary)/.test(normalized)) return analyzeMfpColumns(rows, ids, summary)
  const columns = chosen(ids)
  const dimensions = columns.filter(column => 'group' in column && explicit.includes(column.id))
  const requestedMetrics = columns.filter(column => 'metric' in column && explicit.includes(column.id))
  if (dimensions.length && /break\s?down|\bby\b|compare|highest|top|largest|most|rank/i.test(question)) {
    const ranked = /highest|top|largest|most|rank/i.test(question)
    const metric = ranked ? mfpRankingMetric(normalized) : null
    const rank = metric === 'rows' ? 'rows' : ranked ? columns.find(column => 'metric' in column && column.metric === metric) : undefined
    if (ranked && !rank) return 'Select Milk Packs or explicitly name a selected measure to rank these groups.'
    return [...dimensions.map(column => breakdown(rows, column, columns.filter(item => 'metric' in item), rank, 10)), ...notes(summary, ids)].join('\n\n')
  }
  if (/show zero or delayed deliveries/i.test(question)) {
    return `${summary.zeroDeliveryContracts} represented contract/record delivery total(s) explicitly show zero; ${summary.unknownDeliveryContracts} are unknown.\n\n${analyzeMfpColumns(rows, ['total_milk_packs_delivered'], summary)}\n\nA delay requires a verified due date and delivery history; zero or missing values alone do not establish a delay.`
  }
  if (requestedMetrics.length) return analyzeMfpColumns(rows, requestedMetrics.map(column => column.id), summary)
  if (/\b(rows?|records?|entries)\b/i.test(question) && /how many|count|number of|total/i.test(question)) return `${rows.length.toLocaleString()} table rows in this scope.`
  return null
}

/** Only selected aggregates and bounded category counts enter the explanation context. */
export function mfpColumnExplanationFacts(rows: MfpListRow[], ids: readonly MfpAnalysisColumnId[], summary = summarizeMfpRows(rows)) {
  const columns = chosen(ids)
  return { rowCount: rows.length, columns: columns.map(column => analysisColumnLabel(column.id)),
    metrics: Object.fromEntries(columns.filter(column => 'metric' in column).map(column => [column.id, valueFor(summary, column)])),
    groups: columns.filter(column => 'group' in column).map(column => {
      const groups = groupedRows(rows, column).sort((a, b) => b.rows.length - a.rows.length)
      return { column: column.label, groupCount: groups.length, values: groups.slice(0, 5).map(group => ({ label: safeCell(group.label), rows: group.rows.length })), omittedGroups: Math.max(0, groups.length - 5) }
    }), notes: notes(summary, ids) }
}
