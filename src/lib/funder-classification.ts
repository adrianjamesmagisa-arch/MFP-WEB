/**
 * How each funder class uses the same mfp_data masterlist with different meaning.
 * Not separate tables — filter by funded_by (B) in MFP Data / PIMD.
 */

import type { MonitoringProgramId } from '@/lib/monitoring-programs'

export type FunderWorkspaceSchema = 'deped-sbfp' | 'dswd-moa' | 'generic-area'

export const FUNDER_WORKSPACE_SCHEMA: Record<MonitoringProgramId | 'deped', FunderWorkspaceSchema> = {
  deped: 'deped-sbfp',
  dswd: 'dswd-moa',
  lds: 'generic-area',
  lgu: 'generic-area',
  others: 'generic-area',
}

/** DepEd/SBFP: division = SDO, elementary_school = drop-off school. */
export const DEPED_FIELD_HINTS = {
  division: 'Schools Division Office (SDO)',
  elementary_school: 'Elementary school / drop-off',
  municipality: 'Municipality (optional)',
} as const

/** DSWD MOA (e.g. Region IV-B): province + municipality rows; SM 180 ml; ₱/child/day. */
export const DSWD_FIELD_HINTS = {
  province: 'Province (MOA column)',
  municipality: 'Municipality / city (MOA column)',
  division: 'Leave blank — not an DepEd SDO',
  elementary_school: 'Optional label (often same as municipality)',
  beneficiaries: 'Target # of children',
} as const

export function workspaceSchemaForProgram(programId: MonitoringProgramId): FunderWorkspaceSchema {
  return FUNDER_WORKSPACE_SCHEMA[programId]
}
