/**
 * NIZ (MFP / UI label NHQGP (NIZ)) and NHQ (SBFP Excel tab
 * "NHQ PROCUREMENT ACTIVITIES") are the same operational center.
 */
const NIZ_FAMILY = ['NIZ', 'NHQ', 'NHQGP (NIZ)', 'NHQGP'] as const

export function isNizFamily(center: string | null | undefined): boolean {
  if (!center) return false
  const c = center.trim().toUpperCase()
  return NIZ_FAMILY.some(a => a.toUpperCase() === c)
}

/** Center values to match on mfp_data when the UI filter is NIZ / NHQGP (NIZ). */
export function mfpCenterAliases(center: string): string[] {
  if (isNizFamily(center)) return ['NIZ', 'NHQGP (NIZ)']
  return [center]
}

/** Center values to match on sbfp_* tables (Excel uses NHQ). */
export function sbfpCenterAliases(center: string): string[] {
  if (isNizFamily(center)) return ['NHQ', 'NIZ', 'NHQGP (NIZ)']
  return [center]
}

/** Display label on reports. */
export function centerDisplayLabel(center: string): string {
  if (isNizFamily(center)) return 'NHQGP (NIZ)'
  return center
}
