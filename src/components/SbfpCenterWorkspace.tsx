'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SbfpCenterTable } from '@/components/SbfpCenterTable'
import { SbfpCenterBudgetForm, type BudgetRow } from '@/components/SbfpCenterBudgetForm'
import { SbfpCenterCapacityForm, type CapacityRow } from '@/components/SbfpCenterCapacityForm'
import { SbfpExcelPpmpTable, type PpmpRow } from '@/components/SbfpExcelPpmpTable'
import { SbfpStaffHiringTable, type HiringRow } from '@/components/SbfpStaffHiringTable'
import { SbfpDropoffTable, type DropoffRow } from '@/components/SbfpDropoffTable'
import { SbfpCreateSchoolYearButton } from '@/components/SbfpCreateSchoolYearButton'
import { parseSchoolYear, schoolYearLabel, schoolYearToDbYear } from '@/lib/sbfp-year'
import { totalPacksDelivered } from '@/lib/sbfp-raw-milk'

export function SbfpCenterWorkspace({
  center,
  title,
  subtitle,
  schoolYears,
  records,
  budget,
  capacity,
  ppmpItems = [],
  hiringRows = [],
  dropoffRows = [],
  dropoffSchemaReady = true,
  feedingDaysReady = true,
  userRole,
  showKpis = true,
}: {
  center: string
  title: string
  subtitle?: string
  schoolYears: string[]
  records: any[]
  budget: BudgetRow | null
  capacity: CapacityRow | null
  ppmpItems?: PpmpRow[]
  hiringRows?: HiringRow[]
  dropoffRows?: DropoffRow[]
  dropoffSchemaReady?: boolean
  feedingDaysReady?: boolean
  userRole?: string | null
  showKpis?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sy = parseSchoolYear(searchParams.get('sy'), schoolYears)
  const year = schoolYearToDbYear(sy)
  const editable = userRole !== 'viewer'

  const total = records.length
  const totalPacks = records.reduce((s, r) => s + (r.packs_to_deliver || 0), 0)
  const totalDelivered = records.reduce((s, r) => s + totalPacksDelivered(r), 0)
  const statCounts = records.reduce((acc, r) => {
    const st = (r.procurement_status || '').toUpperCase()
    if (st === 'FOR PREPARATION') acc.prep++
    else if (st.includes('ONGOING')) acc.ongoing++
    else if (st.includes('AWARDED')) acc.awarded++
    else if (st === 'DONE' || st === 'COMPLETED') acc.done++
    else if (st === 'FAILED') acc.failed++
    return acc
  }, { prep: 0, ongoing: 0, awarded: 0, done: 0, failed: 0 })

  const onSyChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sy', next)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="text-[0.65rem] font-bold uppercase text-muted-foreground mb-1">School Year</div>
            <select
              value={sy}
              onChange={e => onSyChange(e.target.value)}
              className="h-9 px-3 rounded-md border text-sm font-semibold bg-background"
            >
              {schoolYears.map(y => (
                <option key={y} value={y}>{schoolYearLabel(y)}</option>
              ))}
            </select>
          </div>
          {editable && (
            <SbfpCreateSchoolYearButton center={center} existingYears={schoolYears} />
          )}
        </div>
      </div>

      {showKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <div className="rounded-lg border bg-card p-3 text-center">
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-xs text-muted-foreground mt-1">Total SDOs</div>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <div className="text-lg font-bold">{totalPacks.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Packs to Deliver</div>
          </div>
          <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{statCounts.prep}</div>
            <div className="text-xs text-amber-600 mt-1">For Preparation</div>
          </div>
          <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{statCounts.ongoing}</div>
            <div className="text-xs text-blue-600 mt-1">Ongoing</div>
          </div>
          <div className="rounded-lg border bg-purple-50 dark:bg-purple-900/20 p-3 text-center">
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{statCounts.awarded}</div>
            <div className="text-xs text-purple-600 mt-1">Awarded</div>
          </div>
          <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{statCounts.done}</div>
            <div className="text-xs text-emerald-600 mt-1">Completed</div>
          </div>
          <div className="rounded-lg border bg-red-50 dark:bg-red-900/20 p-3 text-center">
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{statCounts.failed}</div>
            <div className="text-xs text-red-600 mt-1">Failed</div>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <div className="text-lg font-bold">{totalPacks ? `${Math.round((totalDelivered / totalPacks) * 100)}%` : '0%'}</div>
            <div className="text-xs text-muted-foreground mt-1">Delivery Progress</div>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">1. SDO Procurement</h2>
        <p className="text-xs text-muted-foreground">
          Add <strong>Delivered as of</strong> dates (encoder-chosen). Packs / Raw ₱/L / Income columns appear only for months that have a delivered date (e.g. add a September date to show September). Income for a month uses only that month’s completed packs. Totals join all months for PIMD.
          {' '}
          <a href="#dropoff-points" className="underline font-medium text-primary">Jump to Drop-off Points ↓</a>
        </p>
        <SbfpCenterTable
          center={center}
          year={year}
          initialRecords={records}
          userRole={userRole}
          allowAdd
        />
      </section>

      <section id="dropoff-points" className="flex flex-col gap-2 scroll-mt-4">
        <h2 className="text-base font-semibold">1b. Drop-off Points (Schools)</h2>
        <p className="text-xs text-muted-foreground">
          Schools / drop-off points under each SDO. Enter <strong>beneficiaries</strong> and <strong>feeding days</strong> —
          milk packs and formulations auto-calculate and update the DepEd school masterlist.
        </p>
        {!dropoffSchemaReady ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Drop-off table is not in the database yet. Open{' '}
            <a className="underline font-semibold" href="/api/apply-dropoff-migration" target="_blank" rel="noreferrer">
              /api/apply-dropoff-migration
            </a>
            , copy the SQL into Supabase → SQL Editor, run it, then refresh this page and run{' '}
            <code className="text-xs">node scripts/seed_sbfp_dropoffs.js</code>.
          </div>
        ) : (
          <>
            {!feedingDaysReady && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Run this in Supabase SQL Editor to enable Feeding Days / auto milk packs:
                <pre className="mt-2 text-xs whitespace-pre-wrap bg-white/70 p-2 rounded border">
{`ALTER TABLE public.sbfp_dropoff_points
  ADD COLUMN IF NOT EXISTS feeding_days INTEGER NOT NULL DEFAULT 0;`}
                </pre>
              </div>
            )}
            <SbfpDropoffTable
              center={center}
              year={year}
              sdoOptions={records.map((r: any) => ({
                id: r.id,
                sdo: r.sdo,
                region: r.region,
                feeding_days: r.feeding_days,
                remarks: r.remarks,
              }))}
              initialRows={dropoffRows}
              editable={editable && feedingDaysReady}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SbfpExcelPpmpTable
          title="OFFICE SUPPLIES TOTAL FUND IN PPMP"
          itemLabel="Office Supplies"
          category="office_supplies"
          center={center}
          year={year}
          initialRows={ppmpItems.filter(r => r.category === 'office_supplies')}
          editable={editable}
        />
      </section>

      <section className="flex flex-col gap-2">
        <SbfpExcelPpmpTable
          title="FIXTURES TOTAL FUND IN PPMP"
          itemLabel="ICT Supplies"
          category="fixtures"
          center={center}
          year={year}
          initialRows={ppmpItems.filter(r => r.category === 'fixtures')}
          editable={editable}
        />
      </section>

      <section className="flex flex-col gap-2">
        <SbfpExcelPpmpTable
          title="TRAINING TOTAL FUND IN PPMP"
          itemLabel="Training Expenses"
          category="training"
          center={center}
          year={year}
          initialRows={ppmpItems.filter(r => r.category === 'training')}
          editable={editable}
        />
      </section>

      <section className="flex flex-col gap-2">
        <SbfpStaffHiringTable
          center={center}
          year={year}
          initialRows={hiringRows}
          editable={editable}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">2. Center Budget (A–F)</h2>
        <SbfpCenterBudgetForm center={center} year={year} initial={budget} editable={editable} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">3. Milk Capacity (for Summary)</h2>
        <SbfpCenterCapacityForm
          center={center}
          year={year}
          initial={capacity}
          packsToDeliverSum={totalPacks}
          editable={editable}
        />
      </section>
    </div>
  )
}
