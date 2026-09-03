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
      ...computed,
      jan_dec_target_milk_volume: janDec,
      jul_dec_projected_volume: julDec || (janDec > 0 ? Math.round(janDec / 2) : 0),
    }
    // recompute with finalized julDec default
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

  const fmt = (n: number) => Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold">Milk Capacity (for Summary)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enter CBED production capacity. Target packs and shortage fields auto-compute from this center&apos;s SDO packs to deliver.
          </p>
        </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">A — Jan–Dec Target Milk Volume (L) CBED</span>
          <input
            type="number"
            disabled={!editable}
            value={janDec}
            onChange={e => setJanDec(Number(e.target.value) || 0)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">E — Jul–Dec Projected Volume (L)</span>
          <input
            type="number"
            disabled={!editable}
            value={julDec}
            onChange={e => setJulDec(Number(e.target.value) || 0)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Defaults to A ÷ 2 if blank"
          />
        </label>
      </div>

      <div className="overflow-auto">
        <table className="data-table w-full text-sm" style={{ minWidth: 800 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>B — Target Milk Packs (auto)</th>
              <th style={{ textAlign: 'right' }}>C — Equiv. Vol. B/25 (auto)</th>
              <th style={{ textAlign: 'right' }}>D — Shortage/Surplus L (auto)</th>
              <th style={{ textAlign: 'right' }}>F — Packs Producible (auto)</th>
              <th style={{ textAlign: 'right' }}>G — Shortage/Surplus Packs (auto)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(computed.target_milk_packs)}</td>
              <td style={{ textAlign: 'right' }}>{fmt(computed.equivalent_volume)}</td>
              <td style={{ textAlign: 'right', color: computed.shortage_surplus >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                {fmt(computed.shortage_surplus)}
              </td>
              <td style={{ textAlign: 'right' }}>{fmt(computed.milk_packs_can_produce)}</td>
              <td style={{ textAlign: 'right', color: computed.shortage_surplus_packs >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                {fmt(computed.shortage_surplus_packs)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {msg && <p className="text-xs mt-2 text-muted-foreground">{msg}</p>}
    </div>
  )
}
