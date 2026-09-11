'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { MfpProgramRecord } from '@/lib/mfp-program-monitoring'
import {
  classifyDswdMasterlistPatch,
  dswdContractAmount,
  MFP_GEO_NA,
} from '@/lib/mfp-record-classification'
import { formatNumber } from '@/lib/utils'
import { BarChart3, Plus } from 'lucide-react'

type DswdRow = MfpProgramRecord & { contract_amount: number }

function toDswdRow(r: MfpProgramRecord): DswdRow {
  return { ...r, contract_amount: dswdContractAmount(r) }
}

export function DswdMonitoringWorkspace({
  center,
  centerLabel,
  year,
  initialRecords,
  userRole,
}: {
  center: string
  centerLabel: string
  year: number
  initialRecords: MfpProgramRecord[]
  userRole?: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const editable = userRole !== 'viewer'
  const [rows, setRows] = useState(() => initialRecords.map(toDswdRow))
  const [adding, setAdding] = useState(false)

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const p = String(a.province || '').localeCompare(String(b.province || ''))
        if (p !== 0) return p
        return String(a.municipality || '').localeCompare(String(b.municipality || ''))
      }),
    [rows],
  )

  const totals = useMemo(() => {
    const provinces = new Set(sorted.map(r => r.province).filter(Boolean))
    return {
      municipalities: sorted.length,
      provinces: provinces.size,
      beneficiaries: sorted.reduce((s, r) => s + (Number(r.beneficiaries) || 0), 0),
      targetPacks: sorted.reduce((s, r) => s + (Number(r.target_milk_packs_to_deliver) || 0), 0),
      contract: sorted.reduce((s, r) => s + (Number(r.contract_amount) || 0), 0),
      delivered: sorted.reduce((s, r) => s + (Number(r.total_milk_packs_delivered) || 0), 0),
    }
  }, [sorted])

  const pimdHref = `/reports/pimd?center=${encodeURIComponent(centerLabel)}&year=${year}&funder=DSWD`
  const hubPath = `/monitoring/dswd/center/${encodeURIComponent(center)}`

  async function saveField(id: string, field: string, value: number | string) {
    let patch: Record<string, unknown> = { [field]: value }
    if (field === 'contract_amount') {
      patch = { total_funds_transferred: value, milk_cost: value }
    }
    patch = classifyDswdMasterlistPatch(patch)
    const { error } = await supabase.from('mfp_data').update(patch).eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r
        const next = { ...r, ...patch, funded_by: 'DSWD' as const }
        if (field === 'contract_amount') {
          next.total_funds_transferred = Number(value)
          next.milk_cost = Number(value)
          next.contract_amount = Number(value)
        }
        return next as DswdRow
      }),
    )
  }

  async function addMunicipality() {
    if (!editable || adding) return
    setAdding(true)
    const payload = classifyDswdMasterlistPatch({
      year,
      center,
      region: '',
      province: 'New Province',
      municipality: 'New Municipality',
      beneficiaries: 0,
      target_milk_packs_to_deliver: 0,
      total_milk_packs_delivered: 0,
      total_funds_transferred: 0,
      milk_cost: 0,
      milk_packs: 0,
      feeding_days: 0,
      milk_type: 'PM',
      batch: '',
      mode_of_procurement: '',
      price: 0,
      service_fee: 0,
    })
    const { data, error } = await supabase.from('mfp_data').insert(payload).select('id').single()
    setAdding(false)
    if (error) {
      alert(error.message)
      return
    }
    router.refresh()
    if (data?.id) {
      setRows(prev => [
        ...prev,
        toDswdRow({
          id: data.id,
          year,
          center,
          funded_by: 'DSWD',
          region: '',
          province: String(payload.province),
          municipality: String(payload.municipality),
          division: MFP_GEO_NA,
          elementary_school: MFP_GEO_NA,
          beneficiaries: 0,
          feeding_days: 0,
          milk_packs: 0,
          milk_type: 'PM',
          date_started: null,
          date_completed: null,
          target_milk_packs_to_deliver: 0,
          total_milk_packs_delivered: 0,
          milk_cost: 0,
          total_funds_transferred: 0,
        }),
      ])
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <Link href={hubPath} style={{ fontSize: '0.8rem', color: '#15803d' }}>
            ← {centerLabel} · program years
          </Link>
          <h1 className="page-title" style={{ color: '#15803d', marginTop: 4 }}>
            DSWD · {centerLabel} · {year}
          </h1>
          <p className="page-subtitle">
            Municipality MOA lines · masterlist classification: Funded By = DSWD, Division &amp; School = N/A
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={pimdHref} className="btn btn-outline">
            <BarChart3 size={16} /> PIMD (DSWD)
          </Link>
          <Link href="/reports/summary-dswd" className="btn btn-outline">
            Summary report
          </Link>
          {editable && (
            <button type="button" className="btn btn-gold" onClick={addMunicipality} disabled={adding}>
              <Plus size={16} /> Add municipality
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ overflow: 'auto', marginBottom: '1rem' }}>
        <table className="data-table" style={{ fontSize: '0.82rem', minWidth: 880 }}>
          <thead>
            <tr>
              <th>Province</th>
              <th>Municipality</th>
              <th style={{ textAlign: 'right' }}>Target # of children</th>
              <th style={{ textAlign: 'right' }}>Target milk packs</th>
              <th style={{ textAlign: 'right' }}>Contract amount (₱)</th>
              <th style={{ textAlign: 'right' }}>Total packs delivered</th>
              <th>F / H (masterlist)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id}>
                <td>
                  {editable ? (
                    <input
                      defaultValue={r.province || ''}
                      onBlur={e => saveField(r.id, 'province', e.target.value.trim())}
                      style={{ width: '100%', minWidth: 120 }}
                    />
                  ) : (
                    r.province || '—'
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      defaultValue={r.municipality || ''}
                      onBlur={e => saveField(r.id, 'municipality', e.target.value.trim())}
                      style={{ width: '100%', minWidth: 140 }}
                    />
                  ) : (
                    r.municipality || '—'
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input
                      type="number"
                      defaultValue={r.beneficiaries ?? 0}
                      onBlur={e => saveField(r.id, 'beneficiaries', Number(e.target.value) || 0)}
                      style={{ width: 90, textAlign: 'right' }}
                    />
                  ) : (
                    formatNumber(r.beneficiaries || 0)
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input
                      type="number"
                      defaultValue={r.target_milk_packs_to_deliver ?? 0}
                      onBlur={e =>
                        saveField(r.id, 'target_milk_packs_to_deliver', Number(e.target.value) || 0)
                      }
                      style={{ width: 90, textAlign: 'right' }}
                    />
                  ) : (
                    formatNumber(r.target_milk_packs_to_deliver || 0)
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input
                      type="number"
                      defaultValue={r.contract_amount ?? 0}
                      onBlur={e => saveField(r.id, 'contract_amount', Number(e.target.value) || 0)}
                      style={{ width: 110, textAlign: 'right' }}
                    />
                  ) : (
                    formatNumber(r.contract_amount)
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input
                      type="number"
                      defaultValue={r.total_milk_packs_delivered ?? 0}
                      onBlur={e =>
                        saveField(r.id, 'total_milk_packs_delivered', Number(e.target.value) || 0)
                      }
                      style={{ width: 90, textAlign: 'right' }}
                    />
                  ) : (
                    formatNumber(r.total_milk_packs_delivered || 0)
                  )}
                </td>
                <td style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>
                  {MFP_GEO_NA} / {MFP_GEO_NA}
                </td>
                <td>
                  <Link
                    href={`/data/${r.id}/edit`}
                    className="btn btn-outline"
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                  >
                    Masterlist
                  </Link>
                </td>
              </tr>
            ))}
            {sorted.length > 0 && (
              <tr style={{ fontWeight: 800, background: '#f0fdf4' }}>
                <td colSpan={2}>
                  GRAND TOTAL — {totals.municipalities} municipalities, {totals.provinces} provinces
                </td>
                <td style={{ textAlign: 'right' }}>{formatNumber(totals.beneficiaries)}</td>
                <td style={{ textAlign: 'right' }}>{formatNumber(totals.targetPacks)}</td>
                <td style={{ textAlign: 'right' }}>{formatNumber(totals.contract)}</td>
                <td style={{ textAlign: 'right' }}>{formatNumber(totals.delivered)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-500)' }}>
            No DSWD municipality rows for this center and year. Use Add municipality or enter data in MFP Data with
            Funded By = DSWD (Division and Elementary School should be N/A).
          </p>
        )}
      </div>

      <p style={{ fontSize: '0.78rem', color: 'var(--gray-500)', lineHeight: 1.5 }}>
        DepEd SBFP rows use SDO + school names; DSWD rows use province + municipality only. All appear in{' '}
        <Link href="/data">MFP Data</Link> — filter <strong>Funded By = DSWD</strong> to avoid mixing with DepEd.
      </p>
    </div>
  )
}
