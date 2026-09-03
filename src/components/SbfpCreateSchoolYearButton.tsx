'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensureCenterSchoolYear } from '@/lib/sbfp-compute'
import { labelFromDbYear, schoolYearToDbYear } from '@/lib/sbfp-year'

export function SbfpCreateSchoolYearButton({
  center,
  existingYears,
  onCreated,
}: {
  center: string
  existingYears: string[]
  onCreated?: (sy: string) => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [startYear, setStartYear] = useState(String(new Date().getFullYear()))
  const [copyFrom, setCopyFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const year = parseInt(startYear, 10)
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      setError('Enter a valid start year (e.g. 2027).')
      return
    }
    setBusy(true)
    setError(null)
    const copyFromYear = copyFrom ? schoolYearToDbYear(copyFrom) : null
    const { error: err } = await ensureCenterSchoolYear(supabase, center, year, {
      copyFromYear,
    })
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    const sy = labelFromDbYear(year)
    setOpen(false)
    onCreated?.(sy)
    router.push(`?sy=${sy}`)
    router.refresh()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-9 px-3 rounded-md text-sm font-medium border bg-background hover:bg-muted"
      >
        Create School Year
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border bg-card p-3 shadow-lg">
          <div className="text-sm font-semibold mb-2">New school year for {center}</div>
          <label className="block text-xs text-muted-foreground mb-1">Start year (SY YYYY–YYYY+1)</label>
          <input
            type="number"
            value={startYear}
            onChange={e => setStartYear(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm mb-2"
          />
          <p className="text-xs text-muted-foreground mb-2">
            Creates SY {startYear}-{Number(startYear) + 1 || '????'} capacity + budget shells for this center.
          </p>
          <label className="block text-xs text-muted-foreground mb-1">Copy capacity/budget from</label>
          <select
            value={copyFrom}
            onChange={e => setCopyFrom(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm mb-3"
          >
            <option value="">None (empty)</option>
            {existingYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="text-sm px-2 py-1" onClick={() => setOpen(false)}>Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={create}
              className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
