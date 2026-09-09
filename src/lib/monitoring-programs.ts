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

export const PROGRAM_MONTHS: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'January', short: 'Jan' },
  { value: 2, label: 'February', short: 'Feb' },
  { value: 3, label: 'March', short: 'Mar' },
  { value: 4, label: 'April', short: 'Apr' },
  { value: 5, label: 'May', short: 'May' },
  { value: 6, label: 'June', short: 'Jun' },
  { value: 7, label: 'July', short: 'Jul' },
  { value: 8, label: 'August', short: 'Aug' },
  { value: 9, label: 'September', short: 'Sep' },
  { value: 10, label: 'October', short: 'Oct' },
  { value: 11, label: 'November', short: 'Nov' },
  { value: 12, label: 'December', short: 'Dec' },
]

export function programMonthLabel(month: number, year?: number): string {
  const m = PROGRAM_MONTHS.find(x => x.value === month)?.label || `Month ${month}`
  return year ? `${m} ${year}` : m
}

export function programMonthStartDate(year: number, month: number): string | null {
  if (!year || !month || month < 1 || month > 12) return null
  return `${year}-${String(month).padStart(2, '0')}-01`
}
