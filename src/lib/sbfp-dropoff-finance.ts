import { encoderCanAccessSbfpCenter } from './center-aliases'

export const MAX_DROPOFF_AMOUNT = 999_999_999_999.99
export const DROPOFF_MONEY_FIELDS = ['contract_amount', 'service_fee'] as const
export type DropoffMoneyField = typeof DROPOFF_MONEY_FIELDS[number]
export const MFP_SCHOOL_FINANCE_FIELDS = ['milk_cost', 'service_fee', 'total_funds_transferred'] as const

export type DropoffFinancials = {
  contract_amount?: number | null
  service_fee?: number | null
}

/** Keep missing allocations distinct from an explicitly encoded zero. */
export function parseDropoffAmount(value: unknown): { value: number | null; error: string | null } {
  if (value == null || value === '') return { value: null, error: null }
  if ((typeof value !== 'number' && typeof value !== 'string') ||
    !/^\d+(\.\d{1,2})?$/.test(String(value)) ||
    !Number.isFinite(Number(value)) || Number(value) > MAX_DROPOFF_AMOUNT) {
    return { value: null, error: 'Enter a nonnegative amount with at most two decimal places (maximum 999,999,999,999.99).' }
  }
  return { value: Number(value), error: null }
}

export function canEditDropoffFinance(
  profile: { role?: string | null; center?: string | null } | null,
  center: string,
): boolean {
  return profile?.role === 'super_admin' ||
    (profile?.role === 'encoder' && encoderCanAccessSbfpCenter(profile.center, center))
}

function cents(value: number | null | undefined): number {
  return Math.round((Number(value) || 0) * 100)
}

/** Only encoded school amounts replace existing masterlist money. */
export function buildDropoffFinancialPatch(
  source: DropoffFinancials,
  existing?: { milk_cost?: number | null; service_fee?: number | null } | null,
): { milk_cost?: number; service_fee?: number; total_funds_transferred?: number } {
  const patch: { milk_cost?: number; service_fee?: number; total_funds_transferred?: number } = {}
  if (source.contract_amount != null) patch.milk_cost = source.contract_amount
  if (source.service_fee != null) patch.service_fee = source.service_fee
  if (source.contract_amount != null || source.service_fee != null) {
    patch.total_funds_transferred = (cents(patch.milk_cost ?? existing?.milk_cost) +
      cents(patch.service_fee ?? existing?.service_fee)) / 100
  }
  return patch
}

/** Reconcile exact procurement IDs: PM/SM/lots with similar names stay separate. */
export function reconcileDropoffFinance(
  parents: Array<{ id: string; contract_amount?: number | null }>,
  schools: Array<DropoffFinancials & { sbfp_data_id?: string | null; include_in_masterlist?: boolean }>,
  selectedSdo = 'ALL',
) {
  const scopedParents = selectedSdo === 'ALL' ? parents : parents.filter(p => p.id === selectedSdo)
  const parentIds = new Set(scopedParents.map(p => p.id))
  const included = schools.filter(s => s.include_in_masterlist !== false)
  const scoped = included.filter(s => s.sbfp_data_id && parentIds.has(s.sbfp_data_id))
  const contract = scopedParents.reduce((sum, p) => sum + cents(p.contract_amount), 0)
  const allocated = scoped.reduce((sum, s) => sum + cents(s.contract_amount), 0)
  const shipping = scoped.reduce((sum, s) => sum + cents(s.service_fee), 0)
  const missingMilk = scoped.filter(s => s.contract_amount == null).length
  const missingShipping = scoped.filter(s => s.service_fee == null).length
  const missingContracts = scopedParents.filter(p => p.contract_amount == null).length
  const unlinked = selectedSdo === 'ALL'
    ? included.filter(s => !s.sbfp_data_id || !parentIds.has(s.sbfp_data_id)).length : 0
  const difference = contract - allocated
  const overallocatedContracts = scopedParents.filter(parent => scoped
    .filter(school => school.sbfp_data_id === parent.id)
    .reduce((sum, school) => sum + cents(school.contract_amount), 0) > cents(parent.contract_amount)).length
  const underallocatedContracts = scopedParents.filter(parent => scoped
    .filter(school => school.sbfp_data_id === parent.id)
    .reduce((sum, school) => sum + cents(school.contract_amount), 0) < cents(parent.contract_amount)).length
  return {
    contract: contract / 100,
    allocated: allocated / 100,
    shipping: shipping / 100,
    total: (allocated + shipping) / 100,
    difference: difference / 100,
    schools: scoped.length,
    missingMilk,
    missingShipping,
    missingContracts,
    unlinked,
    overallocatedContracts,
    underallocatedContracts,
    status: overallocatedContracts ? 'Overallocated' : !scoped.length || missingMilk || missingContracts || unlinked
      ? 'Incomplete' : difference > 0 ? 'Underallocated' : 'Matched',
  }
}
