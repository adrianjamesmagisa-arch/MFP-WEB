import { encoderCanAccessSbfpCenter } from './center-aliases'
import { inferSbfpMilkType, normalizeSbfpMilkType, resolvePackUnitPrice } from './sbfp-pack-price'
import { calculateSchoolMilkPacks, type SchoolPackInputs } from './sbfp-dropoff-packs'

export const MAX_DROPOFF_AMOUNT = 999_999_999_999.99
export const DROPOFF_MONEY_FIELDS = ['service_fee'] as const
export type DropoffMoneyField = typeof DROPOFF_MONEY_FIELDS[number]
export const MFP_SCHOOL_FINANCE_FIELDS = ['milk_cost', 'service_fee', 'total_funds_transferred'] as const

export type DropoffFinancials = {
  contract_amount?: number | null
  service_fee?: number | null
}

export type SchoolPriceSource = {
  id?: string
  year?: number
  center?: string
  sdo?: string | null
  remarks?: string | null
  milk_type?: unknown
  pack_unit_price?: number | null
}
export type SchoolPriceInput = {
  sbfp_data_id?: string | null
  year?: number
  center?: string
  milk_packs?: number | null
}

/** Exact decimal multiplication, rounded to cents like PostgreSQL numeric round(). */
function packCost(packs: number, price: number): number | null {
  const match = String(price).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match) return null
  const fraction = match[2] || ''
  const scale = fraction.length - Number(match[3] || 0)
  let value = BigInt(match[1] + fraction) * BigInt(packs) * BigInt(100)
  if (scale > 0) {
    const divisor = BigInt(10) ** BigInt(scale)
    value = (value + divisor / BigInt(2)) / divisor
  } else value *= BigInt(10) ** BigInt(-scale)
  return value > BigInt(99_999_999_999_999) ? null : Number(value) / 100
}

/** Never borrow a price from a similarly named SDO, a different year, or another center. */
export function calculateSchoolContract(school: SchoolPriceInput, parent?: SchoolPriceSource | null) {
  if (!school.sbfp_data_id || !parent?.id || parent.id !== school.sbfp_data_id ||
    (parent.year != null && school.year != null && parent.year !== school.year) ||
    (parent.center && school.center && !encoderCanAccessSbfpCenter(parent.center, school.center))) {
    return { unitPrice: null, contractAmount: null, reason: 'Needs an SDO link' }
  }
  const milkType = normalizeSbfpMilkType(parent.milk_type) || inferSbfpMilkType(parent.sdo, parent.remarks)
  const unitPrice = resolvePackUnitPrice({ milk_type: milkType, pack_unit_price: parent.pack_unit_price })
  if (unitPrice == null) return { unitPrice: null, contractAmount: null, reason: 'Needs an SDO milk type / price' }
  const packs = school.milk_packs
  if (packs == null || !Number.isSafeInteger(packs) || packs < 0 || packs > 2_147_483_647) {
    return { unitPrice, contractAmount: null, reason: 'Needs a valid milk-pack count' }
  }
  const contractAmount = packCost(packs, unitPrice)
  return { unitPrice, contractAmount, reason: contractAmount == null ? 'Calculated amount exceeds the supported range' : null }
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

/** Milk cost always comes from school packs and the linked SDO, never a manual allocation. */
export function buildDropoffFinancialPatch(
  source: DropoffFinancials & SchoolPriceInput & SchoolPackInputs,
  parent?: SchoolPriceSource | null,
): { milk_cost: number | null; service_fee?: number; total_funds_transferred: number | null } {
  const milkCost = calculateSchoolContract({ ...source, milk_packs: calculateSchoolMilkPacks(source) }, parent).contractAmount
  const shipping = source.service_fee ?? null
  const patch: { milk_cost: number | null; service_fee?: number; total_funds_transferred: number | null } = {
    milk_cost: milkCost,
    total_funds_transferred: milkCost == null || shipping == null ? null : (cents(milkCost) + cents(shipping)) / 100,
  }
  if (source.service_fee != null) patch.service_fee = source.service_fee
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
