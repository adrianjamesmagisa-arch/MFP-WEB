'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MONITORING_PROGRAMS, type MonitoringProgramId } from '@/lib/monitoring-programs'
import type { MfpProgramRecord } from '@/lib/mfp-program-monitoring'
import { aggregateDivisions } from '@/lib/mfp-program-monitoring'
import { formatNumber } from '@/lib/utils'
import { BarChart3, RefreshCw } from 'lucide-react'

export function MfpProgramWorkspace({
  programId,
  center,
  centerLabel,
  year,
  initialRecords,
  userRole,
}: {
  programId: MonitoringProgramId
  center: string
  centerLabel: string
  year: number
  initialRecords: MfpProgramRecord[]
  userRole?: string | null
}) {
  const program = MONITORING_PROGRAMS[programId]
  const router = useRouter()
  const editable = userRole !== 'viewer'
  const [records, setRecords] = useState(initialRecords)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [divEdits, setDivEdits] = useState<Record<string, { target: string; delivered: string }>>({})

  const divisions = useMemo(() => aggregateDivisions(records), [records])

  const pimdHref = `/reports/pimd?center=${encodeURIComponent(centerLabel)}&year=${year}${
    program.pimdFunder ? `&funder=${encodeURIComponent(program.pimdFunder)}` : ''
  }`

  const hubPath = `/monitoring/${programId}/center/${encodeURIComponent(center)}`

  async function syncDivision(division: string) {
    const div = divisions.find(d => d.division === division)
    if (!div) return
    const edit = divEdits[division]
    const target = edit?.target !== undefined ? Number(edit.target) : div.target
    const delivered = edit?.delivered !== undefined ? Number(edit.delivered) : div.delivered
    setSyncing(division)
    try {
      const res = await fetch('/api/monitoring/sync-division', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program: programId,
          center,
          year,
          division,
          target,
          delivered,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Sync failed')
      setRecords(prev =>
        prev.map(r => {
          if (String(r.division || '').trim() !== division && division !== '(No division)') {
            if (division === '(No division)' && String(r.division || '').trim()) return r
          }
          const match =
            division === '(No division)'
              ? !String(r.division || '').trim()
              : String(r.division || '').trim() === division
          return match
            ? {
                ...r,
                target_milk_packs_to_deliver: target,
                total_milk_packs_delivered: delivered,
              }
            : r
        }),
      )
      router.refresh()
    } catch (e: any) {
      alert(e.message || 'Could not sync division to masterlist')
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <Link href={hubPath} style={{ fontSize: '0.8rem', color: program.accent }}>
            ← {centerLabel} · all years
          </Link>
          <h1 className="page-title" style={{ color: program.accent, marginTop: 4 }}>
            {program.shortLabel} · {centerLabel} · {year}
          </h1>
          <p className="page-subtitle">{records.length} masterlist site(s) · sync division AD/AE to all schools</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={pimdHref} className="btn btn-outline">
            <BarChart3 size={16} /> PIMD report
          </Link>
          <Link href={program.summaryHref} className="btn btn-outline">
            Summary
          </Link>
          {editable && (
            <Link href="/data/new" className="btn btn-gold">
              Add site
            </Link>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem', overflow: 'auto' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--navy)' }}>
          By division (SDO / area)
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 12 }}>
          Set target and delivered packs once per division, then sync — every school row in MFP Data gets the same
          AD/AE values (used in PIMD accomplishment for {program.shortLabel}).
        </p>
        <table className="data-table" style={{ fontSize: '0.82rem', minWidth: 720 }}>
          <thead>
            <tr>
              <th>Division</th>
              <th style={{ textAlign: 'right' }}>Schools</th>
              <th style={{ textAlign: 'right' }}>Beneficiaries</th>
              <th style={{ textAlign: 'right' }}>Target packs (AD)</th>
              <th style={{ textAlign: 'right' }}>Delivered (AE)</th>
              <th style={{ textAlign: 'right' }}>%</th>
              {editable && <th>Sync masterlist</th>}
            </tr>
          </thead>
          <tbody>
            {divisions.map(d => {
              const edit = divEdits[d.division]
              const target = edit?.target !== undefined ? Number(edit.target) : d.target
              const delivered = edit?.delivered !== undefined ? Number(edit.delivered) : d.delivered
              const pct = target > 0 ? Math.round((delivered / target) * 100) : null
              return (
                <tr key={d.division}>
                  <td style={{ fontWeight: 600 }}>{d.division}</td>
                  <td style={{ textAlign: 'right' }}>{d.schools}</td>
                  <td style={{ textAlign: 'right' }}>{formatNumber(d.beneficiaries)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {editable ? (
                      <input
                        type="number"
                        value={edit?.target ?? d.target}
                        onChange={e =>
                          setDivEdits(p => ({
                            ...p,
                            [d.division]: {
                              target: e.target.value,
                              delivered: p[d.division]?.delivered ?? String(d.delivered),
                            },
                          }))
                        }
                        style={{ width: 100, textAlign: 'right' }}
                      />
                    ) : (
                      formatNumber(d.target)
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {editable ? (
                      <input
                        type="number"
                        value={edit?.delivered ?? d.delivered}
                        onChange={e =>
                          setDivEdits(p => ({
                            ...p,
                            [d.division]: {
                              target: p[d.division]?.target ?? String(d.target),
                              delivered: e.target.value,
                            },
                          }))
                        }
                        style={{ width: 100, textAlign: 'right' }}
                      />
                    ) : (
                      formatNumber(d.delivered)
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: pct !== null && pct >= 100 ? '#16a34a' : undefined }}>
                    {pct !== null ? `${pct}%` : '—'}
                  </td>
                  {editable && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={syncing === d.division}
                        onClick={() => syncDivision(d.division)}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        <RefreshCw size={14} style={{ marginRight: 4 }} />
                        {syncing === d.division ? 'Syncing…' : 'Sync'}
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Sites (masterlist)</h2>
        <table className="data-table" style={{ fontSize: '0.78rem', minWidth: 900 }}>
          <thead>
            <tr>
              <th>Division</th>
              <th>School / site</th>
              <th>Municipality</th>
              <th style={{ textAlign: 'right' }}>Beneficiaries</th>
              <th style={{ textAlign: 'right' }}>Milk packs</th>
              <th>Started</th>
              <th>Completed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td>{r.division || '—'}</td>
                <td style={{ fontWeight: 600 }}>{r.elementary_school || '—'}</td>
                <td>{r.municipality || '—'}</td>
                <td style={{ textAlign: 'right' }}>{formatNumber(r.beneficiaries || 0)}</td>
                <td style={{ textAlign: 'right' }}>{formatNumber(r.milk_packs || 0)}</td>
                <td>{r.date_started || '—'}</td>
                <td>{r.date_completed || '—'}</td>
                <td>
                  <Link href={`/data/${r.id}/edit`} className="btn btn-outline" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
