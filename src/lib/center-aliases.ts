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

/** Canonical SBFP nav slug for a profile center (sidebar / URLs). */
export function sbfpNavCenter(profileCenter: string | null | undefined): string | null {
  if (!profileCenter) return null
  if (isNizFamily(profileCenter)) return 'NHQ'
  return profileCenter.trim()
}

/** Whether an encoder may view this SBFP center page / row. */
export function encoderCanAccessSbfpCenter(
  profileCenter: string | null | undefined,
  targetCenter: string
): boolean {
  if (!profileCenter) return false
  const allowed = new Set(
    [...sbfpCenterAliases(profileCenter), ...mfpCenterAliases(profileCenter)].map(c =>
      c.toUpperCase()
    )
  )
  return allowed.has(targetCenter.trim().toUpperCase())
}

/** Display label on reports. */
export function centerDisplayLabel(center: string): string {
  if (isNizFamily(center)) return 'NHQGP (NIZ)'
  return center
}
