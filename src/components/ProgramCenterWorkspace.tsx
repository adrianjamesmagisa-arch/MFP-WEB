'use client'

import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { MONITORING_PROGRAMS, type MonitoringProgramId } from '@/lib/monitoring-programs'
import type { ProgramDropoffRow, ProgramProcurementRow } from '@/lib/program-dropoff-sync'
import { ProgramProcurementTable } from '@/components/ProgramProcurementTable'
import { ProgramDropoffTable } from '@/components/ProgramDropoffTable'
import { MFP_GEO_NA } from '@/lib/mfp-record-classification'

function areaLabel(programId: MonitoringProgramId): string {
  if (programId === 'dswd') return 'Province'
  if (programId === 'lgu') return 'LGU / Province'
  if (programId === 'lds') return 'District / Area'
  return 'Area'
}

export function ProgramCenterWorkspace({
  programId,
  center,
  centerLabel,
  year,
  procurementRows,
  dropoffRows,
  schemaReady,
  userRole,
  hubPath,
}: {
  programId: MonitoringProgramId
  center: string
  centerLabel: string
  year: number
  procurementRows: ProgramProcurementRow[]
  dropoffRows: ProgramDropoffRow[]
  schemaReady: boolean
  userRole?: string | null
  hubPath: string
}) {
  const program = MONITORING_PROGRAMS[programId]
  const editable = userRole !== 'viewer'
  const areaColumnLabel = areaLabel(programId)

  const totalAreas = procurementRows.length
  const totalPacks = procurementRows.reduce((s, r) => s + (Number(r.packs_to_deliver) || 0), 0)
  const totalDelivered = procurementRows.reduce((s, r) => s + (Number(r.packs_delivered) || 0), 0)
  const statCounts = procurementRows.reduce(
    (acc, r) => {
      const st = (r.procurement_status || '').toUpperCase()
      if (st === 'FOR PREPARATION') acc.prep++
      else if (st.includes('ONGOING')) acc.ongoing++
      else if (st.includes('AWARDED')) acc.awarded++
      else if (st === 'DONE' || st === 'COMPLETED') acc.done++
      else if (st === 'FAILED') acc.failed++
      return acc
    },
    { prep: 0, ongoing: 0, awarded: 0, done: 0, failed: 0 },
  )

  const pimdHref = `/reports/pimd?center=${encodeURIComponent(centerLabel)}&year=${year}${
    program.pimdFunder ? `&funder=${encodeURIComponent(program.pimdFunder)}` : ''
  }`

  const parentOptions = procurementRows.map(r => ({
    id: r.id,
    label: r.label || r.province || '',
    region: r.region,
    province: r.province,
    milk_type: r.milk_type,
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <Link href={hubPath} className="text-sm text-muted-foreground hover:text-foreground mb-1 inline-block">
            ← Program years
          </Link>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: program.accent }}>
            {program.shortLabel} · {centerLabel} · {year}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {program.subtitle}. Masterlist: Funded By = {program.fundedBy === 'Others' ? '(varies)' : program.fundedBy};
            Division &amp; School = {MFP_GEO_NA}.
          </p>
        </div>
        <Link href={pimdHref} className="btn btn-outline">
          <BarChart3 size={16} /> PIMD report
        </Link>
      </div>

      {!schemaReady && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Program monitoring tables are not in the database yet. Open{' '}
          <a className="underline font-semibold" href="/api/apply-program-monitoring-migration" target="_blank" rel="noreferrer">
            /api/apply-program-monitoring-migration
          </a>
          , run the SQL in Supabase → SQL Editor, then refresh.
        </div>
      )}

      {schemaReady && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-2xl font-bold">{totalAreas}</div>
              <div className="text-xs text-muted-foreground mt-1">{areaColumnLabel}s</div>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-lg font-bold">{totalPacks.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">Target milk packs</div>
            </div>
            <div className="rounded-lg border bg-amber-50 p-3 text-center">
              <div className="text-2xl font-bold text-amber-800">{statCounts.prep}</div>
              <div className="text-xs text-amber-700 mt-1">For preparation</div>
            </div>
            <div className="rounded-lg border bg-blue-50 p-3 text-center">
              <div className="text-2xl font-bold text-blue-800">{statCounts.ongoing}</div>
              <div className="text-xs text-blue-700 mt-1">Ongoing</div>
            </div>
            <div className="rounded-lg border bg-purple-50 p-3 text-center">
              <div className="text-2xl font-bold text-purple-800">{statCounts.awarded}</div>
              <div className="text-xs text-purple-700 mt-1">Awarded</div>
            </div>
            <div className="rounded-lg border bg-emerald-50 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-800">{statCounts.done}</div>
              <div className="text-xs text-emerald-700 mt-1">Completed</div>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-lg font-bold">{dropoffRows.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Municipalities</div>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-lg font-bold">
                {totalPacks ? `${Math.round((totalDelivered / totalPacks) * 100)}%` : '0%'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Delivery progress</div>
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">1. Procurement status</h2>
            <p className="text-xs text-muted-foreground">
              One row per {areaColumnLabel.toLowerCase()} (MOA grouping). Contract amount and target milk packs match SBFP columns L / packs to deliver.
              Updates cascade to linked masterlist rows.{' '}
              <a href="#program-dropoffs" className="underline font-medium text-primary">
                Jump to drop-off points ↓
              </a>
            </p>
            <ProgramProcurementTable
              programId={programId}
              center={center}
              year={year}
              areaColumnLabel={areaColumnLabel}
              initialRows={procurementRows}
              editable={editable}
            />
          </section>

          <section id="program-dropoffs" className="flex flex-col gap-2 scroll-mt-4">
            <h2 className="text-base font-semibold">1b. Drop-off points (Municipalities)</h2>
            <p className="text-xs text-muted-foreground">
              Municipalities under each {areaColumnLabel.toLowerCase()}. Beneficiaries and feeding days auto-calculate packs and sync to MFP Data (
              {MFP_GEO_NA} for Division &amp; Elementary School).
            </p>
            <ProgramDropoffTable
              programId={programId}
              center={center}
              year={year}
              areaColumnLabel={areaColumnLabel}
              parentOptions={parentOptions}
              initialRows={dropoffRows}
              editable={editable}
            />
          </section>
        </>
      )}
    </div>
  )
}
