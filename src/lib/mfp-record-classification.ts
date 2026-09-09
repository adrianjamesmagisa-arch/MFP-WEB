/**
 * Masterlist classification by funded_by — same mfp_data table, different row shape.
 * DepEd (SBFP): division = SDO, elementary_school = drop-off school.
 * DSWD: province + municipality only; division & elementary_school always N/A.
 */

export const MFP_GEO_NA = 'N/A'

export type MfpRecordClass = 'deped_sbfp' | 'dswd' | 'lds' | 'lgu' | 'others'

export function mfpRecordClass(fundedBy: string | null | undefined): MfpRecordClass {
  const f = String(fundedBy || '').trim()
  if (f === 'DepEd') return 'deped_sbfp'
  if (f === 'DSWD') return 'dswd'
  if (f === 'LDS') return 'lds'
  if (f === 'LGU') return 'lgu'
  return 'others'
}

/** Fields enforced when saving DSWD monitoring / masterlist rows. */
export function classifyDswdMasterlistPatch<T extends Record<string, unknown>>(
  patch: T,
): T & { funded_by: 'DSWD'; division: string; elementary_school: string } {
  return {
    ...patch,
    funded_by: 'DSWD',
    division: MFP_GEO_NA,
    elementary_school: MFP_GEO_NA,
  }
}

/** Contract amount for DSWD MOA col 5 — stored on masterlist total funds column. */
export function dswdContractAmount(row: {
  total_funds_transferred?: number | null
  milk_cost?: number | null
}): number {
  const funds = Number(row.total_funds_transferred) || 0
  if (funds > 0) return funds
  return Number(row.milk_cost) || 0
}

export function isGeoNa(value: string | null | undefined): boolean {
  const v = String(value || '').trim()
  return !v || v.toUpperCase() === 'N/A'
}
