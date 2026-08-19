'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PCC_CENTERS } from '@/lib/types'
import { Download, Filter, Printer, ZoomIn, ZoomOut, Maximize2, AlignCenter } from 'lucide-react'

const NAVY      = '#002C65'
const HDR_NAVY  = '#12476A'
const HDR_LOGO  = '#13547E'
const CHART_BG  = '#F3FBFE'
const WHITE     = '#FFFFFF'
const BGD_GRAD  = 'linear-gradient(to bottom, #d6eaf8 0%, #ffffff 40%, #ffffff 70%, #d5e5ec 100%)'

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

function FittedText({ text, maxWidth, maxSize = 62, minSize = 44, weight = 900, color = WHITE }: {
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
    // overflow:visible is critical — html2canvas clips glyphs (₱, tall numerals, descenders)
    // that extend outside an overflow:hidden box even though the screen looks fine.
    // The fitting loop uses scrollWidth vs clientWidth (horizontal) so visible doesn't break it.
    <div ref={ref} style={{ width: maxWidth, fontWeight: weight, color, whiteSpace: 'nowrap', lineHeight: 1.05, letterSpacing: '-1px', textAlign: 'center', overflow: 'visible', margin: '0 auto', paddingBottom: '3px' }}>
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
  const vW = 622, vH = 342, PL = 70, PB = 40, PT = 60, PR = 20
  const cW = vW - PL - PR, cH = vH - PT - PB
  const bGap = cW / entries.length
  const bW = bGap * 0.6
  const fmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
      <text x={vW / 2} y={35} textAnchor="middle" fontSize={24} fontWeight="900" fill={HDR_NAVY}>MILK UTILIZED</text>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const val = (yMax / steps) * i
        const y = PT + cH - (val / yMax) * cH
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={vW - PR} y2={y} stroke="#d1d5db" strokeWidth={1} />
            <text x={PL - 10} y={y + 5} textAnchor="end" fontSize={12} fill="#4b5563">{fmt.format(val)}</text>
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
            <text x={x + bW / 2} y={PT + cH + 20} textAnchor="middle" fontSize={12} fill="#374151" fontWeight="600">{label}</text>
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
  const vW = 644, vH = 355, rowH = 50, labelW = 160, numW = 60, PR = 30, PT = 60
  const barAreaW = vW - labelW - numW - PR
  const fmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
      <text x={vW / 2} y={35} textAnchor="middle" fontSize={24} fontWeight="900" fill={WHITE}>PACKAGING AND SIZE</text>
      {entries.map(([type, val], i) => {
        const bW = (val / yMax) * barAreaW
        const y = PT + i * rowH + 5
        const label = (MILK_LABEL[type] ?? type).toUpperCase()
        return (
          <g key={type}>
            <text x={labelW - 15} y={y + 20} textAnchor="end" fontSize={13} fill={WHITE} fontWeight="600">{label}</text>
            <rect x={labelW} y={y} width={Math.max(bW, 2)} height={30} fill={WHITE} />
            <text x={labelW + Math.max(bW, 2) + 10} y={y + 20} fontSize={13} fill={WHITE} fontWeight="600">{formatCount(val)}</text>
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
            <text x={x + 15} y={PT + entries.length * rowH + 25} fontSize={11} fill="rgba(255,255,255,0.9)" transform={`rotate(-45 ${x + 15} ${PT + entries.length * rowH + 25})`} textAnchor="end" fontWeight="500">{fmt.format(v)}</text>
          </g>
        )
      })}
    </svg>
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
  // Preview modal state
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)

  const viewerRef = useRef<HTMLDivElement>(null)

  const getFilename = useCallback(() => {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '-')
    const cLabel = center === ALL_CENTERS_VALUE ? 'All-Centers' : sanitize(center || 'All-Centers')
    const yLabel = year || 'All-Years'
    const mLabel = month ? (MONTHS.find(([v]) => v === month)?.[1] ?? month) : 'All-Months'
    return `Milk_Feeding_Program_Factsheet_${cLabel}_${yLabel}_${sanitize(mLabel)}.pdf`
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
        else size = `${Math.round(ml)} ML`
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

  async function waitForAssets() {
    await document.fonts.ready
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('#pimd-factsheet img'))
    await Promise.all(images.map(async img => {
      if (!img.complete) await new Promise<void>(res => {
        img.addEventListener('load', () => res(), { once: true })
        img.addEventListener('error', () => res(), { once: true })
      })
      try { await img.decode() } catch { /* ok */ }
    }))
    await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
  }

  // ─── Shared capture: opens the preview modal ────────────────────────────
  const openPreviewModal = async () => {
    if (isCapturing || !stats) return
    setIsCapturing(true)
    try {
      await waitForAssets()
      const root = document.getElementById('pimd-visible-capture-root') as HTMLElement
      if (!root) throw new Error('PIMD visible capture root was not found.')

      const h2c = (await import('html2canvas')).default
      const canvas = await h2c(root, {
        scale: Math.max(4, Math.ceil(window.devicePixelRatio * 2)),
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        removeContainer: true,
      })

      const blob = await new Promise<Blob>(resolve =>
        canvas.toBlob(b => resolve(b!), 'image/png')
      )
      const src = URL.createObjectURL(blob)
      
      // Mandatory Debug PNG download
      const a = document.createElement('a')
      a.href = src
      a.download = 'pimd-exact-visible-capture-debug.png'
      a.click()

      setPreviewBlob(blob)
      setPreviewSrc(src)
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
      const imageRatio = img.width / img.height
      
      let imageWidth = availableWidth
      let imageHeight = imageWidth / imageRatio
      
      if (imageHeight > availableHeight) {
        imageHeight = availableHeight
        imageWidth = imageHeight * imageRatio
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

  const handlePrint = () => {
    if (!previewSrc) return
    const pw = window.open('', '_blank')
    if (!pw) { alert('Please allow popups for this site.'); return }

    pw.document.write(`<!doctype html>
<html>
<head>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; overflow: hidden; background: white; }
    .page { width: 210mm; height: 297mm; box-sizing: border-box; padding: 1mm; display: flex; justify-content: center; align-items: center; overflow: hidden; }
    .page img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
  <div class="page">
    <img id="pimd-image" />
  </div>
</body>
</html>`)
    pw.document.close()

    const pImg = pw.document.getElementById('pimd-image') as HTMLImageElement | null
    if (pImg) {
      pImg.onload = () => {
        pw.focus()
        pw.print()
        setTimeout(() => pw.close(), 500)
      }
      pImg.src = previewSrc
    } else {
      setTimeout(() => { pw.focus(); pw.print(); pw.close() }, 800)
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
    .box-title{color:white;font-size:25px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .box-val{color:white;font-size:68px;font-weight:900;letter-spacing:-1px;line-height:1}
    .abs-card{position:absolute;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .pimd-header-main{position:absolute;left:0;top:86px;width:1089px;height:270px;padding:0;display:block}
    .pimd-header-logos{position:absolute;left:1090px;top:114px;width:324px;height:213px}
    .pimd-gross-income{position:absolute;left:67px;top:424px;width:928px;height:151px;padding:0 40px}
    .pimd-accomplishment{position:absolute;left:1022px;top:424px;width:325px;height:151px}
    .pimd-gross-revenue{position:absolute;left:71px;top:594px;width:927px;height:150px;padding:0 40px}
    .pimd-dswd-centers{position:absolute;left:1023px;top:594px;width:321px;height:148px;border-radius:20px;overflow:hidden}
    .pimd-beneficiary-frame{position:absolute;left:67px;top:779px;width:1280px;height:293px;background:transparent;border:7px solid rgb(0,83,123);border-radius:64px}
    .pimd-beneficiary-total-card{position:absolute;left:102px;top:813px;width:596px;height:136px;border-radius:18px;padding:0}
    .pimd-milk-packs-card{position:absolute;left:716px;top:813px;width:597px;height:136px;border-radius:18px;padding:0}
    .pimd-milk-utilized-panel{position:absolute;left:63px;top:1129px;width:622px;height:342px;border-radius:40px;box-shadow:0 7px 28px rgba(0,0,0,0.05)}
    .pimd-packaging-panel{position:absolute;left:714px;top:1122px;width:644px;height:355px;border-radius:40px}
    .pimd-bottom-left-blue-block{position:absolute;left:0;top:1524px;width:435px;height:135px;z-index:2}
    .pimd-cooperative-suppliers{position:absolute;left:451px;top:1524px;width:256px;height:135px;padding:0 20px;z-index:4}
    .pimd-districts{position:absolute;left:719px;top:1523px;width:639px;height:73px;flex-direction:row;justify-content:space-between;padding:0 40px;z-index:4}
    .pimd-sdo-card-background{position:absolute;left:719px;top:1606px;width:343px;height:312px;z-index:20}
    .pimd-sdo-card-content{position:absolute;left:719px;top:1606px;width:343px;height:312px;padding:0 30px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:40;pointer-events:none}
    .pimd-provinces{position:absolute;left:1073px;top:1605px;width:285px;height:150px;padding:0 20px;z-index:4}
    .pimd-schools{position:absolute;left:1073px;top:1765px;width:285px;height:151px;padding:0 20px;z-index:4}
    .ztbtn:hover{background:#e2e8f0!important}
    @media print{.no-print{display:none!important}body{background:white!important;margin:0!important}}
    .pimd-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(4px)}
    .pimd-modal-box{background:white;border-radius:16px;box-shadow:0 32px 80px rgba(0,0,0,0.5);display:flex;flex-direction:column;max-width:680px;width:100%;max-height:calc(100vh - 48px);overflow:hidden}
    .pimd-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1.5px solid #e2e8f0;flex-shrink:0}
    .pimd-modal-preview{flex:1;overflow:auto;background:#f8fafc;display:flex;align-items:flex-start;justify-content:center;padding:16px}
    .pimd-modal-preview img{display:block;max-width:100%;height:auto;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,0.18)}
    .pimd-modal-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1.5px solid #e2e8f0;flex-shrink:0}
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
        <div style={{ textAlign: 'center', padding: '5rem', color: '#64748b' }}>â³ Loading dataâ€¦</div>
      ) : stats ? (
        <div ref={viewerRef}
          className={`pimd-viewer no-print${zoomMode === 'fit-page' ? ' fp' : ''}`}
          style={{ height: zoomMode === 'fit-page' ? `calc(100vh - ${viewerTop}px - 16px)` : 'auto', minHeight: '300px' }}>
          <div id="pimd-visible-capture-root" className="pimd-scaled-slot"
            style={{ width: `${ARTBOARD_WIDTH * displayScale}px`, height: `${ARTBOARD_HEIGHT * displayScale}px` }}>
            <section id="pimd-factsheet" className="pimd-artboard"
              style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT, minWidth: ARTBOARD_WIDTH, minHeight: ARTBOARD_HEIGHT, background: BGD_GRAD, transform: `scale(${displayScale})` }}>

              {showReference && <img className="pimd-reference-overlay" src="/__pimd_reference__/inforgraphic-template.png" alt="" style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }} data-html2canvas-ignore="true" />}

              <div className="pimd-header-main" style={{ background: HDR_NAVY }}>
                <h1 style={{ position: 'absolute', margin: 0, padding: 0, fontSize: '64px', fontWeight: 900, lineHeight: 1, letterSpacing: '-1px', color: WHITE, left: '52px', top: '44px', textAlign: 'left' }}>
                  <span style={{ display: 'block' }}>MILK FEEDING PROGRAM</span>
                  <span style={{ display: 'block' }}>FACTSHEET</span>
                </h1>
                <div style={{ position: 'absolute', left: '49px', top: '172px', width: '868px', height: '2px', background: WHITE }} />
                <div style={{ position: 'absolute', left: '52px', top: '201px', fontSize: '24px', fontWeight: 500, color: WHITE, letterSpacing: '1px' }}>{eff}</div>
              </div>

              <div className="pimd-header-logos" style={{ background: HDR_LOGO }}>
                <div className="pimd-asset-wrapper" style={{ left: '40px', top: '53px', width: '124px', height: '108px' }}>
                  <img src="/assets/pimd-infographic/06_DA_PCC_LOGO_TRANSPARENT.png" alt="DA Logo" className="pimd-transparent-asset" />
                </div>
                <div className="pimd-asset-wrapper" style={{ left: '164px', top: '40px', width: '123px', height: '129px' }}>
                  <img src="/assets/pimd-infographic/04_BAGONG_PILIPINAS_TRANSPARENT.png" alt="Bagong Pilipinas" className="pimd-transparent-asset" />
                </div>
              </div>

              <div className="abs-card pimd-gross-income" style={{ background: NAVY }}>
                <div className="box-title" style={{ marginBottom: '10px' }}>GROSS INCOME FROM THE RAW MILK</div>
                <FittedText text={cur(stats.grossIncome)} maxWidth={840} maxSize={62} minSize={44} />
              </div>

              <div className="abs-card pimd-accomplishment" style={{ background: NAVY }}>
                <div className="box-title" style={{ fontSize: '19px' }}>MILK FEEDING PROGRAM<br />ACCOMPLISHMENT</div>
                <div className="box-val" style={{ fontSize: '70px', marginTop: '14px' }}>00%</div>
              </div>

              <div className="abs-card pimd-gross-revenue" style={{ background: NAVY }}>
                <div className="box-title" style={{ marginBottom: '10px' }}>GROSS REVENUE EARNED (COOPERATIVE)</div>
                <FittedText text={cur(stats.grossRevenue)} maxWidth={840} maxSize={62} minSize={44} />
              </div>

              <div className="pimd-dswd-centers" style={{ background: NAVY }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div className="box-title" style={{ fontSize: '18px', lineHeight: 1.15, padding: '0 48px', width: '100%', textAlign: 'center' }}>NO. OF CHILD<br />DEVELOPMENT<br />CENTERS UNDER DSWD</div>
                  <div style={{ width: '100%', marginTop: '4px', textAlign: 'center' }}><FittedText text={formatCount(stats.dswdCenters)} maxWidth={200} maxSize={64} minSize={44} /></div>
                </div>
                <img src="/assets/pimd-infographic/01_DSWD_LOGO_TRANSPARENT.png" alt="DSWD" style={{ position: 'absolute', right: '16px', bottom: '16px', objectFit: 'contain', background: 'transparent', width: '41px', height: '36px', zIndex: 5 }} />
              </div>

              <div className="pimd-beneficiary-frame">
                <div style={{ position: 'absolute', top: '190px', left: 0, width: '640px', display: 'flex', justifyContent: 'space-evenly', alignItems: 'center' }}>
                  {['DSWD','DEPED','LGU','OTHERS'].map(f => (
                    <div key={f} style={{ textAlign: 'center', width: '25%' }}>
                      <div style={{ color: NAVY, fontWeight: 900, fontSize: '40px', lineHeight: 1 }}><FittedText text={formatCount(stats.beneByFunder[f] || 0)} maxWidth={130} maxSize={40} minSize={20} color={NAVY} /></div>
                      <div style={{ color: NAVY, fontWeight: 700, fontSize: '20px' }}>{f}</div>
                    </div>
                  ))}
                </div>
                <div style={{ position: 'absolute', top: '178px', left: '636px', width: '8px', height: '75px', background: NAVY }} />
                <div style={{ position: 'absolute', top: '190px', left: '644px', width: '636px', display: 'flex', justifyContent: 'space-evenly', alignItems: 'center' }}>
                  {['DSWD','DEPED','LGU','OTHERS'].map(f => (
                    <div key={f} style={{ textAlign: 'center', width: '25%' }}>
                      <div style={{ color: NAVY, fontWeight: 900, fontSize: '40px', lineHeight: 1 }}><FittedText text={formatCount(stats.packsByFunder[f] || 0)} maxWidth={130} maxSize={40} minSize={20} color={NAVY} /></div>
                      <div style={{ color: NAVY, fontWeight: 700, fontSize: '20px' }}>{f}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pimd-beneficiary-total-card" style={{ background: NAVY, overflow: 'visible' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '14px', pointerEvents: 'none' }}>
                  <div className="box-title" style={{ width: '100%', padding: '0 12px', textAlign: 'center', fontWeight: 800, lineHeight: 1.05, fontSize: '21px' }}>TOTAL NUMBER OF CHILDREN BENEFICIARIES</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                    <FittedText text={formatCount(stats.totalBene)} maxWidth={346} maxSize={50} minSize={42} />
                  </div>
                </div>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '100px', top: '878px', width: '105px', height: '72px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/03_TWO_CHILDREN_TRANSPARENT.png" alt="Children" className="pimd-transparent-asset" />
              </div>

              <div className="pimd-milk-packs-card" style={{ background: NAVY, overflow: 'visible' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '14px', pointerEvents: 'none' }}>
                  <div className="box-title" style={{ width: '100%', padding: '0 12px', textAlign: 'center', fontWeight: 800, lineHeight: 1.05, fontSize: '19px' }}>MILK PACKS DISTRIBUTED TO CHILDREN<br />BENEFICIARIES</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                    <FittedText text={formatCount(stats.totalPacks)} maxWidth={346} maxSize={48} minSize={42} />
                  </div>
                </div>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '1206px', top: '871px', width: '104px', height: '78px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/05_THREE_CHILDREN_ILLUSTRATION_TRANSPARENT.png" alt="Children" className="pimd-transparent-asset" />
              </div>

              <div className="pimd-milk-utilized-panel" style={{ background: CHART_BG }}><BarChart data={stats.volumeByType} /></div>
              <div className="pimd-packaging-panel" style={{ background: NAVY }}><HBar data={stats.packsBySize} /></div>
              <div className="pimd-asset-wrapper" style={{ left: '727px', top: '1409px', width: '66px', height: '76px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/02_MILKY_BOY_TRANSPARENT.png" alt="Milky Boy" className="pimd-transparent-asset" />
              </div>

              <div className="pimd-bottom-left-blue-block" style={{ background: NAVY }} />
              <div className="pimd-asset-wrapper" style={{ left: '33px', top: '1465px', width: '788px', height: '534px', zIndex: 30 }}>
                <img src="/assets/pimd-infographic/08_THREE_CHILDREN_DRINKING_MILK_TRANSPARENT.png" alt="Children drinking" className="pimd-transparent-asset" style={{ objectPosition: 'bottom left', pointerEvents: 'none' }} />
              </div>

              <div className="abs-card pimd-cooperative-suppliers" style={{ background: NAVY }}>
                <div className="box-title" style={{ fontSize: '18px' }}>NO. OF COOPERATIVE<br />MILK SUPPLIERS</div>
                <div style={{ marginTop: '15px' }}><FittedText text={formatCount(stats.coopCount)} maxWidth={200} maxSize={64} minSize={44} /></div>
              </div>

              <div className="abs-card pimd-districts" style={{ background: NAVY, flexDirection: 'row', justifyContent: 'space-between', padding: '0 40px' }}>
                <div className="box-title" style={{ fontSize: '22px', margin: 0 }}>NO. OF DISTRICTS SUPPLIED</div>
                <div className="box-val" style={{ fontSize: '56px', margin: 0, paddingBottom: '4px' }}>{formatCount(stats.districtCount)}</div>
              </div>

              <div className="pimd-sdo-card-background" style={{ background: NAVY }} />
              <div className="pimd-sdo-card-content">
                <div className="box-title" style={{ fontSize: '24px', marginBottom: '28px', pointerEvents: 'auto' }}>NO. OF SCHOOL<br />DIVISION OFFICE</div>
                <div style={{ pointerEvents: 'auto' }}><FittedText text={formatCount(stats.divisionCount)} maxWidth={250} maxSize={110} minSize={44} /></div>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '838px', top: '1843px', width: '98px', height: '51px', zIndex: 41, pointerEvents: 'auto' }}>
                <img src="/assets/pimd-infographic/07_DEPED_LOGO_TRANSPARENT.png" alt="DepEd" className="pimd-transparent-asset" />
              </div>

              <div className="abs-card pimd-provinces" style={{ background: NAVY }}>
                <div className="box-title" style={{ fontSize: '19px' }}>NO. OF PROVINCES<br />SUPPLIED</div>
                <div style={{ marginTop: '15px' }}><FittedText text={formatCount(stats.provinceCount)} maxWidth={240} maxSize={70} minSize={44} /></div>
              </div>

              <div className="abs-card pimd-schools" style={{ background: NAVY }}>
                <div className="box-title" style={{ fontSize: '19px' }}>NO. OF SCHOOLS<br />SUPPLIED</div>
                <div style={{ marginTop: '15px' }}><FittedText text={formatCount(stats.schoolCount)} maxWidth={240} maxSize={70} minSize={44} /></div>
              </div>

            </section>
          </div>
        </div>
      ) : null}

      {/* ── Preview Modal ───────────────────────────────────────────────── */}
      {previewSrc && (
        <div className="pimd-modal-backdrop no-print" onClick={closePreviewModal}>
          <div className="pimd-modal-box" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="pimd-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: NAVY }} />
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: NAVY }}>
                  Milk Feeding Program Factsheet
                </span>
              </div>
              <button onClick={closePreviewModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.4rem', lineHeight: 1, padding: '0 4px' }}
                aria-label="Close preview">
                ×
              </button>
            </div>

            {/* Preview image */}
            <div className="pimd-modal-preview">
              <img src={previewSrc} alt="Factsheet preview" />
            </div>

            {/* Footer buttons */}
            <div className="pimd-modal-footer">
              <span style={{ marginRight: 'auto', fontSize: '0.78rem', color: '#94a3b8' }}>
                1 sheet of paper
              </span>
              <button onClick={closePreviewModal}
                style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handlePrint}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.2rem', borderRadius: 8, border: `1.5px solid ${NAVY}`, background: 'white', color: NAVY, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer' }}>
                <Printer size={14} /> Print
              </button>
              <button onClick={handleDownloadPDF}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.4rem', borderRadius: 8, border: 'none', background: NAVY, color: WHITE, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,37,87,0.25)' }}>
                <Download size={14} /> Download PDF
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
