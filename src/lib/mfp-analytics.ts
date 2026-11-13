import type { MfpListRow } from '@/lib/mfp-sbfp-source'
import { sbfpNavCenter } from '@/lib/center-aliases'
import { normalizeSdoName } from '@/lib/sbfp-dropoff-sync'

const text = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ')
const key = (value: unknown) => text(value).toLowerCase()
const knownText = (value: unknown) => !['', 'n/a', 'na', '—', '-'].includes(key(value))
const cell = (value: unknown) => text(value).replace(/[|`*<>]/g, ' ')
const number = (value: unknown): number | null => {
  if (value == null || typeof value === 'boolean' || !knownText(value)) return null
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}
export interface KnownTotal { value: number | null; missing: number; known: number }
const metricFields = ['milk_packs', 'total_volume_requirements', 'raw_milk_liters', 'whole_milk_kg',
  'skimmed_milk_kg', 'sugar', 'beneficiaries', 'milk_cost', 'service_fee', 'total_funds_transferred'] as const
export type MetricField = typeof metricFields[number]

function total(rows: MfpListRow[], field: string, money = false): KnownTotal {
  const values = rows.map(row => number(row[field])).filter((value): value is number => value !== null)
  const scale = money ? 100 : 10000
  return { value: values.length ? values.reduce((sum, value) => sum + Math.round(value * scale), 0) / scale : null,
    missing: rows.length - values.length, known: values.length }
}

/** Name-based identity is explicit: no claim of a school-code registry we do not store. */
export function countMfpSchools(rows: MfpListRow[]) {
  const groups = new Map<string, Array<{ province: string; municipality: string }>>()
  let missingNames = 0
  for (const row of rows) {
    if (key(row.funded_by) !== 'deped') continue
    if (!knownText(row.elementary_school)) { missingNames++; continue }
    const division = knownText(row.division) ? String(row.division) : row.source_contracts?.[0]?.label || row.source_contract_label || ''
    const identity = JSON.stringify([row.year, key(sbfpNavCenter(row.center)), normalizeSdoName(division), key(row.elementary_school)])
    const group = groups.get(identity) || []
    group.push({ province: knownText(row.province) ? key(row.province) : '', municipality: knownText(row.municipality) ? key(row.municipality) : '' })
    groups.set(identity, group)
  }
  let count = 0
  let ambiguousRows = 0
  for (const group of groups.values()) {
    // Most specific geography first; missing values may join only one compatible identity.
    const ordered = [...group].sort((a, b) => Number(!!b.province) + Number(!!b.municipality) - Number(!!a.province) - Number(!!a.municipality))
    const places: typeof group = []
    for (const item of ordered) {
      const matches = places.filter(place => (!item.province || !place.province || item.province === place.province) &&
        (!item.municipality || !place.municipality || item.municipality === place.municipality))
      if (!matches.length) places.push({ ...item })
      else if (matches.length === 1) {
        matches[0].province ||= item.province
        matches[0].municipality ||= item.municipality
      } else ambiguousRows++
    }
    count += places.length
  }
  return { count, missingNames, ambiguousRows,
    unit: new Set(rows.filter(row => key(row.funded_by) === 'deped').map(row => row.year)).size > 1 ? 'school-year participations' : 'participating schools',
    basis: 'DepEd school names grouped within year, center and base SDO, using available province/municipality. Original/Add contracts and milk types do not create additional schools. This is a name-based count, not a school-code registry.' }
}

export function summarizeMfpRows(rows: MfpListRow[]) {
  const metrics = Object.fromEntries(metricFields.map(field => [field, total(rows, field, ['milk_cost', 'service_fee', 'total_funds_transferred'].includes(field))])) as Record<MetricField, KnownTotal>
  const contracts = new Map<string, { target: number | null; delivered: number | null }>()
  for (const row of rows) {
    if (row.source_contracts?.length) {
      for (const contract of row.source_contracts) contracts.set(contract.id, { target: number(contract.target), delivered: number(contract.delivered) })
    } else contracts.set(`row:${row.id}`, { target: number(row.target_milk_packs_to_deliver), delivered: number(row.total_milk_packs_delivered) })
  }
  const values = [...contracts.values()]
  const contractTotal = (field: 'target' | 'delivered'): KnownTotal => {
    const known = values.map(value => value[field]).filter((value): value is number => value !== null)
    return { value: known.length ? known.reduce((sum, value) => sum + value, 0) : null, known: known.length, missing: values.length - known.length }
  }
  const target = contractTotal('target')
  const delivered = contractTotal('delivered')
  return { rows: rows.length, schools: countMfpSchools(rows), metrics, target, delivered,
    completion: !target.missing && !delivered.missing && target.value && delivered.value != null ? delivered.value / target.value * 100 : null,
    contracts: contracts.size,
    zeroDeliveryContracts: values.filter(value => value.delivered === 0).length,
    unknownDeliveryContracts: values.filter(value => value.delivered == null).length,
    centers: [...new Set(rows.map(row => row.center).filter(knownText))],
    sourceSchools: rows.reduce((sum, row) => sum + (row.source_dropoff_ids?.length || (row.source_dropoff_id ? 1 : 0)), 0) }
}
export type MfpAnalytics = ReturnType<typeof summarizeMfpRows>

export function formatMfpTotal(metric: KnownTotal, money = false) {
  const amount = metric.value == null ? 'Unavailable' : `${money ? '₱' : ''}${metric.value.toLocaleString('en-US', { maximumFractionDigits: money ? 2 : 4, minimumFractionDigits: money ? 2 : 0 })}`
  return `${amount}${metric.missing ? ` (${metric.missing} missing; known amounts only)` : ''}`
}
const schoolAnswer = (summary: MfpAnalytics) => `**${summary.schools.count.toLocaleString()} ${summary.schools.unit}** identified across **${summary.rows.toLocaleString()} table rows**.\n\n${summary.schools.basis}${summary.schools.missingNames ? ` ${summary.schools.missingNames} DepEd row(s) lack school names and are excluded.` : ''}${summary.schools.ambiguousRows ? ` ${summary.schools.ambiguousRows} row(s) have ambiguous geography and are excluded from additional counting; the exact unique-school count is unresolved.` : ''}`
const deliveryAnswer = (summary: MfpAnalytics) => `- Contract target packs: **${formatMfpTotal(summary.target)}**\n- Contract delivered packs: **${formatMfpTotal(summary.delivered)}**\n- Completion: **${summary.completion == null ? 'Unavailable (target or delivery data incomplete)' : `${summary.completion.toFixed(1)}%`}**\n\nEach represented source contract counts once. These are full contract totals; deliveries are not allocated to individual selected schools.`

const groups = ['center', 'region', 'province', 'division', 'municipality', 'milk_type', 'funded_by', 'cooperative'] as const
type Group = typeof groups[number]
type GroupMetric = MetricField | 'rows' | 'schools' | 'target' | 'delivered'
const rankingQuestion = /\b(highest|top|largest|most|rank)\b/i
export function mfpRankingMetric(question: string): GroupMetric | null {
  const phrase = question.includes(' by ') ? question.split(' by ').at(-1)!.trim().replace(/^the /, '').replace(/^known /, '').replace(/^total /, '') : 'milk packs'
  const patterns: Array<[GroupMetric, RegExp]> = [
    ['rows', /^(number of )?(records?|rows?|entries)$/],
    ['schools', /^(number of )?((unique|elementary|participating) )*schools?$/],
    ['beneficiaries', /^beneficiaries$/],
    ['target', /^(contract )?target( milk)? packs$/],
    ['delivered', /^(contract )?(delivered( milk)? packs|milk packs delivered)$/],
    ['milk_packs', /^milk packs$/],
    ['total_volume_requirements', /^(milk )?volume( requirements)?( in (liters|litres))?$/],
    ['raw_milk_liters', /^raw milk( in (liters|litres))?$/],
    ['whole_milk_kg', /^whole milk( in kg)?$/],
    ['skimmed_milk_kg', /^skim(med)? milk( in kg)?$/],
    ['sugar', /^sugar( in kg)?$/],
    ['milk_cost', /^(milk cost|col(?:umn)? u)$/],
    ['service_fee', /^(shipping( fees?)?|service fees?|col(?:umn)? v)$/],
    ['total_funds_transferred', /^(funds( transferred)?|col(?:umn)? w)$/],
  ]
  return patterns.find(([, pattern]) => pattern.test(phrase))?.[0] ?? null
}
function groupValue(row: MfpListRow, group: Group) {
  return group === 'cooperative' ? text(row.cooperatives?.name || row.supplier_id || 'Unspecified') : text(row[group] || 'Unspecified')
}
function groupedAnswer(rows: MfpListRow[], group: Group, question: string) {
  const buckets = new Map<string, { name: string; rows: MfpListRow[] }>()
  for (const row of rows) {
    const name = groupValue(row, group)
    const bucket = buckets.get(key(name)) || { name, rows: [] }
    bucket.rows.push(row); buckets.set(key(name), bucket)
  }
  const rank = rankingQuestion.test(question)
  const metric = rank ? mfpRankingMetric(question) || 'milk_packs' : 'milk_packs'
  const rankMetric = (summary: MfpAnalytics) => metric === 'rows' ? summary.rows : metric === 'schools' ? summary.schools.count
    : metric === 'delivered' ? summary.delivered.value : metric === 'target' ? summary.target.value : summary.metrics[metric].value
  const metricLabel = metric === 'delivered' ? 'Associated contract delivered packs' : metric === 'target' ? 'Associated contract target packs' : metric.replaceAll('_', ' ')
  const data = [...buckets.values()].map(bucket => ({ ...bucket, summary: summarizeMfpRows(bucket.rows) }))
    .sort((a, b) => rank ? (rankMetric(b.summary) ?? -Infinity) - (rankMetric(a.summary) ?? -Infinity) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))
  const limit = rank ? 10 : 30
  return `**By ${group.replace('_', ' ')}**${rank ? ' (top 10 known totals; descending by ' + metricLabel + ')' : ''}\n\n| Group | Rows | Schools | Milk packs | Milk cost | Shipping/service fee | Total funds | ${metricLabel} |\n|---|---:|---:|---:|---:|---:|---:|---:|\n` + data.slice(0, limit).map(item =>
    `| ${cell(item.name)} | ${item.summary.rows} | ${item.summary.schools.count} | ${formatMfpTotal(item.summary.metrics.milk_packs)} | ${formatMfpTotal(item.summary.metrics.milk_cost, true)} | ${formatMfpTotal(item.summary.metrics.service_fee, true)} | ${formatMfpTotal(item.summary.metrics.total_funds_transferred, true)} | ${metric === 'rows' ? item.summary.rows : metric === 'schools' ? item.summary.schools.count : formatMfpTotal(metric === 'delivered' ? item.summary.delivered : metric === 'target' ? item.summary.target : item.summary.metrics[metric])} |`).join('\n') +
    `\n\n${data.length} group(s) total.${data.length > limit ? ` Showing ${limit}; narrow the table filters to see the remaining groups.` : ''} School counts use the name-based identity described in MFP Data and are not additive across groups. Missing amounts remain unavailable; subtotal amounts are marked partial. A combined school's cooperative label may contain multiple suppliers; its amounts cannot be allocated to each supplier separately. Associated contract deliveries count each represented contract once within a group, may overlap across groups, and are not school delivery allocations.`
}

export function normalizeMfpQuestion(question: string) {
  return question.toLowerCase().replace(/[?!.]/g, '').trim().replace(/\s+/g, ' ')
    // Normalize only an opening courtesy phrase; keep every substantive constraint.
    .replace(/^(?:(?:please|kindly)\s+)?(?:(?:can|could|would) you\s+)?(?:(?:please|kindly)\s+)?(?:(?:check|tell me|show me)\s+)?(?=(?:how many|how much|what is|what are|count|number of|total|sum|summarize|summary|break down|breakdown|compare|top|highest|largest|most|rank)\b)/, '')
    .replace(/\s+(in|into|across|from|for)\s+((the|this|these|all|current|currently|selected|checked|filtered)\s+)*(rows|records|entries|data|dataset|scope)$/, '')
}

/** Exact supported operations bypass the LLM; conditional questions never receive an unfiltered total. */
export function answerMfpQuestion(rows: MfpListRow[], question: string, summary = summarizeMfpRows(rows)): string | null {
  const q = normalizeMfpQuestion(question)
  // Only the current table scope is supported. Unknown words (e.g. a center name),
  // numbers or extra predicates must not turn into an answer for all rows.
  const scopeVocabulary = new Set(('how many what is the a an are of in from for across this these those current currently show selected checked filtered all scope rows row records record entries entry data dataset '
    + 'count number total unique elementary participating schools school included participating beneficiaries known milk packs delivered vs target completion rate and sum much cost column col u v w '
    + 'funds transferred shipping service fee fees admin amount break breakdown down by centers center centre centres regions region provinces province divisions division municipalities municipality type types raw whole skimmed skim sugar kg requirements cooperatives cooperative suppliers supplier '
    + 'compare funding sources source funders funder deped dswd lds highest top largest most rank volume liters litres summarize summary key metrics give me with zero or delayed deliveries').split(/\s+/))
  if (q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).some(word => !scopeVocabulary.has(word))) return null
  if (/\b(deped|dswd|lds)\b/.test(q) && !/^compare funding sources\s*\(deped vs dswd vs lds\)$/.test(q)) return null
  // No school-level delivery allocation or milk-type conversion by supplier is stored here.
  if (/delivered/.test(q) && /volume|liters|litres/.test(q)) return null
  if (rankingQuestion.test(q) && !mfpRankingMetric(q)) return null
  const conditional = /\b(with|without|where|whose|paid|unpaid|zero|delayed|over|under|above|below|more than|less than|greater than|at least|only)\b/.test(q)
  if (conditional && q !== 'show zero or delayed deliveries') return null
  if (q === 'show zero or delayed deliveries') return `${summary.zeroDeliveryContracts} represented contract/record delivery total(s) explicitly show zero; ${summary.unknownDeliveryContracts} are unknown.\n\n${deliveryAnswer(summary)}\n\nA delayed-delivery determination requires a verified due date and delivery history; zero or missing data alone does not establish a delay.`
  // Named constraints beyond the current filters must be resolved before an exact answer.
  const countShape = /^(how many|what is the (total|number|count)|count|number of|total)\b/.test(q)
  const requestedGroups = groups.filter(group => ({ center: /\bcent(?:er|re)s?\b/, region: /\bregions?\b/,
    province: /\bprovinces?\b/, division: /\bdivisions?\b/, municipality: /\bmunicipalit(?:y|ies)\b/, milk_type: /\bmilk types?\b/, funded_by: /funding sources?|funders?|deped vs/, cooperative: /cooperatives?|suppliers?/ }[group]).test(q))
  if ((/break\s?down|\bby\b|\bcompare\b/.test(q) || rankingQuestion.test(q)) && requestedGroups.length && !conditional) {
    return requestedGroups.map(group => groupedAnswer(rows, group, q)).join('\n\n')
  }
  const countEntity = q.replace(/^(how many|count(?: the)?|number of|total(?: number of)?|what is the (?:total(?: number)?|number|count)(?: of)?)\s+/, '')
    .replace(/\s+(are\s+)?(participating|included)$/, '').replace(/\s+are$/, '')
  if (countShape && /^((unique|elementary|participating)\s+)*schools?$/.test(countEntity)) return schoolAnswer(summary)
  if (countShape && /^(table\s+)?(records?|rows?|entries)$/.test(countEntity)) return `**${summary.rows.toLocaleString()} table rows** in this scope. Row count and unique-school count are different measures.`
  if (countShape && /\b(records?|rows?|entries)\b/.test(countEntity)) return null
  if (/^(summarize|summary|give (me )?(a )?summary)/.test(q)) {
    return `${schoolAnswer(summary)}\n\n- School milk packs: **${formatMfpTotal(summary.metrics.milk_packs)}**\n- Known beneficiaries: **${formatMfpTotal(summary.metrics.beneficiaries)}**\n- Milk cost: **${formatMfpTotal(summary.metrics.milk_cost, true)}**\n- Shipping/service fee: **${formatMfpTotal(summary.metrics.service_fee, true)}**\n- Total funds: **${formatMfpTotal(summary.metrics.total_funds_transferred, true)}**\n\n${deliveryAnswer(summary)}\n\nCombined Original/Add school beneficiaries use the original contract only. Unknown original counts are excluded and marked missing.`
  }
  if (!conditional && /^(total|what is|what are|how much|how many|sum)/.test(q)) {
    const fields: Array<[RegExp, MetricField, string]> = [[/beneficiar/, 'beneficiaries', 'Known beneficiaries'], [/milk cost|column\s*u\b|col\s*u\b/, 'milk_cost', 'Milk cost'], [/service fee|shipping|column\s*v\b|col\s*v\b/, 'service_fee', 'Shipping/service fee'], [/total funds|funds transferred|column\s*w\b|col\s*w\b/, 'total_funds_transferred', 'Total funds']]
    fields.push([/volume/, 'total_volume_requirements', 'Total volume requirements (L)'], [/raw milk/, 'raw_milk_liters', 'Raw milk (L)'], [/whole milk/, 'whole_milk_kg', 'Whole milk (kg)'], [/skim(?:med)? milk/, 'skimmed_milk_kg', 'Skimmed milk (kg)'], [/sugar/, 'sugar', 'Sugar (kg)'])
    const matching = fields.filter(([pattern]) => pattern.test(q))
    if (matching.length) return matching.map(([, field, label]) => `- ${label}: **${formatMfpTotal(summary.metrics[field], ['milk_cost', 'service_fee', 'total_funds_transferred'].includes(field))}**`).join('\n') + '\n\nKnown amounts/counts only. Beneficiaries for combined Original/Add entries use the original contract only.'
    if (/delivered|target|completion/.test(q)) return deliveryAnswer(summary)
    if (/milk packs/.test(q)) return `School milk packs: **${formatMfpTotal(summary.metrics.milk_packs)}**.`
  }
  return null
}

/** Only bounded verified facts go to the explanation model, never thousands of school rows. */
export function mfpExplanationFacts(summary: MfpAnalytics) {
  return { rowCount: summary.rows, schools: summary.schools, metrics: summary.metrics,
    contractTarget: summary.target, contractDelivered: summary.delivered, contractCompletionPercent: summary.completion,
    notes: ['Missing is not zero.', 'Beneficiaries on combined Original/Add entries use the original only.',
      'Contract totals count represented contracts once, not delivery allocations to schools.',
      'Only these aggregates are available. For names, conditions, or breakdowns not provided, say the answer is unavailable and request appropriate table filters; never use scope totals as answers to a narrower question.'] }
}
