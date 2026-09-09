export type MonitoringProgramId = 'dswd' | 'lds' | 'lgu' | 'others'

export const STANDARD_FUNDERS = ['DepEd', 'DSWD', 'LDS', 'LGU'] as const

/** Serializable config (safe to pass Server → Client). Icons live in client components only. */
export type MonitoringProgramConfig = {
  id: MonitoringProgramId
  label: string
  shortLabel: string
  subtitle: string
  /** Primary funded_by for new records */
  fundedBy: string
  accent: string
  pimdFunder: string
  summaryHref: string
}

export const MONITORING_PROGRAMS: Record<MonitoringProgramId, MonitoringProgramConfig> = {
  dswd: {
    id: 'dswd',
    label: 'DSWD Monitoring',
    shortLabel: 'DSWD',
    subtitle: 'DSWD Supplementary Feeding Program',
    fundedBy: 'DSWD',
    accent: '#15803d',
    pimdFunder: 'DSWD',
    summaryHref: '/reports/summary-dswd',
  },
  lds: {
    id: 'lds',
    label: 'LDS Monitoring',
    shortLabel: 'LDS',
    subtitle: 'LDS Church-affiliated feeding program',
    fundedBy: 'LDS',
    accent: '#7c3aed',
    pimdFunder: 'LDS',
    summaryHref: '/reports/summary-lds',
  },
  lgu: {
    id: 'lgu',
    label: 'LGU Monitoring',
    shortLabel: 'LGU',
    subtitle: 'Local government unit feeding program',
    fundedBy: 'LGU',
    accent: '#0369a1',
    pimdFunder: 'LGU',
    summaryHref: '/reports/pimd',
  },
  others: {
    id: 'others',
    label: 'Others Monitoring',
    shortLabel: 'Others',
    subtitle: 'Other funders (masterlist)',
    fundedBy: 'Others',
    accent: '#64748b',
    pimdFunder: '',
    summaryHref: '/reports/pimd',
  },
}

export const MONITORING_PROGRAM_LIST = Object.values(MONITORING_PROGRAMS)

export function parseMonitoringProgram(value: string | undefined | null): MonitoringProgramId | null {
  const v = String(value || '').toLowerCase()
  if (v === 'dswd' || v === 'lds' || v === 'lgu' || v === 'others') return v
  return null
}

/** Row matches this monitoring program’s masterlist scope. */
export function rowMatchesMonitoringProgram(
  fundedBy: string | null | undefined,
  programId: MonitoringProgramId,
): boolean {
  const raw = String(fundedBy || '').trim()
  if (programId === 'others') {
    if (!raw) return true
    const n = raw.toLowerCase()
    return !STANDARD_FUNDERS.some(f => f.toLowerCase() === n)
  }
  return raw === MONITORING_PROGRAMS[programId].fundedBy
}

export function monitoringBasePath(programId: MonitoringProgramId): string {
  return `/monitoring/${programId}`
}

export function monitoringCenterPath(programId: MonitoringProgramId, center: string): string {
  return `${monitoringBasePath(programId)}/center/${encodeURIComponent(center)}`
}
