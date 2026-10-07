'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Building, Calendar, X } from 'lucide-react'
import { FALLBACK_SCHOOL_YEARS, labelFromDbYear } from '@/lib/sbfp-year'
import { createClient } from '@/lib/supabase/client'

const CENTERS = ['NHQ', 'UPLB', 'DMMMSU', 'CSU', 'MMSU', 'CLSU', 'LCSF', 'WVSU', 'USF', 'VSU', 'MLPC', 'CMU', 'USM']

export function SbfpViewerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter()
  const [sy, setSy] = useState(FALLBACK_SCHOOL_YEARS[0])
  const [years, setYears] = useState<string[]>([...FALLBACK_SCHOOL_YEARS])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const fetchYears = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.from('sbfp_school_years').select('year,label').eq('is_active', true).order('year')
        if (!error && data && data.length > 0) {
          const y = data.map(r => r.label || labelFromDbYear(r.year))
          setYears(y)
          if (!y.includes(sy)) setSy(y[0])
        }
      } catch (err) {
        console.error("Failed to fetch school years", err)
      }
    }
    fetchYears()
  }, [isOpen, sy])

  if (!isOpen || !mounted) return null

  const handleCenterClick = (center: string) => {
    const href = center === 'NHQ' ? '/sbfp/nhq' : `/sbfp/center/${center}`
    router.push(`${href}?sy=${sy}`)
    onClose()
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 500, padding: '1.5rem',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>Select SBFP Center</h2>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>Choose a school year and center to view.</p>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
            <Calendar size={16} />
            School Year
          </label>
          <select
            value={sy}
            onChange={e => setSy(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', outline: 'none' }}
          >
            {years.map(y => (
              <option key={y} value={y}>{y.startsWith('SY ') ? y : `SY ${y}`}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.75rem' }}>
            <Building size={16} />
            Centers
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            {CENTERS.map(center => (
              <button
                key={center}
                onClick={() => handleCenterClick(center)}
                style={{
                  padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                  fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
              >
                {center}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
