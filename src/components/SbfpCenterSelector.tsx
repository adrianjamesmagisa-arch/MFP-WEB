'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building, Calendar } from 'lucide-react'
import { FALLBACK_SCHOOL_YEARS, labelFromDbYear } from '@/lib/sbfp-year'
import { createClient } from '@/lib/supabase/client'

const CENTERS = ['NHQ', 'UPLB', 'DMMMSU', 'CSU', 'MMSU', 'CLSU', 'LCSF', 'WVSU', 'USF', 'VSU', 'MLPC', 'CMU', 'USM']

export function SbfpCenterSelector() {
  const router = useRouter()
  const [sy, setSy] = useState<string>(FALLBACK_SCHOOL_YEARS[0])
  const [years, setYears] = useState<string[]>([...FALLBACK_SCHOOL_YEARS])

  useEffect(() => {
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
  }, [sy])

  const handleCenterClick = (center: string) => {
    const href = center === 'NHQ' ? '/sbfp/nhq' : `/sbfp/center/${center}`
    router.push(`${href}?sy=${sy}`)
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>SBFP Monitoring</h1>
          <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Select a school year and center to manage procurement and deliveries.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f8fafc', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <Calendar size={18} color="#64748b" />
          <select
            value={sy}
            onChange={e => setSy(e.target.value)}
            style={{
              border: 'none', background: 'transparent', fontSize: '0.9rem', fontWeight: 600, color: '#334155', outline: 'none', cursor: 'pointer'
            }}
          >
            {years.map(y => (
              <option key={y} value={y}>{y.startsWith('SY ') ? y : `SY ${y}`}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '1.25rem'
      }}>
        {CENTERS.map(center => (
          <button
            key={center}
            onClick={() => handleCenterClick(center)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem',
              padding: '2rem', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px',
              cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = 'var(--gold, #f59e0b)'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = '#e2e8f0'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: '14px', background: 'rgba(245, 158, 11, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold, #f59e0b)'
            }}>
              <Building size={28} />
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
              {center}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
