import type { SupabaseClient } from '@supabase/supabase-js'
import { SBFP_DROPOFF_ENCODER_COLUMNS, SBFP_DROPOFF_FINANCE_COLUMNS } from '@/lib/encoder-selects'
import { fetchAllRows } from '@/lib/supabase-paginate'
import type { SbfpDropoffPoint } from '@/lib/types'

/** Load all schools for accurate allocation totals, with compatibility before migration. */
export async function loadSbfpDropoffs(supabase: SupabaseClient, center: string, year: number) {
  const { error: financeError } = await supabase.from('sbfp_dropoff_points')
    .select('contract_amount,service_fee,contract_unit_price').limit(0)
  if (financeError && !['42703', 'PGRST204'].includes(financeError.code)) {
    return { data: [], error: financeError, financeReady: false }
  }
  const financeReady = !financeError
  const columns = financeReady ? SBFP_DROPOFF_FINANCE_COLUMNS : SBFP_DROPOFF_ENCODER_COLUMNS
  try {
    const data = await fetchAllRows<SbfpDropoffPoint>(() => supabase.from('sbfp_dropoff_points')
      .select(columns).eq('center', center).eq('year', year)
      .order('sdo').order('dropoff_name').order('id'))
    return { data, error: null, financeReady }
  } catch (error) {
    return { data: [], error: { message: error instanceof Error ? error.message : 'Could not load schools.' }, financeReady }
  }
}
