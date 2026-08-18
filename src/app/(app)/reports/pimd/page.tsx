'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PCC_CENTERS } from '@/lib/types'
import { Download, Filter } from 'lucide-react'

const NAVY   = '#0f2557'
const NAVY2  = '#1a3a6b'
const GOLD   = '#f5a623'
const LIGHT  = '#e8f0fb'
const WHITE  = '#ffffff'

const YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026']
const MONTHS = [
  ['1','January'],['2','February'],['3','March'],['4','April'],
  ['5','May'],['6','June'],['7','July'],['8','August'],
  ['9','September'],['10','October'],['11','November'],['12','December'],
]

function fmt(n: number) {
  return n.toLocaleString('en-PH')
}
function fmtCur(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Stats {
  // KPI
  grossIncome: number        // sum milk_cost
  grossRevenue: number       // sum total_funds_transferred
  dswdCenters: number        // distinct centers with DSWD
  // Beneficiaries
  totalBene: number
  beneByFunder: Record<string, number>
  // Packs
  totalPacks: number
  packsByFunder: Record<string, number>
  // Milk utilised (volume by type)
  volumeByType: Record<string, number>
  // Packs by type (packaging)
  packsByType: Record<string, number>
  // Counts
  cooperativesCount: number
  districtsCount: number
  divisionsCount: number
  provincesCount: number
  schoolsCount: number
}

export default function PIMDReportPage() {
  const supabase = createClient()

  const [center, setCenter] = useState('')
  const [year,   setYear]   = useState('')
  const [month,  setMonth]  = useState('')
  const [stats,  setStats]  = useState<Stats | null>(null)
  const [loading,setLoading]= useState(true)
  const [userCenter, setUserCenter] = useState('')
  const [isEncoder, setIsEncoder]   = useState(false)

  // detect role/center on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('role, center').eq('id', user.id).single().then(({ data }) => {
        if (!data) return
        if (data.role === 'encoder') {
          setIsEncoder(true)
          setUserCenter(data.center ?? '')
          setCenter(data.center ?? '')
        }
      })
    })
  }, [])

  useEffect(() => {
    fetchData()
  }, [center, year, month])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('mfp_data')
      .select('beneficiaries, milk_packs, milk_cost, total_funds_transferred, funded_by, center, province, division, municipality, elementary_school, milk_type, total_volume_requirements, supplier_id, date_started')
      .range(0, 49999)

    if (center) q = q.eq('center', center)
    if (year)   q = q.eq('year', parseInt(year))

    let { data: rows } = await q
    rows = rows ?? []

    if (month && rows) {
      const m = parseInt(month)
      rows = rows.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
    }

    // Aggregations
    const grossIncome  = rows.reduce((s, r) => s + (r.milk_cost || 0), 0)
    const grossRevenue = rows.reduce((s, r) => s + (r.total_funds_transferred || 0), 0)
    const totalBene    = rows.reduce((s, r) => s + (r.beneficiaries || 0), 0)
    const totalPacks   = rows.reduce((s, r) => s + (r.milk_packs || 0), 0)

    const dswdCenters = new Set(rows.filter(r => r.funded_by === 'DSWD').map(r => r.center)).size

    const beneByFunder: Record<string, number> = {}
    const packsByFunder: Record<string, number> = {}
    const volumeByType: Record<string, number> = {}
    const packsByType: Record<string, number> = {}

    rows.forEach(r => {
      const f = r.funded_by || 'Others'
      beneByFunder[f]  = (beneByFunder[f]  || 0) + (r.beneficiaries || 0)
      packsByFunder[f] = (packsByFunder[f] || 0) + (r.milk_packs    || 0)

      const t = r.milk_type || 'Unknown'
      volumeByType[t] = (volumeByType[t] || 0) + (r.total_volume_requirements || 0)
      packsByType[t]  = (packsByType[t]  || 0) + (r.milk_packs || 0)
    })

    const distinctSuppliers  = new Set(rows.map(r => r.supplier_id).filter(Boolean)).size
    const distinctProvinces  = new Set(rows.map(r => r.province).filter(Boolean)).size
    const distinctDivisions  = new Set(rows.map(r => r.division).filter(Boolean)).size
    const distinctSchools    = new Set(rows.map(r => r.elementary_school).filter(Boolean)).size
    const distinctDistricts  = new Set(rows.map(r => r.municipality).filter(Boolean)).size

    setStats({
      grossIncome, grossRevenue, dswdCenters,
      totalBene, beneByFunder,
      totalPacks, packsByFunder,
      volumeByType, packsByType,
      cooperativesCount: distinctSuppliers,
      districtsCount: distinctDistricts,
      divisionsCount: distinctDivisions,
      provincesCount: distinctProvinces,
      schoolsCount: distinctSchools,
    })
    setLoading(false)
  }

  function handlePrint() {
    window.print()
  }

  const effectiveCenter = center || (isEncoder ? userCenter : 'ALL CENTERS')
  const filterLabel = [
    effectiveCenter || 'ALL CENTERS',
    year || 'All Years',
    month ? MONTHS.find(m => m[0] === month)?.[1] : 'All Months',
  ].join(' · ')

  // chart helpers
  const maxVol   = Math.max(...Object.values(stats?.volumeByType ?? {}), 1)
  const maxPacks = Math.max(...Object.values(stats?.packsByType  ?? {}), 1)

  const milkTypeLabels: Record<string, string> = {
    PM:      'Pasteurized Milk',
    SM:      'Sterilized Milk',
    SMP:     'Skim Milk Powder',
    Karabao: 'Karabao Milk',
  }
  const milkTypeColors: Record<string, string> = {
    PM: GOLD, SM: '#3b82f6', SMP: '#8b5cf6', Karabao: '#10b981',
  }

  return (
    <>
      {/* ── print CSS ──────────────────────────────── */}
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; }
          body { background: white !important; }
          #pimd-print { width: 210mm; min-height: 297mm; margin: 0 auto; box-shadow: none !important; }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>

      {/* ── Filter bar (hidden in print) ─────────── */}
      <div className="no-print" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: NAVY }}>
          <Filter size={16} /> Filters:
        </div>

        {!isEncoder && (
          <select value={center} onChange={e => setCenter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
            <option value="">All Centers</option>
            {PCC_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <select value={year} onChange={e => setYear(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
          <option value="">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
          <option value="">All Months</option>
          {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <button
          onClick={handlePrint}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.55rem 1.25rem', borderRadius: 8, border: 'none',
            background: NAVY, color: WHITE, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15,37,87,0.25)',
          }}
        >
          <Download size={15} />
          Download PDF
        </button>
      </div>

      {/* ── INFOGRAPHIC ───────────────────────────── */}
      <div id="pimd-print" style={{
        width: '100%', maxWidth: 800, margin: '0 auto',
        fontFamily: "'Plus Jakarta Sans', 'Inter', Arial, sans-serif",
        background: 'white',
        boxShadow: '0 4px 40px rgba(0,0,0,0.15)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>

        {/* ── HEADER ── */}
        <div style={{ background: NAVY, padding: '1.5rem 2rem 1rem', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: WHITE, lineHeight: 1.1, letterSpacing: '-0.5px', textTransform: 'uppercase' }}>
                MILK FEEDING PROGRAM<br />FACTSHEET
              </div>
              <div style={{ width: 200, height: 3, background: GOLD, marginTop: '0.5rem', marginBottom: '0.5rem' }} />
              <div style={{ color: '#a8c4f0', fontWeight: 700, fontSize: '0.9rem', letterSpacing: 2, textTransform: 'uppercase' }}>
                {effectiveCenter || 'NATIONAL IMPACT ZONE'}
              </div>
              <div style={{ color: '#6b93c9', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                {year ? `FY ${year}` : 'All Fiscal Years'}{month ? ` · ${MONTHS.find(m => m[0] === month)?.[1]}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ width: 60, height: 60, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>🐃</div>
              <div style={{ width: 60, height: 60, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>🥛</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b', fontSize: '1rem' }}>
            Loading data…
          </div>
        ) : stats ? (
          <>
            {/* ── ROW 1: INCOME METRICS ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '1rem 1.5rem', background: LIGHT }}>
              {/* Left column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.75rem' }}>
                <div style={{ background: NAVY, borderRadius: 10, padding: '1rem 1.25rem' }}>
                  <div style={{ color: '#90aed6', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    GROSS INCOME FROM THE RAW MILK
                  </div>
                  <div style={{ color: WHITE, fontSize: '1.6rem', fontWeight: 900, marginTop: '0.25rem', letterSpacing: '-0.5px' }}>
                    {fmtCur(stats.grossIncome)}
                  </div>
                </div>
                <div style={{ background: NAVY2, borderRadius: 10, padding: '1rem 1.25rem' }}>
                  <div style={{ color: '#90aed6', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    GROSS REVENUE EARNED (COOPERATIVE)
                  </div>
                  <div style={{ color: WHITE, fontSize: '1.6rem', fontWeight: 900, marginTop: '0.25rem', letterSpacing: '-0.5px' }}>
                    {fmtCur(stats.grossRevenue)}
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '0.75rem' }}>
                <div style={{ background: WHITE, borderRadius: 10, padding: '1rem 1.25rem', border: '1.5px solid #dbeafe', flex: 1 }}>
                  <div style={{ color: NAVY, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    MILK FEEDING PROGRAM ACCOMPLISHMENT
                  </div>
                  <div style={{ color: NAVY, fontSize: '2rem', fontWeight: 900, marginTop: '0.2rem' }}>
                    {stats.totalBene > 0 ? '—' : '0'}%
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.6rem' }}>Target data not available</div>
                </div>
                <div style={{ background: WHITE, borderRadius: 10, padding: '1rem 1.25rem', border: '1.5px solid #dbeafe', display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: NAVY, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                      NO. OF CHILD DEV. CENTERS UNDER DSWD
                    </div>
                    <div style={{ color: '#15803d', fontSize: '2rem', fontWeight: 900, marginTop: '0.2rem' }}>
                      {fmt(stats.dswdCenters)}
                    </div>
                  </div>
                  <div style={{ fontSize: '2rem' }}>🤝</div>
                </div>
              </div>
            </div>

            {/* ── ROW 2: BENEFICIARIES + PACKS ── */}
            <div style={{ background: '#dbeafe', padding: '0.75rem 1.5rem' }}>
              <div style={{ background: LIGHT, borderRadius: 14, padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Left: Beneficiaries */}
                <div>
                  <div style={{ color: NAVY, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    TOTAL NUMBER OF CHILDREN BENEFICIARIES
                  </div>
                  <div style={{ color: NAVY, fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-1px', margin: '0.25rem 0' }}>
                    {fmt(stats.totalBene)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {['DSWD','DepEd','LDS','Others'].map(f => {
                      const val = stats.beneByFunder[f] || 0
                      return (
                        <div key={f} style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 900, fontSize: '1rem', color: NAVY }}>{fmt(val)}</div>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{f}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Right: Packs */}
                <div style={{ borderLeft: '2px solid #bfdbfe', paddingLeft: '1.25rem' }}>
                  <div style={{ color: NAVY, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    MILK PACKS DISTRIBUTED TO CHILDREN
                  </div>
                  <div style={{ color: '#0369a1', fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-1px', margin: '0.25rem 0' }}>
                    {fmt(stats.totalPacks)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {['DSWD','DepEd','LDS','Others'].map(f => {
                      const val = stats.packsByFunder[f] || 0
                      return (
                        <div key={f} style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 900, fontSize: '1rem', color: '#0369a1' }}>{fmt(val)}</div>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{f}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── ROW 3: CHARTS ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* Left: Milk Utilized (vertical bar chart) */}
              <div style={{ background: WHITE, padding: '1rem 1.5rem', borderRight: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 900, fontSize: '0.85rem', color: NAVY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem', textAlign: 'center' }}>
                  MILK UTILIZED (Volume L)
                </div>
                {/* Bar chart */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: 120, padding: '0 0.5rem' }}>
                  {Object.entries(stats.volumeByType).sort((a,b) => b[1]-a[1]).map(([type, vol]) => {
                    const pct = (vol / maxVol) * 100
                    const col = milkTypeColors[type] ?? '#64748b'
                    return (
                      <div key={type} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: NAVY, textAlign: 'center' }}>
                          {vol >= 1000 ? `${(vol/1000).toFixed(0)}K` : Math.round(vol)}
                        </div>
                        <div style={{ width: '100%', background: col, borderRadius: '4px 4px 0 0', height: `${Math.max(pct, 4)}%` }} />
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#475569', textAlign: 'center', wordBreak: 'break-word', lineHeight: 1.2 }}>
                          {milkTypeLabels[type] ?? type}
                        </div>
                      </div>
                    )
                  })}
                  {Object.keys(stats.volumeByType).length === 0 && (
                    <div style={{ flex: 1, color: '#94a3b8', fontSize: '0.75rem', textAlign: 'center' }}>No data</div>
                  )}
                </div>
              </div>

              {/* Right: Packaging and Size (horizontal bars) */}
              <div style={{ background: NAVY, padding: '1rem 1.5rem' }}>
                <div style={{ fontWeight: 900, fontSize: '0.85rem', color: WHITE, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem', textAlign: 'center' }}>
                  PACKAGING AND SIZE (Packs)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {Object.entries(stats.packsByType).sort((a,b) => b[1]-a[1]).map(([type, packs]) => {
                    const pct = (packs / maxPacks) * 100
                    const col = milkTypeColors[type] ?? GOLD
                    return (
                      <div key={type}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#90aed6', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 700 }}>{milkTypeLabels[type] ?? type}</span>
                          <span style={{ fontWeight: 700, color: WHITE }}>{fmt(packs)}</span>
                        </div>
                        <div style={{ height: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 6 }}>
                          <div style={{ height: '100%', width: `${Math.max(pct,2)}%`, background: col, borderRadius: 6, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                  {Object.keys(stats.packsByType).length === 0 && (
                    <div style={{ color: '#90aed6', fontSize: '0.75rem', textAlign: 'center' }}>No data</div>
                  )}
                </div>
              </div>
            </div>

            {/* ── ROW 4: BOTTOM COUNTS ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', background: LIGHT }}>
              {/* Left: Coop suppliers */}
              <div style={{ background: NAVY, padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '2.5rem' }}>🏭</div>
                <div style={{ color: '#90aed6', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
                  NO. OF COOPERATIVE<br />MILK SUPPLIERS
                </div>
                <div style={{ color: GOLD, fontSize: '2.5rem', fontWeight: 900 }}>
                  {fmt(stats.cooperativesCount)}
                </div>
              </div>

              {/* Right: 4-grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                {/* Districts */}
                <div style={{ background: NAVY2, padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ color: '#90aed6', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    NO. OF DISTRICTS SUPPLIED
                  </div>
                  <div style={{ color: GOLD, fontSize: '2.2rem', fontWeight: 900 }}>{fmt(stats.districtsCount)}</div>
                </div>

                {/* Division */}
                <div style={{ background: NAVY2, padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ color: '#90aed6', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    NO. OF SCHOOL<br />DIVISION OFFICE
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ color: GOLD, fontSize: '2.2rem', fontWeight: 900 }}>{fmt(stats.divisionsCount)}</div>
                    <div style={{ fontSize: '1.4rem' }}>📚</div>
                  </div>
                </div>

                {/* Provinces */}
                <div style={{ background: LIGHT, padding: '1rem 1.25rem', borderRight: '1px solid rgba(15,37,87,0.1)' }}>
                  <div style={{ color: NAVY, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    NO. OF PROVINCES SUPPLIED
                  </div>
                  <div style={{ color: NAVY, fontSize: '2.2rem', fontWeight: 900 }}>{fmt(stats.provincesCount)}</div>
                </div>

                {/* Schools */}
                <div style={{ background: WHITE, padding: '1rem 1.25rem' }}>
                  <div style={{ color: NAVY, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    NO. OF SCHOOLS SUPPLIED
                  </div>
                  <div style={{ color: NAVY, fontSize: '2.2rem', fontWeight: 900 }}>{fmt(stats.schoolsCount)}</div>
                </div>
              </div>
            </div>

            {/* ── FOOTER ── */}
            <div style={{ background: NAVY, padding: '0.6rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#6b93c9', fontSize: '0.65rem' }}>
                DA-PCC Milk Feeding Program Monitoring System
              </div>
              <div style={{ color: '#6b93c9', fontSize: '0.65rem' }}>
                Generated: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} · {filterLabel}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}
