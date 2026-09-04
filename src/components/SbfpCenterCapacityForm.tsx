'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeSummaryFields } from '@/lib/sbfp-compute'

export type CapacityRow = {
  id?: string
  year: number
  center: string
  jan_dec_target_milk_volume: number
  jul_dec_projected_volume: number
  target_milk_packs?: number
  equivalent_volume?: number
  shortage_surplus?: number
  milk_packs_can_produce?: number
  shortage_surplus_packs?: number
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })

export function SbfpCenterCapacityForm({
  center,
  year,
  initial,
  packsToDeliverSum,
  editable,
}: {
  center: string
  year: number
  initial: CapacityRow | null
  packsToDeliverSum: number
  editable: boolean
}) {
  const supabase = createClient()
  const [janDec, setJanDec] = useState(Number(initial?.jan_dec_target_milk_volume) || 0)
  const [julDec, setJulDec] = useState(Number(initial?.jul_dec_projected_volume) || 0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const computed = useMemo(
    () => computeSummaryFields(
      { jan_dec_target_milk_volume: janDec, jul_dec_projected_volume: julDec },
      packsToDeliverSum,
    ),
    [janDec, julDec, packsToDeliverSum],
  )

  const save = async () => {
    if (!editable) return
    setSaving(true)
    setMsg(null)
    const payload = {
      year,
      center,
      jan_dec_target_milk_volume: janDec,
      jul_dec_projected_volume: julDec || (janDec > 0 ? Math.round(janDec / 2) : 0),
    }
    const final = computeSummaryFields(
      {
        jan_dec_target_milk_volume: payload.jan_dec_target_milk_volume,
        jul_dec_projected_volume: payload.jul_dec_projected_volume,
      },
      packsToDeliverSum,
    )
    const { error } = await supabase
      .from('sbfp_summary')
      .upsert({ year, center, ...final }, { onConflict: 'year,center' })
    setSaving(false)
    if (error) setMsg(error.message)
    else {
      setJulDec(final.jul_dec_projected_volume)
      setMsg('Capacity saved. Summary fields updated.')
    }
  }

  const rows: {
    letter: string
    label: string
    value: number
    input?: 'jan' | 'jul'
    tone?: 'ok' | 'bad' | 'auto'
  }[] = [
    { letter: 'A', label: 'Jan–Dec Target Milk Volume (L) CBED', value: janDec, input: 'jan' },
    { letter: 'B', label: 'Target Milk Packs (from SDO packs to deliver)', value: computed.target_milk_packs, tone: 'auto' },
    { letter: 'C', label: 'Equivalent Volume (packs ÷ 25)', value: computed.equivalent_volume, tone: 'auto' },
    { letter: 'D', label: 'Shortage / Surplus (L)', value: computed.shortage_surplus, tone: computed.shortage_surplus >= 0 ? 'ok' : 'bad' },
    { letter: 'E', label: 'Jul–Dec Projected Volume (L)', value: julDec, input: 'jul' },
    { letter: 'F', label: 'Packs Producible (E × 25)', value: computed.milk_packs_can_produce, tone: 'auto' },
    { letter: 'G', label: 'Shortage / Surplus Packs', value: computed.shortage_surplus_packs, tone: computed.shortage_surplus_packs >= 0 ? 'ok' : 'bad' },
  ]

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
      }}>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
          A and E come from Excel CBED capacity. B–D and F–G auto-compute from this center&apos;s SDO packs to deliver.
        </p>
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Capacity'}
          </button>
        )}
      </div>

      <div style={{ overflow: 'auto' }}>
        <table className="data-table" style={{ width: '100%', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ width: 56 }}>#</th>
              <th style={{ textAlign: 'left' }}>Particulars</th>
              <th style={{ textAlign: 'right', minWidth: 180 }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const color = r.tone === 'ok' ? '#059669' : r.tone === 'bad' ? '#dc2626' : undefined
              return (
                <tr key={r.letter} style={r.tone === 'auto' ? { background: 'rgba(59,130,246,0.04)' } : undefined}>
                  <td style={{ fontWeight: 700, textAlign: 'center' }}>{r.letter}</td>
                  <td style={{ textAlign: 'left' }}>{r.label}</td>
                  <td style={{ textAlign: 'right' }}>
                    {editable && r.input ? (
                      <input
                        type="number"
                        value={r.input === 'jan' ? janDec : julDec}
                        onChange={e => {
                          const v = Number(e.target.value) || 0
                          if (r.input === 'jan') setJanDec(v)
                          else setJulDec(v)
                        }}
                        className="w-full border rounded px-2 py-1.5 text-right text-sm tabular-nums"
                      />
                    ) : (
                      <span className="tabular-nums font-semibold" style={{ color }}>{fmt(r.value)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {msg && <p className="text-xs px-4 py-2 text-muted-foreground">{msg}</p>}
    </div>
  )
}
