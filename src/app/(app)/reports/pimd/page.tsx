'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PCC_CENTERS } from '@/lib/types'
import { Download, Filter, Printer, ZoomIn, ZoomOut, Maximize2, AlignCenter } from 'lucide-react'

const NAVY      = '#0b2b53' 
const HDR_NAVY  = '#0f3c5f'
const HDR_LOGO  = '#16547c'
const CHART_BG  = '#ffffff'
const WHITE     = '#FFFFFF'
const BGD_GRAD  = 'linear-gradient(160deg, #d8edf8 0%, #ffffff 40%, #ffffff 100%)'

const ARTBOARD_WIDTH  = 1414
const ARTBOARD_HEIGHT = 2000
const ZOOM_STEP = 0.05
const MIN_ZOOM  = 0.20
const MAX_ZOOM  = 1.50

type ZoomMode = 'fit-page' | 'fit-width' | 'custom'

const YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026']
const MONTHS = [
  ['1','January'],['2','February'],['3','March'],['4','April'],
  ['5','May'],['6','June'],['7','July'],['8','August'],
  ['9','September'],['10','October'],['11','November'],['12','December'],
]

const formatCount = (value: unknown): string => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return Math.round(number).toLocaleString('en-US')
}
function cur(v: number) { return '\u20b1' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

const MILK_LABEL: Record<string, string> = {
  PM: 'Pasteurized Milk', SM: 'Sterilized Milk', SMP: 'Skim Milk Powder', Karabao: 'Karabao Milk',
}

interface Stats {
  grossIncome: number; grossRevenue: number; dswdCenters: number
  totalBene: number; beneByFunder: Record<string, number>
  totalPacks: number; packsByFunder: Record<string, number>
  volumeByType: Record<string, number>; packsBySize: Record<string, number>
  coopCount: number; districtCount: number; divisionCount: number
  provinceCount: number; schoolCount: number
}

function FittedText({ text, maxWidth, maxSize = 62, minSize = 30, weight = 900, color = WHITE }: {
  text: string; maxWidth: number; maxSize?: number; minSize?: number; weight?: number; color?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    let size = maxSize
    el.style.fontSize = `${size}px`
    while (el.scrollWidth > el.clientWidth && size > minSize) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
  }, [text, maxWidth, maxSize, minSize])
  return (
    <div ref={ref} className="pimd-fitted-val" style={{ width: maxWidth, fontWeight: weight, color, whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '-1px', textAlign: 'center', overflow: 'visible', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {text}
    </div>
  )
}

function BarChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v >= 0)
  if (!entries.length) entries.push(['Pasteurized Milk', 0], ['Sterilized Milk', 0], ['Commercial Milk', 0])
  const maxVal = Math.max(...entries.map(([, v]) => v), 1)
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal || 1)))
  const yMax = Math.ceil((maxVal || 1) / mag) * mag
  const steps = 4
  const vW = 622, vH = 342, PL = 70, PB = 40, PT = 80, PR = 20
  const cW = vW - PL - PR, cH = vH - PT - PB
  const bGap = cW / entries.length
  const bW = Math.min(bGap * 0.7, 80)
  const fmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
      <text x={vW / 2} y={45} textAnchor="middle" fontSize={26} fontWeight="900" fill={NAVY}>MILK UTILIZED</text>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const val = (yMax / steps) * i
        const y = PT + cH - (val / yMax) * cH
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={vW - PR} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PL - 10} y={y + 5} textAnchor="end" fontSize={11} fill="#6b7280">{fmt.format(val)}</text>
          </g>
        )
      })}
      {entries.map(([type, val], i) => {
        const bH = Math.max((val / yMax) * cH, 2)
        const x = PL + i * bGap + (bGap - bW) / 2
        const y = PT + cH - bH
        const label = MILK_LABEL[type] ?? type
        return (
          <g key={type}>
            <rect x={x} y={y} width={bW} height={bH} fill={NAVY} />
            <text x={x + bW / 2} y={y - 8} textAnchor="middle" fontSize={11} fontWeight="bold" fill={NAVY}>{formatCount(val)}</text>
            <text x={x + bW / 2} y={PT + cH + 20} textAnchor="middle" fontSize={11} fill="#4b5563" fontWeight="600">{label}</text>
          </g>
        )
      })}
    </svg>
  )
}

function HBar({ data }: { data: Record<string, number> }) {
  const categories = ['180 ML CAN/POUCH', '200 POUCH', '500 ML', '1 LITER BOTTLE']
  const entries = categories.map(cat => [cat, data[cat] || 0] as const)
  const maxVal = Math.max(...entries.map(([, v]) => v), 1)
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal || 1)))
  const yMax = Math.ceil((maxVal || 1) / mag) * mag
  const vW = 644, vH = 342, rowH = 46, labelW = 160, numW = 60, PR = 30, PT = 80
  const barAreaW = vW - labelW - numW - PR
  const fmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
      <text x={vW / 2} y={45} textAnchor="middle" fontSize={26} fontWeight="900" fill={WHITE}>PACKAGING AND SIZE</text>
      {entries.map(([type, val], i) => {
        const bW = (val / yMax) * barAreaW
        const y = PT + i * rowH + 5
        const label = (MILK_LABEL[type] ?? type).toUpperCase()
        return (
          <g key={type}>
            <text x={labelW - 15} y={y + 20} textAnchor="end" fontSize={11} fill={WHITE} fontWeight="600">{label}</text>
            <rect x={labelW} y={y} width={Math.max(bW, 2)} height={26} fill={WHITE} />
            <text x={labelW + Math.max(bW, 2) + 10} y={y + 18} fontSize={11} fill={WHITE} fontWeight="600">{formatCount(val)}</text>
          </g>
        )
      })}
      <line x1={labelW} y1={PT + entries.length * rowH + 10} x2={vW - PR} y2={PT + entries.length * rowH + 10} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
      {Array.from({ length: 7 }, (_, i) => {
        const v = (yMax / 6) * i
        const x = labelW + (v / yMax) * barAreaW
        return (
          <g key={i}>
            <line x1={x} y1={PT + entries.length * rowH + 10} x2={x} y2={PT + entries.length * rowH + 15} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
            <text x={x + 10} y={PT + entries.length * rowH + 25} fontSize={9} fill="rgba(255,255,255,0.9)" transform={`rotate(-45 ${x + 10} ${PT + entries.length * rowH + 25})`} textAnchor="end" fontWeight="500">{fmt.format(v)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function PimdFactsheet({ stats, eff, showReference }: { stats: Stats; eff: string; showReference: boolean }) {
  return (
    <section className="pimd-artboard" style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT, background: BGD_GRAD }}>
      {showReference && <img className="pimd-reference-overlay" src="/__pimd_reference__/inforgraphic-template.png" alt="" style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }} data-html2canvas-ignore="true" />}

      {/* HEADER */}
      <div style={{ position: 'absolute', left: 14, top: 73, width: 1084, height: 215, background: HDR_NAVY, zIndex: 1 }} />
      <div style={{ position: 'absolute', left: 1098, top: 93, width: 295, height: 195, background: HDR_LOGO, zIndex: 1 }} />
      <div style={{ position: 'absolute', left: 49, top: 110, zIndex: 2 }}>
        <h1 style={{ margin: 0, padding: 0, fontSize: 62, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-1px', color: WHITE }}>
          <span style={{ display: 'block' }}>MILK FEEDING PROGRAM</span>
          <span style={{ display: 'block' }}>FACTSHEET</span>
        </h1>
        <div style={{ width: 868, height: 2, background: WHITE, marginTop: 12 }} />
        <div style={{ marginTop: 14, fontSize: 28, fontWeight: 500, color: WHITE, letterSpacing: '1px' }}>{eff}</div>
      </div>
      <div className="pimd-asset-wrapper" style={{ left: 1113, top: 135, width: 115, height: 115, zIndex: 2 }}>
        <img src="/assets/pimd-infographic/06_DA_PCC_LOGO_TRANSPARENT.png" alt="DA Logo" className="pimd-transparent-asset" />
      </div>
      <div className="pimd-asset-wrapper" style={{ left: 1245, top: 125, width: 125, height: 125, zIndex: 2 }}>
        <img src="/assets/pimd-infographic/04_BAGONG_PILIPINAS_TRANSPARENT.png" alt="Bagong Pilipinas" className="pimd-transparent-asset" />
      </div>

      {/* ROW 1: GROSS INCOME / REVENUE */}
      <div className="abs-card" style={{ left: 66, top: 326, width: 928, height: 138, background: NAVY }}>
        <div className="box-title" style={{ fontSize: 24, fontWeight: 500, marginBottom: 8, letterSpacing: '1px' }}>GROSS INCOME FROM THE RAW MILK</div>
        <FittedText text={cur(stats.grossIncome)} maxWidth={840} maxSize={72} minSize={44} />
      </div>
      <div className="abs-card" style={{ left: 1022, top: 326, width: 325, height: 138, background: NAVY }}>
        <div className="box-title" style={{ fontSize: 18, lineHeight: 1.2, fontWeight: 500, marginBottom: 8, letterSpacing: '0.5px' }}>MILK FEEDING PROGRAM<br />ACCOMPLISHMENT</div>
        <div className="box-val" style={{ fontSize: 68 }}>00%</div>
      </div>

      <div className="abs-card" style={{ left: 66, top: 486, width: 928, height: 138, background: NAVY }}>
        <div className="box-title" style={{ fontSize: 24, fontWeight: 500, marginBottom: 8, letterSpacing: '1px' }}>GROSS REVENUE EARNED (COOPERATIVE)</div>
        <FittedText text={cur(stats.grossRevenue)} maxWidth={840} maxSize={72} minSize={44} />
      </div>
      <div className="abs-card" style={{ left: 1022, top: 486, width: 325, height: 138, background: NAVY }}>
        <div className="box-title" style={{ fontSize: 16, lineHeight: 1.2, fontWeight: 500, marginBottom: 8, padding: '0 20px', letterSpacing: '0.5px' }}>NO. OF CHILD DEVELOPMENT<br />CENTERS UNDER DSWD</div>
        <div className="box-val" style={{ fontSize: 68 }}>{formatCount(stats.dswdCenters)}</div>
        <img src="/assets/pimd-infographic/01_DSWD_LOGO_TRANSPARENT.png" alt="DSWD" style={{ position: 'absolute', right: 20, bottom: 20, objectFit: 'contain', width: 44, height: 44, zIndex: 5 }} />
      </div>

      {/* ROW 2: BENEFICIARIES */}
      <div style={{ position: 'absolute', left: 100, top: 660, width: 1214, height: 280, border: `6px solid ${NAVY}`, borderRadius: 40, zIndex: 1 }} />
      
      {/* Total Beneficiaries Inner Card */}
      <div className="abs-card" style={{ left: 110, top: 670, width: 590, height: 140, background: WHITE, borderRadius: 34, zIndex: 2, border: `4px solid ${NAVY}` }}>
        <div className="box-title" style={{ fontSize: 18, fontWeight: 600, color: NAVY, marginBottom: 8 }}>TOTAL NUMBER OF CHILDREN BENEFICIARIES</div>
        <FittedText text={formatCount(stats.totalBene)} maxWidth={400} maxSize={68} minSize={40} color={NAVY} />
      </div>
      <div className="pimd-asset-wrapper" style={{ left: 108, top: 730, width: 110, height: 80, zIndex: 3 }}>
        <img src="/assets/pimd-infographic/03_TWO_CHILDREN_TRANSPARENT.png" alt="Children" className="pimd-transparent-asset" />
      </div>

      {/* Milk Packs Inner Card */}
      <div className="abs-card" style={{ left: 714, top: 670, width: 590, height: 140, background: NAVY, borderRadius: 34, zIndex: 2 }}>
        <div className="box-title" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>MILK PACKS DISTRIBUTED TO CHILDREN BENEFICIARIES</div>
        <FittedText text={formatCount(stats.totalPacks)} maxWidth={400} maxSize={68} minSize={40} />
      </div>
      <div className="pimd-asset-wrapper" style={{ left: 1190, top: 730, width: 110, height: 80, zIndex: 3 }}>
        <img src="/assets/pimd-infographic/05_THREE_CHILDREN_ILLUSTRATION_TRANSPARENT.png" alt="Children" className="pimd-transparent-asset" />
      </div>

      {/* Breakdown */}
      <div style={{ position: 'absolute', left: 110, top: 820, width: 590, height: 100, zIndex: 2, display: 'flex', justifyContent: 'space-evenly', alignItems: 'center' }}>
        {['DSWD','DEPED','LGU','OTHERS'].map(f => (
          <div key={f} style={{ textAlign: 'center', width: '25%' }}>
            <div style={{ color: NAVY, fontWeight: 900, fontSize: 32, lineHeight: 1 }}><FittedText text={formatCount(stats.beneByFunder[f] || 0)} maxWidth={130} maxSize={32} minSize={16} color={NAVY} /></div>
            <div style={{ color: NAVY, fontWeight: 800, fontSize: 18, marginTop: 4 }}>{f}</div>
          </div>
        ))}
      </div>
      
      <div style={{ position: 'absolute', left: 707, top: 830, width: 4, height: 80, background: NAVY, zIndex: 2 }} />

      <div style={{ position: 'absolute', left: 714, top: 820, width: 590, height: 100, zIndex: 2, display: 'flex', justifyContent: 'space-evenly', alignItems: 'center' }}>
        {['DSWD','DEPED','LGU','OTHERS'].map(f => (
          <div key={f} style={{ textAlign: 'center', width: '25%' }}>
            <div style={{ color: NAVY, fontWeight: 900, fontSize: 32, lineHeight: 1 }}><FittedText text={formatCount(stats.packsByFunder[f] || 0)} maxWidth={130} maxSize={32} minSize={16} color={NAVY} /></div>
            <div style={{ color: NAVY, fontWeight: 800, fontSize: 18, marginTop: 4 }}>{f}</div>
          </div>
        ))}
      </div>

      {/* ROW 3: CHARTS */}
      <div style={{ position: 'absolute', left: 66, top: 980, width: 622, height: 342, background: CHART_BG, borderRadius: 32, zIndex: 1, border: `2px solid #e5e7eb` }}>
        <BarChart data={stats.volumeByType} />
      </div>
      <div style={{ position: 'absolute', left: 714, top: 980, width: 644, height: 342, background: NAVY, borderRadius: 32, zIndex: 1 }}>
        <HBar data={stats.packsBySize} />
      </div>

      {/* ROW 4: BOTTOM GRID & IMAGE */}
      <div className="pimd-asset-wrapper" style={{ left: 0, top: 1260, width: 800, height: 740, zIndex: 10 }}>
        <img src="/assets/pimd-infographic/08_THREE_CHILDREN_DRINKING_MILK_TRANSPARENT.png" alt="Children drinking" className="pimd-transparent-asset" style={{ objectPosition: 'bottom left', pointerEvents: 'none' }} />
      </div>

      {/* Milky Boy */}
      <div className="pimd-asset-wrapper" style={{ left: 714, top: 1230, width: 50, height: 90, zIndex: 2 }}>
        <img src="/assets/pimd-infographic/02_MILKY_BOY_TRANSPARENT.png" alt="Milky Boy" className="pimd-transparent-asset" />
      </div>

      <div className="abs-card" style={{ left: 450, top: 1360, width: 256, height: 135, background: NAVY, zIndex: 1 }}>
        <div className="box-title" style={{ fontSize: 16, lineHeight: 1.2 }}>NO. OF COOPERATIVE<br />MILK SUPPLIERS</div>
        <div style={{ marginTop: 12 }}><FittedText text={formatCount(stats.coopCount)} maxWidth={200} maxSize={60} minSize={40} /></div>
      </div>

      <div className="abs-card" style={{ left: 716, top: 1360, width: 639, height: 75, background: NAVY, zIndex: 1, flexDirection: 'row', justifyContent: 'space-between', padding: '0 40px' }}>
        <div className="box-title" style={{ fontSize: 24, margin: 0 }}>NO. OF DISTRICTS SUPPLIED</div>
        <div className="box-val" style={{ fontSize: 56, margin: 0 }}>{formatCount(stats.districtCount)}</div>
      </div>

      <div className="abs-card" style={{ left: 716, top: 1445, width: 345, height: 330, background: NAVY, zIndex: 1 }}>
        <div className="box-title" style={{ fontSize: 22, lineHeight: 1.2, marginBottom: 20 }}>NO. OF SCHOOL<br />DIVISION OFFICE</div>
        <FittedText text={formatCount(stats.divisionCount)} maxWidth={260} maxSize={110} minSize={60} />
      </div>
      <div className="pimd-asset-wrapper" style={{ left: 835, top: 1680, width: 108, height: 60, zIndex: 2, pointerEvents: 'auto' }}>
        <img src="/assets/pimd-infographic/07_DEPED_LOGO_TRANSPARENT.png" alt="DepEd" className="pimd-transparent-asset" />
      </div>

      <div className="abs-card" style={{ left: 1070, top: 1445, width: 285, height: 160, background: NAVY, zIndex: 1 }}>
        <div className="box-title" style={{ fontSize: 18, lineHeight: 1.2 }}>NO. OF PROVINCES<br />SUPPLIED</div>
        <div style={{ marginTop: 12 }}><FittedText text={formatCount(stats.provinceCount)} maxWidth={240} maxSize={64} minSize={40} /></div>
      </div>

      <div className="abs-card" style={{ left: 1070, top: 1615, width: 285, height: 160, background: NAVY, zIndex: 1 }}>
        <div className="box-title" style={{ fontSize: 18, lineHeight: 1.2 }}>NO. OF SCHOOLS<br />SUPPLIED</div>
        <div style={{ marginTop: 12 }}><FittedText text={formatCount(stats.schoolCount)} maxWidth={240} maxSize={64} minSize={40} /></div>
      </div>
    </section>
  )
}

const ALL_CENTERS_VALUE = '__ALL_CENTERS__'

export default function PIMDReportPage() {
  const supabase = createClient()
  const [center, setCenter] = useState(ALL_CENTERS_VALUE)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEncoder, setIsEncoder] = useState(false)
  const [showReference, setShowReference] = useState(false)

  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-page')
  const [customScale, setCustomScale] = useState(1)
  const [displayScale, setDisplayScale] = useState(0.5)
  const [isCapturing, setIsCapturing] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)

  const viewerRef = useRef<HTMLDivElement>(null)

  const getFilename = useCallback(() => {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '-')
    const cLabel = center === ALL_CENTERS_VALUE ? 'All-Centers' : sanitize(center || 'All-Centers')
    const yLabel = year || 'All-Years'
    const mLabel = month ? (MONTHS.find(([v]) => v === month)?.[1] ?? month) : 'All-Months'
    return \`Milk_Feeding_Program_Factsheet_\${cLabel}_\${yLabel}_\${sanitize(mLabel)}.pdf\`
  }, [center, year, month])

  const recalcScale = useCallback(() => {
    if (!viewerRef.current) return
    const rect = viewerRef.current.getBoundingClientRect()
    const aw = rect.width
    const ah = window.innerHeight - rect.top - 16
    if (zoomMode === 'fit-page') {
      const s = Math.min((aw - 32) / ARTBOARD_WIDTH, (ah - 32) / ARTBOARD_HEIGHT, 1)
      setDisplayScale(Math.max(s, MIN_ZOOM))
    } else if (zoomMode === 'fit-width') {
      const s = Math.min((aw - 32) / ARTBOARD_WIDTH, 1)
      setDisplayScale(Math.max(s, MIN_ZOOM))
    } else {
      setDisplayScale(customScale)
    }
  }, [zoomMode, customScale])

  useEffect(() => {
    const ro = new ResizeObserver(() => recalcScale())
    if (viewerRef.current) ro.observe(viewerRef.current)
    window.addEventListener('resize', recalcScale)
    recalcScale()
    return () => { ro.disconnect(); window.removeEventListener('resize', recalcScale) }
  }, [recalcScale])

  useEffect(() => { if (!loading) setTimeout(recalcScale, 100) }, [loading, recalcScale])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('compare') === '1') setShowReference(true)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('role,center').eq('id', user.id).single().then(({ data }) => {
        if (!data) return
        if (data.role === 'encoder') {
          setIsEncoder(true)
          const cc = data.center === 'NHQGP (NIZ)' ? 'NIZ' : (data.center || ALL_CENTERS_VALUE)
          setCenter(cc)
        }
      })
    })
  }, [])

  useEffect(() => { fetchData() }, [center, year, month])

  async function fetchData() {
    setLoading(true)
    setStats(null)
    let q = supabase
      .from('mfp_data')
      .select('beneficiaries,milk_packs,milk_cost,total_funds_transferred,funded_by,center,province,division,municipality,elementary_school,milk_type,total_volume_requirements,supplier_id,date_started')
      .range(0, 49999)
    if (center && center !== ALL_CENTERS_VALUE) q = q.eq('center', center)
    if (year) q = q.eq('year', parseInt(year))
    let { data: rows } = await q
    rows = rows ?? []
    if (month && rows.length) {
      const m = parseInt(month)
      rows = rows.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
    }
    const grossIncome  = rows.reduce((s, r) => s + (r.milk_cost || 0), 0)
    const grossRevenue = rows.reduce((s, r) => s + (r.total_funds_transferred || 0), 0)
    const totalBene    = rows.reduce((s, r) => s + (r.beneficiaries || 0), 0)
    const totalPacks   = rows.reduce((s, r) => s + (r.milk_packs || 0), 0)
    const beneByFunder: Record<string, number>  = {}
    const packsByFunder: Record<string, number> = {}
    const volumeByType: Record<string, number>  = {}
    const packsBySize: Record<string, number>   = {}
    rows.forEach(r => {
      const f = r.funded_by || 'OTHERS'
      beneByFunder[f]  = (beneByFunder[f]  || 0) + (r.beneficiaries || 0)
      packsByFunder[f] = (packsByFunder[f] || 0) + (r.milk_packs || 0)
      const t = r.milk_type || 'Unknown'
      volumeByType[t]  = (volumeByType[t]  || 0) + (r.total_volume_requirements || 0)
      let size = 'OTHER'
      if (r.milk_packs > 0 && r.total_volume_requirements > 0) {
        const ml = (r.total_volume_requirements / r.milk_packs) * 1000
        if (Math.abs(ml - 180) < 10) size = '180 ML CAN/POUCH'
        else if (Math.abs(ml - 200) < 10) size = '200 POUCH'
        else if (Math.abs(ml - 500) < 10) size = '500 ML'
        else if (Math.abs(ml - 1000) < 10) size = '1 LITER BOTTLE'
        else size = \`\${Math.round(ml)} ML\`
      } else {
        if (t === 'PM') size = '180 ML CAN/POUCH'
        else if (t === 'Karabao') size = '200 POUCH'
        else if (t === 'SM') size = '500 ML'
        else if (t === 'SMP') size = '1 LITER BOTTLE'
      }
      packsBySize[size] = (packsBySize[size] || 0) + (r.milk_packs || 0)
    })
    setStats({
      grossIncome, grossRevenue,
      dswdCenters: new Set(rows.filter(r => r.funded_by === 'DSWD').map(r => r.center)).size,
      totalBene, beneByFunder, totalPacks, packsByFunder, volumeByType, packsBySize,
      coopCount:    new Set(rows.map(r => r.supplier_id).filter(Boolean)).size,
      districtCount: new Set(rows.map(r => r.municipality).filter(Boolean)).size,
      divisionCount: new Set(rows.map(r => r.division).filter(Boolean)).size,
      provinceCount: new Set(rows.map(r => r.province).filter(Boolean)).size,
      schoolCount:   new Set(rows.map(r => r.elementary_school).filter(Boolean)).size,
    })
    setLoading(false)
  }

  const zoomIn  = () => { const n = Math.min(displayScale + ZOOM_STEP, MAX_ZOOM); setCustomScale(n); setZoomMode('custom') }
  const zoomOut = () => { const n = Math.max(displayScale - ZOOM_STEP, MIN_ZOOM); setCustomScale(n); setZoomMode('custom') }
  const set100  = () => { setCustomScale(1); setZoomMode('custom') }

  async function capturePimdCanonicalSnapshot(): Promise<{ blob: Blob; objectUrl: string; logicalWidth: 1414; logicalHeight: 2000; pixelWidth: number; pixelHeight: number }> {
    const el = document.getElementById('pimd-capture-host')
    if (!el) throw new Error('Capture host not found')
    const captureArtboard = el.querySelector('.pimd-artboard') as HTMLElement
    if (!captureArtboard) throw new Error('Artboard not found inside capture host')

    await document.fonts.ready
    const images = Array.from(el.querySelectorAll<HTMLImageElement>('img'))
    await Promise.all(images.map(async img => {
      if (!img.complete) await new Promise<void>(res => {
        img.addEventListener('load', () => res(), { once: true })
        img.addEventListener('error', () => res(), { once: true })
      })
      try { await img.decode() } catch { /* ok */ }
    }))
    
    // wait for 2 frames
    await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))

    const h2c = (await import('html2canvas')).default
    
    // Un-scale the artboard if it was scaled somehow, but it shouldn't be inside the capture host
    captureArtboard.style.transform = 'none'
    captureArtboard.style.transformOrigin = 'top left'
    captureArtboard.style.width = '1414px'
    captureArtboard.style.height = '2000px'

    const canvas = await h2c(captureArtboard, {
      scale: 2, useCORS: true, allowTaint: false, backgroundColor: null,
      logging: false,
      width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT,
      windowWidth: ARTBOARD_WIDTH, windowHeight: ARTBOARD_HEIGHT,
      scrollX: 0, scrollY: 0,
      onclone: (doc) => {
        const clonedHost = doc.getElementById('pimd-capture-host')
        if (clonedHost) {
          clonedHost.style.position = 'relative'
          clonedHost.style.left = '0'
          clonedHost.style.top = '0'
        }
        const cl = doc.querySelector('#pimd-capture-host .pimd-artboard') as HTMLElement
        if (cl) {
          cl.style.transform = 'none'
          cl.style.transformOrigin = 'top left'
          cl.style.width = '1414px'
          cl.style.height = '2000px'
          cl.style.position = 'relative'
          cl.style.left = '0'
          cl.style.top = '0'
          cl.style.overflow = 'hidden' // Root boundary clip

          cl.querySelectorAll<HTMLElement>('.pimd-fitted-val').forEach(n => {
            n.style.overflow = 'visible'
          })
          
          const ov = doc.querySelector('.pimd-reference-overlay')
          if (ov) (ov as HTMLElement).style.display = 'none'
        }
      }
    })

    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'))
    const objectUrl = URL.createObjectURL(blob)
    return {
      blob, objectUrl, logicalWidth: 1414, logicalHeight: 2000, pixelWidth: canvas.width, pixelHeight: canvas.height
    }
  }

  const openPreviewModal = async () => {
    if (isCapturing || !stats) return
    setIsCapturing(true)
    try {
      const snapshot = await capturePimdCanonicalSnapshot()
      setPreviewBlob(snapshot.blob)
      setPreviewSrc(snapshot.objectUrl)
    } catch (err) {
      console.error(err)
      alert('Capture failed. Please try again.')
    } finally { setIsCapturing(false) }
  }

  const closePreviewModal = () => {
    if (previewSrc) URL.revokeObjectURL(previewSrc)
    setPreviewSrc(null)
    setPreviewBlob(null)
  }

  const handleDownloadPDF = async () => {
    if (!previewBlob) return
    try {
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(previewBlob)
      })
      const img = new Image()
      img.src = dataUrl
      await new Promise<void>(res => { img.onload = () => res() })
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 1
      const availableWidth = pageWidth - margin * 2
      const availableHeight = pageHeight - margin * 2
      
      const snapshotRatio = img.width / img.height
      let imageWidth = availableWidth
      let imageHeight = imageWidth / snapshotRatio

      if (imageHeight > availableHeight) {
        imageHeight = availableHeight
        imageWidth = imageHeight * snapshotRatio
      }

      const x = (pageWidth - imageWidth) / 2
      const y = (pageHeight - imageHeight) / 2

      pdf.addImage(dataUrl, 'PNG', x, y, imageWidth, imageHeight, undefined, 'FAST')
      pdf.save(getFilename())
    } catch (err) {
      console.error(err)
      alert('PDF export failed. Please try again.')
    }
  }

  const handlePrintFromModal = () => {
    if (!previewSrc) return
    const style = document.getElementById('pimd-print-style')
    if (style) style.remove()
    const s = document.createElement('style')
    s.id = 'pimd-print-style'
    s.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 0; }
        body > *:not(#pimd-print-frame) { display: none !important; }
        #pimd-print-frame {
          position: fixed !important; inset: 0 !important;
          width: 210mm !important; height: 297mm !important;
          margin: 0 !important; padding: 1mm !important;
          display: flex !important; align-items: center !important;
          justify-content: center !important; background: white !important;
          z-index: 999999 !important; overflow: hidden !important;
        }
        #pimd-print-frame img {
          display: block !important; width: 100% !important; height: 100% !important;
          object-fit: contain !important; object-position: center !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `
    document.head.appendChild(s)
    let frame = document.getElementById('pimd-print-frame')
    if (!frame) {
      frame = document.createElement('div')
      frame.id = 'pimd-print-frame'
      frame.style.cssText = 'position:fixed;inset:0;width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;background:white;z-index:999999;pointer-events:none;opacity:0'
      document.body.appendChild(frame)
    }
    const pImg = document.createElement('img')
    pImg.src = previewSrc
    pImg.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'
    frame.innerHTML = ''
    frame.appendChild(pImg)
    pImg.onload = () => {
      window.print()
      setTimeout(() => {
        frame?.remove()
        s.remove()
      }, 3000)
    }
  }

  const eff = center === ALL_CENTERS_VALUE ? 'ALL CENTERS' : (center === 'NIZ' ? 'NHQGP (NIZ)' : (center || 'ALL CENTERS').toUpperCase())

  const tbBtn = (active: boolean) => ({
    background: active ? NAVY : 'transparent', border: 'none', cursor: 'pointer',
    padding: '4px 8px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 700 as const,
    color: active ? WHITE : NAVY, whiteSpace: 'nowrap' as const,
    display: 'flex', alignItems: 'center', gap: 4,
  })

  const CSS = `
    .pimd-viewer{width:100%;min-width:0;display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:16px;box-sizing:border-box;background:#e5e7eb;border-radius:8px}
    .pimd-viewer.fp{overflow:hidden;align-items:center}
    .pimd-scaled-slot{position:relative;flex:0 0 auto}
    .pimd-artboard{position:absolute;left:0;top:0;overflow:hidden;box-sizing:border-box;font-family:Montserrat,Inter,Arial,sans-serif;transform-origin:top left}
    .pimd-artboard *{box-sizing:border-box;font-family:inherit}
    .pimd-transparent-asset{display:block;max-width:100%;width:100%;height:100%;object-fit:contain;background:transparent!important;border:0;box-shadow:none}
    .pimd-asset-wrapper{position:absolute;background:transparent!important;border:0;box-shadow:none;overflow:visible}
    .pimd-reference-overlay{position:absolute;left:0;top:0;object-fit:fill;pointer-events:none;opacity:0.5;z-index:9999}
    .box-title{color:white;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:center}
    .box-val{color:white;font-weight:900;letter-spacing:-1px;line-height:1;text-align:center}
    .abs-card{position:absolute;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .ztbtn:hover{background:#e2e8f0!important}
    @media print{.no-print{display:none!important}body{background:white!important;margin:0!important}}
    
    .pimd-preview-modal{width:min(900px, 96vw);height:min(96vh, 1080px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:white;border-radius:16px;box-shadow:0 32px 80px rgba(0,0,0,0.5)}
    .pimd-preview-body{min-width:0;min-height:0;display:grid;place-items:center;overflow:hidden;padding:12px;background:#f8fafc}
    .pimd-preview-image{display:block;width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;object-position:center;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,0.18)}
    
    #pimd-capture-host{position:fixed;left:-20000px;top:0;width:1414px;height:2000px;opacity:1;visibility:visible;pointer-events:none}
    #pimd-capture-host .pimd-artboard{width:1414px;height:2000px;transform:none!important;transform-origin:top left;zoom:1}
  `

  const viewerTop = viewerRef.current ? Math.round(viewerRef.current.getBoundingClientRect().top) : 220

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <style>{CSS}</style>

      {/* Filter bar */}
      <div className="no-print" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: NAVY, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Filter size={15} /> Filters:
        </span>
        {!isEncoder && (
          <select value={center} onChange={e => setCenter(e.target.value)}
            style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.83rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
            <option value={ALL_CENTERS_VALUE}>All Centers</option>
            {PCC_CENTERS.map(cc => { const v = cc === 'NHQGP (NIZ)' ? 'NIZ' : cc; return <option key={v} value={v}>{cc}</option> })}
          </select>
        )}
        <select value={year} onChange={e => setYear(e.target.value)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.83rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
          <option value="">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.83rem', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
          <option value="">All Months</option>
          {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={openPreviewModal} disabled={isCapturing || !stats}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: isCapturing ? '#6b7280' : NAVY, color: WHITE, fontWeight: 700, fontSize: '0.83rem', cursor: isCapturing ? 'wait' : 'pointer', boxShadow: '0 2px 8px rgba(15,37,87,0.25)', opacity: !stats ? 0.5 : 1 }}>
            <Download size={14} /> {isCapturing ? 'Capturing…' : 'Download PDF'}
          </button>
          <button onClick={openPreviewModal} disabled={isCapturing || !stats}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: 8, border: `1.5px solid ${NAVY}`, background: 'white', color: NAVY, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', opacity: !stats ? 0.5 : 1 }}>
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Zoom toolbar */}
      <div className="no-print" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 4, background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', width: 'fit-content', fontSize: '0.78rem', color: NAVY }}>
        <button className="ztbtn" aria-label="Zoom out" onClick={zoomOut} title="Zoom Out" style={tbBtn(false)}><ZoomOut size={13} /></button>
        <span style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, padding: '0 4px' }}>{Math.round(displayScale * 100)}%</span>
        <button className="ztbtn" aria-label="Zoom in" onClick={zoomIn} title="Zoom In" style={tbBtn(false)}><ZoomIn size={13} /></button>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 2px' }} />
        <button className="ztbtn" aria-label="Fit Page" onClick={() => setZoomMode('fit-page')} title="Fit complete infographic in viewport" style={tbBtn(zoomMode === 'fit-page')}><Maximize2 size={12} />Fit Page</button>
        <button className="ztbtn" aria-label="Fit Width" onClick={() => setZoomMode('fit-width')} title="Fit to available width" style={tbBtn(zoomMode === 'fit-width')}><AlignCenter size={12} />Fit Width</button>
        <button className="ztbtn" aria-label="100%" onClick={set100} title="View at 100% native size" style={tbBtn(zoomMode === 'custom' && customScale === 1)}>100%</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '5rem', color: '#64748b' }}>⏳ Loading data…</div>
      ) : stats ? (
        <>
          {/* SCREEN VIEWER */}
          <div ref={viewerRef}
            className={`pimd-viewer no-print${zoomMode === 'fit-page' ? ' fp' : ''}`}
            style={{ height: zoomMode === 'fit-page' ? `calc(100vh - ${viewerTop}px - 16px)` : 'auto', minHeight: '300px' }}>
            <div className="pimd-scaled-slot"
              style={{ width: `${ARTBOARD_WIDTH * displayScale}px`, height: `${ARTBOARD_HEIGHT * displayScale}px` }}>
              <div style={{ position: 'absolute', transform: `scale(${displayScale})`, transformOrigin: 'top left' }}>
                <PimdFactsheet stats={stats} eff={eff} showReference={showReference} />
              </div>
            </div>
          </div>

          {/* OFFSCREEN CAPTURE HOST */}
          <div id="pimd-capture-host" aria-hidden="true" className="no-print">
            <PimdFactsheet stats={stats} eff={eff} showReference={showReference} />
          </div>
        </>
      ) : null}

      {/* ── Preview Modal ───────────────────────────────────────────────── */}
      {previewSrc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(4px)' }} className="no-print" onClick={closePreviewModal}>
          <div className="pimd-preview-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1.5px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: NAVY }} />
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: NAVY }}>Milk Feeding Program Factsheet</span>
              </div>
              <button onClick={closePreviewModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.4rem', lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div className="pimd-preview-body">
              <img src={previewSrc} alt="Factsheet preview" className="pimd-preview-image" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1.5px solid #e2e8f0' }}>
              <span style={{ marginRight: 'auto', fontSize: '0.78rem', color: '#94a3b8' }}>1 sheet of paper</span>
              <button onClick={closePreviewModal} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handlePrintFromModal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.2rem', borderRadius: 8, border: `1.5px solid ${NAVY}`, background: 'white', color: NAVY, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer' }}><Printer size={14} /> Print</button>
              <button onClick={handleDownloadPDF} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.4rem', borderRadius: 8, border: 'none', background: NAVY, color: WHITE, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,37,87,0.25)' }}><Download size={14} /> Download PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
