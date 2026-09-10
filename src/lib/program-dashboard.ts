import { PCC_CENTERS } from '@/lib/types'
import { rowMatchesMonitoringProgram, type MonitoringProgramId } from '@/lib/monitoring-programs'
import { packsForMonth, totalPacksDelivered, type SbfpRawMilkRow } from '@/lib/sbfp-raw-milk'
import type { ProgramDropoffRow, ProgramProcurementRow } from '@/lib/program-dropoff-sync'

type SupabaseLike = { from: (table: string) => any }

export type ProgramDashFilters = {
  year?: number
  month?: number
  center?: string
}

export type ProgramDashStatus = {
  prep: number
  ongoing: number
  awarded: number
  done: number
  failed: number
}

export type ProgramDashCenterRow = {
  center: string
  provinces: number
  municipalities: number
  beneficiaries: number
  targetPacks: number
  deliveredPacks: number
  amount: number
}

export type ProgramDashMonthPoint = {
  month: number
  deliveredPacks: number
}

export type ProgramDashboardStats = {
  provinces: number
  municipalities: number
  beneficiaries: number
  targetPacks: number
  deliveredPacks: number
  amount: number
  masterlistRecords: number
  status: ProgramDashStatus
  byCenter: ProgramDashCenterRow[]
  byMonth: ProgramDashMonthPoint[]
}

function emptyStatus(): ProgramDashStatus {
  return { prep: 0, ongoing: 0, awarded: 0, done: 0, failed: 0 }
}

function tallyStatus(status: string | null | undefined, acc: ProgramDashStatus) {
  const st = (status || '').toUpperCase()
  if (st === 'FOR PREPARATION') acc.prep++
  else if (st.includes('ONGOING')) acc.ongoing++
  else if (st.includes('AWARDED')) acc.awarded++
  else if (st === 'DONE' || st === 'COMPLETED') acc.done++
  else if (st === 'FAILED') acc.failed++
}

function deliveredForFilter(row: ProgramProcurementRow, month?: number, year?: number) {
  const raw = row as unknown as SbfpRawMilkRow
  if (month != null) return packsForMonth(raw, month, { year })
  return totalPacksDelivered(raw) || Number(row.packs_delivered) || 0
}

export async function loadProgramDashboardStats(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  filters: ProgramDashFilters,
): Promise<ProgramDashboardStats> {
  let procQ = supabase.from('mfp_program_procurement').select('*').eq('program', programId)
  let dropQ = supabase.from('mfp_program_dropoffs').select('*').eq('program', programId)
  let mfpQ = supabase
    .from('mfp_data')
    .select('center,year,beneficiaries,milk_packs,target_milk_packs_to_deliver,total_milk_packs_delivered,funded_by,date_started')
    .range(0, 19999)

  if (filters.year) {
    procQ = procQ.eq('year', filters.year)
    dropQ = dropQ.eq('year', filters.year)
    mfpQ = mfpQ.eq('year', filters.year)
  }
  if (filters.center) {
    procQ = procQ.eq('center', filters.center)
    dropQ = dropQ.eq('center', filters.center)
    mfpQ = mfpQ.eq('center', filters.center)
  }

  const [{ data: procRaw, error: procErr }, { data: dropRaw, error: dropErr }, { data: mfpRaw }] =
    await Promise.all([procQ, dropQ, mfpQ])

  const procurement = (!procErr && procRaw ? procRaw : []) as ProgramProcurementRow[]
  const dropoffs = (!dropErr && dropRaw ? dropRaw : []) as ProgramDropoffRow[]
  type MfpDashRow = {
    center?: string | null
    year?: number | null
    beneficiaries?: number | null
    milk_packs?: number | null
    target_milk_packs_to_deliver?: number | null
    total_milk_packs_delivered?: number | null
    funded_by?: string | null
    date_started?: string | null
  }
  const masterlist = ((mfpRaw || []) as MfpDashRow[])
    .filter(r => rowMatchesMonitoringProgram(r.funded_by, programId))
    .filter(r => {
      if (!filters.month) return true
      if (!r.date_started) return false
      const d = new Date(r.date_started)
      return d.getMonth() + 1 === filters.month
    })

  const centers = filters.center ? [filters.center] : [...PCC_CENTERS]
  const byCenter = new Map<string, ProgramDashCenterRow>()
  for (const c of centers) {
    byCenter.set(c, {
      center: c,
      provinces: 0,
      municipalities: 0,
      beneficiaries: 0,
      targetPacks: 0,
      deliveredPacks: 0,
      amount: 0,
    })
  }

  const status = emptyStatus()
  for (const r of procurement) {
    const key = String(r.center || '').trim()
    if (!byCenter.has(key)) {
      byCenter.set(key, {
        center: key,
        provinces: 0,
        municipalities: 0,
        beneficiaries: 0,
        targetPacks: 0,
        deliveredPacks: 0,
        amount: 0,
      })
    }
    const row = byCenter.get(key)!
    row.provinces++
    row.targetPacks += Number(r.packs_to_deliver) || 0
    row.deliveredPacks += deliveredForFilter(r, filters.month, filters.year || r.year)
    row.amount += Number(r.amount || r.contract_amount) || 0
    tallyStatus(r.procurement_status, status)
  }

  for (const r of dropoffs) {
    const key = String(r.center || '').trim()
    if (!byCenter.has(key)) continue
    const row = byCenter.get(key)!
    row.municipalities++
    row.beneficiaries += Number(r.beneficiaries) || 0
  }

  for (const r of masterlist) {
    const key = String(r.center || '').trim()
    if (!byCenter.has(key)) continue
    const row = byCenter.get(key)!
    if (row.beneficiaries === 0) row.beneficiaries += Number(r.beneficiaries) || 0
    if (row.targetPacks === 0) row.targetPacks += Number(r.target_milk_packs_to_deliver || r.milk_packs) || 0
    if (row.deliveredPacks === 0) row.deliveredPacks += Number(r.total_milk_packs_delivered) || 0
  }

  const rows = [...byCenter.values()].filter(r =>
    filters.center ? r.center === filters.center : true,
  )

  const byMonth: ProgramDashMonthPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    deliveredPacks: 0,
  }))
  for (const r of procurement) {
    for (let m = 1; m <= 12; m++) {
      if (filters.month && filters.month !== m) continue
      byMonth[m - 1].deliveredPacks += packsForMonth(r as unknown as SbfpRawMilkRow, m, {
        year: filters.year || r.year,
      })
    }
  }

  return {
    provinces: rows.reduce((s, r) => s + r.provinces, 0),
    municipalities: rows.reduce((s, r) => s + r.municipalities, 0),
    beneficiaries: rows.reduce((s, r) => s + r.beneficiaries, 0),
    targetPacks: rows.reduce((s, r) => s + r.targetPacks, 0),
    deliveredPacks: rows.reduce((s, r) => s + r.deliveredPacks, 0),
    amount: rows.reduce((s, r) => s + r.amount, 0),
    masterlistRecords: masterlist.length,
    status,
    byCenter: rows.sort((a, b) => b.beneficiaries - a.beneficiaries || b.targetPacks - a.targetPacks || a.center.localeCompare(b.center)),
    byMonth,
  }
}
