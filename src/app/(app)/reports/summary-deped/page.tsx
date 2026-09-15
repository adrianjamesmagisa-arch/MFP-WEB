import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { SummaryDepEdClient } from './SummaryDepEdClient'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { sbfpCenterAliases } from '@/lib/center-aliases'
import { resolveReportYearFilter } from '@/lib/report-year'
import { MIN_DATA_YEAR } from '@/lib/app-years'
import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import {
  incomeForMonth,
  packsForMonth,
  sumRowIncome,
  totalPacksDelivered,
} from '@/lib/sbfp-raw-milk'

/** SBFP SDO procurement (column K = beneficiaries_pm) — not mfp_data masterlist. */
const SBFP_DEPED_SELECT = `
  year, center, region, sdo, milk_type, beneficiaries_pm, packs_to_deliver, packs_delivered,
  feeding_days, mode_of_procurement, amount, contract_amount, supplier_id,
  delivery_start, delivery_end, delivery_snapshots, monthly_packs_delivered,
  raw_milk_prices, raw_milk_month, procurement_status, include_in_report,
  cooperatives ( id, name )
`

function isFailed(r: { procurement_status?: string | null }) {
  return String(r.procurement_status || '').toUpperCase() === 'FAILED'
}

function fundsOf(r: { contract_amount?: number | null; amount?: number | null }) {
  const contract = Number(r.contract_amount) || 0
  const amount = Number(r.amount) || 0
  return contract > 0 ? contract : amount
}

/** Raw milk liters from packs: (packs / 5) × 0.2 */
function litersFromPacks(packs: number) {
  return packs > 0 ? (packs / 5) * 0.2 : 0
}

export default async function SummaryDepEdPage(props: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>
}) {
  const sp = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()
  const isEncoder = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : sp.center

  const centerAliases =
    centerFilter && centerFilter !== '__ALL_CENTERS__'
      ? sbfpCenterAliases(centerFilter)
      : null

  const { allYears, yearNum, yearsForUi } = resolveReportYearFilter(sp.year)

  const monthNum =
    sp.month && sp.month !== 'All' && sp.month !== '__ALL_MONTHS__'
      ? parseInt(sp.month, 10)
      : null
  const hasMonth = monthNum != null && Number.isFinite(monthNum)

  let rawData = await fetchAllRows<any>(() => {
    let query = supabase
      .from('sbfp_data')
      .select(SBFP_DEPED_SELECT)
      .gte('year', MIN_DATA_YEAR)
    if (!allYears && yearNum != null) query = query.eq('year', yearNum)
    if (centerAliases?.length === 1) query = query.eq('center', centerAliases[0])
    else if (centerAliases && centerAliases.length > 1) query = query.in('center', centerAliases)
    return query
  })

  rawData = excludeAuxSbfp(rawData).filter(
    r => !isFailed(r) && r.include_in_report !== false,
  )

  // Month = only SDOs with packs completed that month (same spirit as PIMD).
  if (hasMonth) {
    rawData = rawData.filter(r => packsForMonth(r, monthNum!, { year: yearNum ?? r.year }) > 0)
  }

  const rows = rawData.map((r: any) => {
    const y = Number(r.year) || yearNum || 0
    const packs = hasMonth
      ? packsForMonth(r, monthNum!, { year: y })
      : (Number(r.packs_to_deliver) || totalPacksDelivered(r) || 0)
    const income = hasMonth
      ? incomeForMonth(r, monthNum!, { year: y })
      : sumRowIncome(r, { year: y })
    const funds = fundsOf(r)

    return {
      year: y,
      beneficiaries: Number(r.beneficiaries_pm) || 0,
      milk_packs: packs,
      milk_cost: income > 0 ? income : funds,
      total_funds_transferred: funds,
      service_fee: 0,
      raw_milk_liters: litersFromPacks(packs),
      feeding_days: Number(r.feeding_days) || 0,
      mode_of_procurement: r.mode_of_procurement || '',
      region: r.region || '',
      province: '',
      division: r.sdo || '',
      supplier_id: r.supplier_id || '',
      supplier_name: r.cooperatives?.name || r.supplier_id || '',
      milk_type: r.milk_type || '',
    }
  })

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ color: '#1d4ed8' }}>📘 Summary — DepEd</h1>
          <p className="page-subtitle">
            School-Based Feeding Program · {centerFilter === '__ALL_CENTERS__' ? 'ALL CENTERS' : (centerFilter || 'ALL CENTERS')}
          </p>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginTop: 6 }}>
            Figures come from SBFP SDO procurement monitoring (column K beneficiaries) — not the MFP masterlist.
          </p>
        </div>
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} basePath="/reports/summary-deped" />
      </div>

      <SummaryDepEdClient
        rows={rows}
        years={yearsForUi}
        centerFilter={centerFilter === '__ALL_CENTERS__' ? 'All Centers' : centerFilter}
        yearFilter={allYears ? '__ALL_YEARS__' : String(yearNum)}
        monthFilter={sp.month}
      />
    </div>
  )
}
