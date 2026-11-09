export const MAX_SCHOOL_COUNT = 2_147_483_647

export type SchoolPackInputs = {
  beneficiaries?: number | null
  feeding_days?: number | null
}

export function parseSchoolCount(value: unknown): number | null {
  if (value == null || value === '') return 0
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) return null
  const count = Number(value)
  return Number.isSafeInteger(count) && count <= MAX_SCHOOL_COUNT ? count : null
}

/** Use the two school inputs directly; explicit zero never falls back to an SDO default. */
export function calculateSchoolMilkPacks(school: SchoolPackInputs): number | null {
  const beneficiaries = parseSchoolCount(school.beneficiaries)
  const days = parseSchoolCount(school.feeding_days)
  if (beneficiaries == null || days == null) return null
  const packs = beneficiaries * days
  return Number.isSafeInteger(packs) && packs <= MAX_SCHOOL_COUNT ? packs : null
}
