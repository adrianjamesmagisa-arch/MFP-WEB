import { sbfpNavCenter } from '@/lib/center-aliases'
import { stripMilkTypeFromSdoName } from '@/lib/sbfp-dropoff-sync'
import type { MfpListRow } from '@/lib/mfp-sbfp-source'

export interface SchoolContractSource {
  id: string
  label: string
  target: number | null
  delivered: number | null
}

const textKey = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const additionSuffix = /\s+add\.?(?:\s+\d+)?$/i
const numericFields = ['milk_packs', 'total_volume_requirements', 'raw_milk_liters', 'whole_milk_kg',
  'skimmed_milk_kg', 'sugar', 'milk_cost', 'service_fee'] as const
const commonFields = ['region', 'province', 'municipality', 'feeding_days', 'batch', 'price',
  'mode_of_procurement', 'supplier_id', 'moa_signing', 'fund_transfer', 'liquidation'] as const
const hasValue = (value: unknown) => value != null && !['', 'n/a', '—'].includes(textKey(value))
const isAdditionalContract = (row: MfpListRow) => additionSuffix.test(stripMilkTypeFromSdoName(row.source_contract_label || ''))

/** Combine only separate original/additional contracts for the same school and known milk type. */
export function combineAdditionalSchoolRows(rows: MfpListRow[]): MfpListRow[] {
  const groups = new Map<string, MfpListRow[]>()
  for (const row of rows) {
    const label = stripMilkTypeFromSdoName(row.source_contract_label || '')
    const family = textKey(label.replace(additionSuffix, ''))
    const school = textKey(row.elementary_school)
    const key = row.source_contract_id && row.milk_type && family && school
      ? JSON.stringify([row.year, row.funded_by, textKey(sbfpNavCenter(row.center)), family, school, row.milk_type])
      : row.id
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].flatMap(group => {
    if (group.length < 2 || !group.some(isAdditionalContract) ||
      new Set(group.map(row => row.source_contract_id)).size !== group.length ||
      ['region', 'province', 'municipality'].some(field =>
        new Set(group.map(row => row[field]).filter(hasValue).map(textKey)).size > 1)) {
      // An addition never supplies the original beneficiary count, even when filters leave it alone.
      return group.map(row => isAdditionalContract(row) ? { ...row, beneficiaries: null } : row)
    }

    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id))
    const first = ordered[0]
    const contracts = ordered.flatMap(row => row.source_contracts || [])
    const originals = ordered.filter(row => !isAdditionalContract(row))
    const result: MfpListRow = { ...first,
      id: `sbfp-combined:${JSON.stringify(ordered.map(row => row.source_dropoff_id))}`,
      source_dropoff_id: null,
      source_contract_id: undefined,
      source_contract_label: undefined,
      source_dropoff_ids: ordered.flatMap(row => row.source_dropoff_id ? [row.source_dropoff_id] : []),
      source_contracts: contracts,
      mfp_link_status: group.some(row => row.mfp_link_status === 'missing') ? 'missing' : 'linked',
      missing_source_links: group.reduce((total, row) => total + (row.mfp_link_status === 'missing' ? 1 : 0), 0),
      combined_fields: [],
      beneficiaries: originals.length === 1 ? originals[0].beneficiaries ?? null : null,
    }
    for (const field of numericFields) {
      const values = ordered.map(row => row[field])
      const scale = ['milk_cost', 'service_fee'].includes(field) ? 100 : 10000
      result[field] = values.every((value): value is number => typeof value === 'number' && Number.isFinite(value))
        ? values.reduce((total, value) => total + Math.round(value * scale), 0) / scale : null
    }
    result.total_funds_transferred = result.milk_cost != null && result.service_fee != null
      ? Math.round((Number(result.milk_cost) + Number(result.service_fee)) * 100) / 100 : null
    for (const field of commonFields) {
      const values = [...new Map(ordered.map(row => row[field]).filter(hasValue).map(value => [textKey(value), value])).values()]
      Object.assign(result, { [field]: values.length === 1 ? values[0] : null })
      if (values.length > 1) result.combined_fields?.push(field)
    }
    const suppliers = [...new Set(ordered.map(row => row.cooperatives?.name).filter(Boolean))]
    result.cooperatives = suppliers.length ? { name: suppliers.join('; ') } : null
    for (const field of ['date_started', 'date_completed', 'created_at'] as const) {
      const dates = ordered.map(row => row[field]).filter((value): value is string => !!value).sort()
      result[field] = (field === 'date_completed' ? dates.at(-1) : dates[0]) || null
    }
    result.target_milk_packs_to_deliver = sumContractValue(contracts, 'target')
    result.total_milk_packs_delivered = sumContractValue(contracts, 'delivered')
    return [result]
  })
}

/** Contract totals repeat on school rows; count each contract only once. */
export function sumContractValue(contracts: SchoolContractSource[], field: 'target' | 'delivered'): number {
  return [...new Map(contracts.map(contract => [contract.id, contract])).values()]
    .reduce((total, contract) => total + (contract[field] ?? 0), 0)
}
