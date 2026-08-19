import { formatCurrency, formatNumber } from '@/lib/utils'

export const getAvg = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0

export const valOrDash = (v: number | string | undefined | null) => {
  if (v === undefined || v === null || v === 0 || v === '') return '-'
  if (typeof v === 'number') return formatNumber(v)
  return v
}

export const curOrDash = (v: number | undefined | null) => {
  if (!v) return '-'
  return formatCurrency(v).replace('₱', '')
}

export function fiscalYearToSchoolYear(fiscalYear: number): string {
  return `SY ${fiscalYear}-${fiscalYear + 1}`
}
