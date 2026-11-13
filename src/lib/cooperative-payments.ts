import { sumPaymentEntries, type SbfpReportSourceRow } from '@/lib/sbfp-report-sync'
import { uniqueSdoCountKey } from '@/lib/sbfp-dropoff-sync'

export type CooperativePaymentStatus = 'Fully paid' | 'Partially paid' | 'Contract amount missing'
export interface CooperativePaymentContract {
  id: string
  sdo: string
  center: string
  contractAmount: number | null
  paid: number
  balance: number | null
}
export interface CooperativePaymentRow {
  id: string
  name: string
  centers: string[]
  sdoCount: number
  contractAmount: number | null
  paid: number
  balance: number | null
  status: CooperativePaymentStatus
  contracts: CooperativePaymentContract[]
}
export interface CooperativePayments {
  rows: CooperativePaymentRow[]
  paidCount: number
  fullyPaidCount: number
  partiallyPaidCount: number
  unknownContractCount: number
  totalPaid: number
  unassignedCount: number
  unassignedPaid: number
}

/** Read-only summary of contracts already selected by the report's filters. */
export function summarizeCooperativePayments(records: SbfpReportSourceRow[]): CooperativePayments {
  const groups = new Map<string, { name: string; contracts: CooperativePaymentContract[]; sdos: Set<string> }>()
  let totalPaidCents = 0
  let unassignedPaidCents = 0
  let unassignedCount = 0
  records.forEach((record, index) => {
    // Match Amount paid in Implementation Status, including encoded adjustments.
    const paidCents = Math.round(sumPaymentEntries(record.payment_entries) * 100)
    totalPaidCents += paidCents
    const supplier = record.supplier_id?.trim()
    if (!supplier) {
      if (paidCents !== 0) { unassignedCount++; unassignedPaidCents += paidCents }
      return
    }
    const rawAmount = record.contract_amount
    const contractCents = typeof rawAmount === 'number' && Number.isFinite(rawAmount) && rawAmount > 0
      ? Math.round(rawAmount * 100) : null
    const name = record.cooperatives?.name?.trim()
    const group = groups.get(supplier) || { name: '', contracts: [], sdos: new Set<string>() }
    if (name && !group.name) group.name = name
    group.contracts.push({ id: record.id || `row-${index}`, sdo: record.sdo?.trim() || 'SDO not specified',
      center: record.center?.trim() || 'Center not specified', contractAmount: contractCents == null ? null : contractCents / 100,
      paid: paidCents / 100, balance: contractCents == null ? null : (contractCents - paidCents) / 100 })
    const key = uniqueSdoCountKey(record.sdo, record.center) || `row-${index}`
    group.sdos.add(key)
    groups.set(supplier, group)
  })

  const rows: CooperativePaymentRow[] = []
  for (const [id, group] of groups) {
    const paidCents = group.contracts.reduce((sum, contract) => sum + Math.round(contract.paid * 100), 0)
    if (paidCents <= 0) continue
    const unknown = group.contracts.some(contract => contract.contractAmount == null)
    const contractCents = group.contracts.reduce((sum, contract) => sum + Math.round((contract.contractAmount || 0) * 100), 0)
    const settled = group.contracts.every(contract => contract.balance != null && contract.balance <= 0)
    rows.push({ id, name: group.name || 'Cooperative name unavailable',
      centers: [...new Set(group.contracts.map(contract => contract.center))].sort(), sdoCount: group.sdos.size,
      contractAmount: unknown ? null : contractCents / 100, paid: paidCents / 100,
      balance: unknown ? null : (contractCents - paidCents) / 100,
      status: unknown ? 'Contract amount missing' : settled ? 'Fully paid' : 'Partially paid', contracts: group.contracts })
  }
  rows.sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name))
  return { rows, paidCount: rows.length,
    fullyPaidCount: rows.filter(row => row.status === 'Fully paid').length,
    partiallyPaidCount: rows.filter(row => row.status === 'Partially paid').length,
    unknownContractCount: rows.filter(row => row.status === 'Contract amount missing').length,
    totalPaid: totalPaidCents / 100, unassignedCount, unassignedPaid: unassignedPaidCents / 100 }
}

/** Spreadsheet-safe CSV for the exact cooperative rows shown in the report. */
export function cooperativePaymentsCsv(summary: CooperativePayments, { entitySingular = 'SDO', entityPlural = 'SDOs' }: {
  entitySingular?: string
  entityPlural?: string
} = {}): string {
  const escape = (value: unknown) => {
    let text = value == null ? '' : String(value)
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  const rows = [
    ['Cooperative', 'Centers', entityPlural, 'Contracts', 'Contracted amount (PHP)', 'Amount paid (PHP)', 'Remaining to pay (PHP)', 'Payment status', `${entitySingular} contracts`],
    ...summary.rows.map(row => [row.name, row.centers.join('; '), row.sdoCount, row.contracts.length,
      row.contractAmount, row.paid, row.balance, row.status, row.contracts.map(contract => `${contract.center}: ${contract.sdo}`).join('; ')]),
  ]
  return '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')
}
