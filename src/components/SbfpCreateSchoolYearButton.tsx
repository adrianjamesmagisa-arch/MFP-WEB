'use client'

import { useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
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
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [startYear, setStartYear] = useState(String(new Date().getFullYear()))
  const [copyFrom, setCopyFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewEnd = Number(startYear) + 1
  const previewLabel = Number.isFinite(previewEnd) ? `SY ${startYear}–${previewEnd}` : 'SY —'

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, busy])

  const create = async () => {
    const year = parseInt(startYear, 10)
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      setError('Enter a valid start year, for example 2027.')
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
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null) }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 52,
          padding: '0 22px',
          border: 'none',
          borderRadius: 14,
          background: 'var(--gold)',
          color: '#1a1204',
          fontSize: 17,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(245,166,35,0.28)',
        }}
      >
        <Plus size={20} strokeWidth={2.5} />
        Create school year
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => { if (!busy) setOpen(false) }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(10, 22, 40, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              background: '#fff',
              borderRadius: 20,
              boxShadow: '0 24px 60px rgba(10,22,40,0.28)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '22px 26px 18px',
              background: 'linear-gradient(135deg, #0a1628 0%, #1e3a6e 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div>
                <div id={titleId} style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>
                  New school year
                </div>
                <div style={{ marginTop: 6, fontSize: 16, color: '#cbd5e1' }}>
                  For {center}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={busy}
                onClick={() => setOpen(false)}
                style={{
                  width: 40, height: 40, borderRadius: 10, border: 'none',
                  background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px 26px 26px' }}>
              <label htmlFor={`${titleId}-year`} style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                Start year
              </label>
              <input
                ref={inputRef}
                id={`${titleId}-year`}
                type="number"
                min={2000}
                max={2100}
                value={startYear}
                onChange={e => setStartYear(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 54,
                  fontSize: 22,
                  fontWeight: 700,
                  padding: '10px 14px',
                  border: '2px solid #cbd5e1',
                  borderRadius: 12,
                  outline: 'none',
                }}
              />
              <p style={{ marginTop: 10, fontSize: 16, lineHeight: 1.45, color: '#334155' }}>
                This creates <strong>{previewLabel}</strong> — a blank monitoring page for procurement, schools, budget, and capacity.
              </p>

              <label htmlFor={`${titleId}-copy`} style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '20px 0 8px' }}>
                Copy capacity and budget from
              </label>
              <select
                id={`${titleId}-copy`}
                value={copyFrom}
                onChange={e => setCopyFrom(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 52,
                  fontSize: 17,
                  padding: '10px 12px',
                  border: '2px solid #cbd5e1',
                  borderRadius: 12,
                  background: '#fff',
                }}
              >
                <option value="">None — start empty</option>
                {existingYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              {error && (
                <p role="alert" style={{ marginTop: 14, fontSize: 16, color: '#b91c1c', fontWeight: 600 }}>
                  {error}
                </p>
              )}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  style={{
                    minHeight: 50, padding: '0 20px', borderRadius: 12,
                    border: '2px solid #cbd5e1', background: '#fff',
                    fontSize: 17, fontWeight: 600, cursor: 'pointer', color: '#334155',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={create}
                  style={{
                    minHeight: 50, padding: '0 22px', borderRadius: 12, border: 'none',
                    background: 'var(--navy)', color: '#fff',
                    fontSize: 17, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? 'Creating…' : `Create ${previewLabel}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
