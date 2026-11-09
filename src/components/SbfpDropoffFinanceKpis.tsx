import { reconcileDropoffFinance, type DropoffFinancials } from '@/lib/sbfp-dropoff-finance'

const peso = (amount: number) => amount.toLocaleString('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2,
})

export function SbfpDropoffFinanceKpis({ parents, schools, selectedSdo, saving, drafting }: {
  parents: Array<{ id: string; contract_amount?: number | null }>
  schools: Array<DropoffFinancials & { sbfp_data_id?: string | null; include_in_masterlist?: boolean }>
  selectedSdo: string
  saving: boolean
  drafting: boolean
}) {
  const totals = reconcileDropoffFinance(parents, schools, selectedSdo)
  const cards = [
    ['SDO milk contract', totals.contract],
    ['Calculated school milk cost', totals.allocated],
    [totals.difference < 0 ? 'Overallocated milk cost' : 'Unallocated milk cost', Math.abs(totals.difference)],
    ['School shipping / service fees', totals.shipping],
    ['Combined school funds', totals.total],
  ] as const
  return (
    <div className="rounded-lg border bg-card p-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold">Contract allocation comparison</h3>
        <span className={`text-xs font-semibold ${totals.status === 'Matched' ? 'text-emerald-700' : totals.status === 'Overallocated' ? 'text-red-700' : 'text-amber-700'}`}>
          {totals.status}{drafting ? ' · Unsaved preview' : saving ? ' · Saving…' : ''}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-md border bg-background p-2">
            <div className="text-[0.65rem] text-muted-foreground">{label}</div>
            <div className="mt-1 text-sm font-bold tabular-nums break-all">{peso(value)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {totals.schools} included school(s) · Milk contracts exclude shipping. Combined funds = school milk cost + shipping.
        {totals.missingMilk > 0 && ` ${totals.missingMilk} school milk amount(s) need valid packs and an SDO milk type / price.`}
        {totals.missingShipping > 0 && ` ${totals.missingShipping} shipping fee(s) not encoded; combined funds are partial.`}
        {totals.missingContracts > 0 && ` ${totals.missingContracts} SDO contract amount(s) missing.`}
        {totals.unlinked > 0 && ` ${totals.unlinked} school(s) need an SDO link before comparison.`}
        {selectedSdo === 'ALL' && totals.overallocatedContracts > 0 && ` ${totals.overallocatedContracts} SDO contract(s) overallocated; select an SDO to inspect its gap.`}
        {selectedSdo === 'ALL' && totals.underallocatedContracts > 0 && ` ${totals.underallocatedContracts} SDO contract(s) underallocated.`}
      </p>
    </div>
  )
}
