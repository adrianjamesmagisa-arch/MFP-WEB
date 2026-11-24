'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { SBFP_DATA_ENCODER_COLUMNS } from '@/lib/encoder-selects'
import { dbYearToSchoolYear, FALLBACK_SCHOOL_YEARS, schoolYearToDbYear } from '@/lib/sbfp-year'
import { reportCenterLabel } from '@/lib/sbfp-report-sync'
import { sbfpCenterAliases, sbfpNavCenter } from '@/lib/center-aliases'
import {
  computeMilkComponentDashboard,
  formatCompactLiters,
  formatCompactPeso,
} from '@/lib/sbfp-dashboard-infographic'
import { Download, Printer, ZoomIn, ZoomOut, Maximize2, AlignCenter, Calendar, RotateCcw, Image as ImageIcon } from 'lucide-react'
import { Spinner } from '@/components/loading/Spinner'

const NAVY = '#033773'
const STRIP_BG = '#D4E6F7'
const GOLD = '#FFDE4F'
const WHITE = '#FFFFFF'

const ARTBOARD_WIDTH = 1414
const ARTBOARD_HEIGHT = 2000
const ZOOM_STEP = 0.05
const MIN_ZOOM = 0.2
const MAX_ZOOM = 1.5

type ZoomMode = 'fit-page' | 'fit-width' | 'custom'

const PESO = '\u20B1'

function todayLocalIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function fmtVol(n: number): string {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} L`
}

function fmtPesoExact(n: number): string {
  return `${PESO}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function FittedText({
  text,
  maxWidth,
  maxSize,
  minSize,
  weight = 700,
  color = WHITE,
  align = 'center',
  fontFamily = "'Barlow Condensed', 'Oswald', 'Arial Narrow', Arial, sans-serif",
}: {
  text: string
  maxWidth: number
  maxSize: number
  minSize: number
  weight?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  fontFamily?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let size = maxSize
    el.style.fontSize = `${size}px`
    while (el.scrollWidth > el.clientWidth && size > minSize) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
  }, [text, maxWidth, maxSize, minSize])

  return (
    <div
      ref={ref}
      style={{
        width: maxWidth,
        maxWidth: '100%',
        fontFamily,
        fontWeight: weight,
        color,
        whiteSpace: 'nowrap',
        lineHeight: 1.02,
        letterSpacing: '-0.5px',
        textAlign: align,
        overflow: 'visible',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {text}
    </div>
  )
}

export default function MilkComponentDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [schoolYearOptions, setSchoolYearOptions] = useState<string[]>([...FALLBACK_SCHOOL_YEARS])
  const [year, setYear] = useState(String(schoolYearToDbYear(FALLBACK_SCHOOL_YEARS[0])))
  const [asOfDate, setAsOfDate] = useState<string>(todayLocalIso)
  const [lockedCenter, setLockedCenter] = useState<string>('')
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([])
  const [loadedKey, setLoadedKey] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const fetchKey = `${year}|${lockedCenter}`
  const loading = loadedKey !== fetchKey

  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-page')
  const [customScale, setCustomScale] = useState(1)
  const [displayScale, setDisplayScale] = useState(0.5)
  const [viewerTop, setViewerTop] = useState(210)
  const [isExporting, setIsExporting] = useState(false)

  const viewerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,center')
        .eq('id', user.id)
        .single()
      if (profile?.role === 'encoder' && profile.center) {
        const label = reportCenterLabel(sbfpNavCenter(profile.center) || profile.center)
        setLockedCenter(label)
      }
    })()
  }, [supabase])

  useEffect(() => {
    supabase
      .from('sbfp_school_years')
      .select('year, label, is_active')
      .then(({ data }) => {
        const labels = (data || [])
          .filter(r => r.is_active !== false)
          .sort((a, b) => (a.year || 0) - (b.year || 0))
          .map(r => r.label || dbYearToSchoolYear(r.year))
        if (labels.length > 0) setSchoolYearOptions(labels)
      })
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    const dbYear = parseInt(year, 10)
    const activeKey = `${year}|${lockedCenter}`
    void (async () => {
      try {
        const data = await fetchAllRows(() => {
          let query = supabase
            .from('sbfp_data')
            .select(SBFP_DATA_ENCODER_COLUMNS)
            .eq('year', dbYear)
          if (lockedCenter) {
            const aliases = sbfpCenterAliases(lockedCenter)
            if (aliases.length === 1) query = query.eq('center', aliases[0])
            else if (aliases.length > 1) query = query.in('center', aliases)
          }
          return query
        })
        if (!cancelled) {
          setLoadError(null)
          setRecords(data as Array<Record<string, unknown>>)
          setLoadedKey(activeKey)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setRecords([])
          setLoadError(err instanceof Error ? err.message : 'Failed to load SBFP data.')
          setLoadedKey(activeKey)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, year, lockedCenter])

  const dbYearNum = parseInt(year, 10) || schoolYearToDbYear(FALLBACK_SCHOOL_YEARS[0])

  const dashboard = useMemo(
    () =>
      computeMilkComponentDashboard(records, {
        dbYear: dbYearNum,
        asOfIso: asOfDate || todayLocalIso(),
        lockedCenter: lockedCenter || undefined,
      }),
    [records, dbYearNum, asOfDate, lockedCenter],
  )

  const recalcScale = useCallback(() => {
    if (!viewerRef.current) return
    const rect = viewerRef.current.getBoundingClientRect()
    setViewerTop(Math.round(rect.top))
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
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recalcScale)
    }
  }, [recalcScale])

  useEffect(() => {
    if (!loading) {
      const id = setTimeout(recalcScale, 80)
      return () => clearTimeout(id)
    }
  }, [loading, recalcScale])

  const zoomIn = () => {
    const n = Math.min(displayScale + ZOOM_STEP, MAX_ZOOM)
    setCustomScale(n)
    setZoomMode('custom')
  }
  const zoomOut = () => {
    const n = Math.max(displayScale - ZOOM_STEP, MIN_ZOOM)
    setCustomScale(n)
    setZoomMode('custom')
  }
  const set100 = () => {
    setCustomScale(1)
    setZoomMode('custom')
  }

  async function captureArtboardBlob(): Promise<Blob> {
    await document.fonts.ready
    const artboard = document.getElementById('sbfp-dashboard-artboard') as HTMLElement | null
    if (!artboard) throw new Error('Dashboard artboard element not found.')
    const images = Array.from(artboard.querySelectorAll<HTMLImageElement>('img'))
    await Promise.all(
      images.map(async img => {
        if (!img.complete) {
          await new Promise<void>(res => {
            img.addEventListener('load', () => res(), { once: true })
            img.addEventListener('error', () => res(), { once: true })
          })
        }
        try {
          await img.decode()
        } catch {
          /* ignore decode errors */
        }
      }),
    )
    await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
    const { toBlob } = await import('html-to-image')
    const blob = await toBlob(artboard, {
      width: ARTBOARD_WIDTH,
      height: ARTBOARD_HEIGHT,
      pixelRatio: 2,
      cacheBust: true,
      style: {
        transform: 'none',
        transformOrigin: 'top left',
      },
    })
    if (!blob) throw new Error('Image export failed.')
    return blob
  }

  const baseFilename = useCallback(() => {
    const sy = dbYearToSchoolYear(dbYearNum).replace(/\s+/g, '')
    const dateTag = asOfDate || todayLocalIso()
    return `Milk_Component_Dashboard_${sy}_${dateTag}`
  }, [dbYearNum, asOfDate])

  const handleDownloadPng = async () => {
    if (isExporting || loading) return
    setIsExporting(true)
    try {
      const blob = await captureArtboardBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseFilename()}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      console.error(err)
      alert('PNG export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (isExporting || loading) return
    setIsExporting(true)
    try {
      const blob = await captureArtboardBlob()
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST')
      pdf.save(`${baseFilename()}.pdf`)
    } catch (err) {
      console.error(err)
      alert('PDF export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handlePrint = async () => {
    if (isExporting || loading) return
    setIsExporting(true)
    try {
      const blob = await captureArtboardBlob()
      const src = URL.createObjectURL(blob)
      const pw = window.open('', '_blank')
      if (!pw) {
        URL.revokeObjectURL(src)
        alert('Please allow popups for this site.')
        return
      }
      pw.document.write(`<!doctype html>
<html>
<head>
  <title>${baseFilename()}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; overflow: hidden; background: white; }
    img { display: block; width: 100%; height: 100%; object-fit: contain; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
  <img id="print-img" />
</body>
</html>`)
      pw.document.close()
      const img = pw.document.getElementById('print-img') as HTMLImageElement | null
      if (img) {
        img.onload = () => {
          pw.focus()
          pw.print()
          setTimeout(() => {
            pw.close()
            URL.revokeObjectURL(src)
          }, 600)
        }
        img.src = src
      }
    } catch (err) {
      console.error(err)
      alert('Print preparation failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const { totals, statusCounts, regions, asOfLabel } = dashboard
  const tbBtn = (active: boolean) => ({
    background: active ? NAVY : 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 5,
    fontSize: '0.78rem',
    fontWeight: 700 as const,
    color: active ? WHITE : NAVY,
    whiteSpace: 'nowrap' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  })

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Oswald:wght@500;600;700&display=swap');
    .mcd-viewer { width: 100%; min-width: 0; display: flex; justify-content: center; align-items: flex-start; overflow: auto; padding: 16px; box-sizing: border-box; background: #e5e7eb; border-radius: 8px; }
    .mcd-viewer.fp { overflow: hidden; align-items: center; }
    .mcd-scaled-slot { position: relative; flex: 0 0 auto; }
    .mcd-artboard {
      position: absolute; left: 0; top: 0; overflow: hidden; box-sizing: border-box;
      width: ${ARTBOARD_WIDTH}px; height: ${ARTBOARD_HEIGHT}px;
      background: linear-gradient(180deg, #EBF5FF 0%, #EBF5FF 60%, #DCEEFB 100%);
      font-family: 'Barlow Condensed', 'Oswald', 'Arial Narrow', Arial, sans-serif;
      transform-origin: top left;
      box-shadow: 0 10px 30px rgba(3, 55, 115, 0.16);
    }
    .mcd-artboard * { box-sizing: border-box; }
    .mcd-ztbtn:hover { background: #e2e8f0 !important; }
    .mcd-table { width: 100%; border-collapse: collapse; font-family: 'Barlow Condensed', 'Oswald', Arial, sans-serif; font-variant-numeric: tabular-nums; }
    .mcd-table th {
      background: #0B3A70; color: #FFFFFF; font-weight: 700; font-size: 15.5px; line-height: 1.08;
      padding: 8px 6px; text-align: center; border-bottom: 2px solid #062850;
      text-transform: uppercase; letter-spacing: 0.2px;
    }
    .mcd-table td {
      font-size: 20px; font-weight: 600; color: #0B1F3A; padding: 5.5px 8px;
      text-align: right; border-bottom: 1px solid rgba(3, 55, 115, 0.08); line-height: 1.12;
    }
    .mcd-table td.mcd-reg { text-align: center; font-weight: 700; letter-spacing: 0.3px; }
    .mcd-table tr.mcd-even { background: rgba(246, 251, 255, 0.85); }
    .mcd-table tr.mcd-odd { background: rgba(217, 236, 250, 0.72); }
    .mcd-table tfoot td {
      background: #08376D; color: #FFFFFF; font-weight: 700; font-size: 20.5px;
      padding: 8px 8px; border-top: 2px solid #042246; border-bottom: none;
    }
    .mcd-table tfoot td.mcd-reg { text-align: center; letter-spacing: 0.5px; }
  `

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <style>{CSS}</style>

      {/* Filter & Export Bar */}
      <div
        className="no-print"
        style={{
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          background: WHITE,
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '0.65rem 0.9rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: NAVY }}>School Year:</span>
          <select
            aria-label="School Year"
            value={year}
            onChange={e => setYear(e.target.value)}
            style={{
              padding: '0.42rem 0.7rem',
              borderRadius: 7,
              border: '1.5px solid #cbd5e1',
              fontSize: '0.83rem',
              fontWeight: 700,
              color: NAVY,
              cursor: 'pointer',
              background: WHITE,
            }}
          >
            {schoolYearOptions.map(sy => {
              const dbY = String(schoolYearToDbYear(sy))
              return (
                <option key={dbY} value={dbY}>
                  SY {sy}
                </option>
              )
            })}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={15} color={NAVY} />
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: NAVY }}>As of Date:</span>
          <input
            type="date"
            aria-label="As of Date"
            value={asOfDate}
            onChange={e => setAsOfDate(e.target.value)}
            style={{
              padding: '0.38rem 0.65rem',
              borderRadius: 7,
              border: '1.5px solid #cbd5e1',
              fontSize: '0.83rem',
              fontWeight: 700,
              color: NAVY,
              background: WHITE,
            }}
          />
          <button
            type="button"
            onClick={() => setAsOfDate(todayLocalIso())}
            title="Reset to today's date"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '0.4rem 0.65rem',
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: NAVY,
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={13} /> Today
          </button>
        </div>

        {lockedCenter && (
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#0369a1',
              background: '#e0f2fe',
              padding: '0.3rem 0.65rem',
              borderRadius: 999,
            }}
          >
            Center: {lockedCenter}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isExporting || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.46rem 1rem',
              borderRadius: 8,
              border: '1.5px solid #cbd5e1',
              background: WHITE,
              color: NAVY,
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: isExporting || loading ? 'wait' : 'pointer',
              opacity: isExporting || loading ? 0.6 : 1,
            }}
          >
            <ImageIcon size={14} /> {isExporting ? 'Exporting…' : 'Download PNG'}
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExporting || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.46rem 1rem',
              borderRadius: 8,
              border: 'none',
              background: NAVY,
              color: WHITE,
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: isExporting || loading ? 'wait' : 'pointer',
              opacity: isExporting || loading ? 0.6 : 1,
            }}
          >
            <Download size={14} /> Download PDF
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isExporting || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.46rem 1rem',
              borderRadius: 8,
              border: `1.5px solid ${NAVY}`,
              background: WHITE,
              color: NAVY,
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: isExporting || loading ? 'wait' : 'pointer',
              opacity: isExporting || loading ? 0.6 : 1,
            }}
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Zoom Toolbar */}
      <div
        className="no-print"
        style={{
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: WHITE,
          border: '1.5px solid #e2e8f0',
          borderRadius: 8,
          padding: '4px 8px',
          width: 'fit-content',
          fontSize: '0.78rem',
          color: NAVY,
        }}
      >
        <button className="mcd-ztbtn" type="button" aria-label="Zoom out" onClick={zoomOut} style={tbBtn(false)}>
          <ZoomOut size={13} />
        </button>
        <span style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, padding: '0 4px' }}>
          {Math.round(displayScale * 100)}%
        </span>
        <button className="mcd-ztbtn" type="button" aria-label="Zoom in" onClick={zoomIn} style={tbBtn(false)}>
          <ZoomIn size={13} />
        </button>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 2px' }} />
        <button className="mcd-ztbtn" type="button" onClick={() => setZoomMode('fit-page')} style={tbBtn(zoomMode === 'fit-page')}>
          <Maximize2 size={12} /> Fit Page
        </button>
        <button className="mcd-ztbtn" type="button" onClick={() => setZoomMode('fit-width')} style={tbBtn(zoomMode === 'fit-width')}>
          <AlignCenter size={12} /> Fit Width
        </button>
        <button className="mcd-ztbtn" type="button" onClick={set100} style={tbBtn(zoomMode === 'custom' && customScale === 1)}>
          100%
        </button>
      </div>

      {loadError && (
        <div style={{ padding: '0.85rem 1rem', marginBottom: '0.75rem', borderRadius: 8, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '0.85rem', fontWeight: 600 }}>
          {loadError}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '5rem', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Spinner size={36} label="Loading Milk Component Dashboard" />
          <p style={{ fontWeight: 600 }}>Loading Milk Component Dashboard…</p>
        </div>
      ) : (
        <div
          ref={viewerRef}
          className={`mcd-viewer no-print${zoomMode === 'fit-page' ? ' fp' : ''}`}
          style={{
            height: zoomMode === 'fit-page' ? `calc(100vh - ${viewerTop}px - 16px)` : 'auto',
            minHeight: '340px',
          }}
        >
          <div
            className="mcd-scaled-slot"
            style={{
              width: `${ARTBOARD_WIDTH * displayScale}px`,
              height: `${ARTBOARD_HEIGHT * displayScale}px`,
            }}
          >
            <section
              id="sbfp-dashboard-artboard"
              className="mcd-artboard"
              style={{ transform: `scale(${displayScale})` }}
            >
              {/* 1. Header Banner (1414 x 338) */}
              <div style={{ position: 'relative', width: ARTBOARD_WIDTH, height: 338, overflow: 'hidden' }}>
                <img
                  src="/assets/sbfp-dashboard/header-banner.png"
                  alt="School-Based Feeding Program - Milk Feeding Component"
                  style={{ display: 'block', width: ARTBOARD_WIDTH, height: 338, objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: 42,
                    bottom: 8,
                    fontSize: 33,
                    fontWeight: 700,
                    color: WHITE,
                    letterSpacing: '0.6px',
                    lineHeight: 1,
                    textShadow: '0 2px 6px rgba(0, 18, 42, 0.75)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {asOfLabel}
                </div>
              </div>

              {/* 2. Top 3 KPI Cards */}
              <div
                style={{
                  padding: '12px 48px 0',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 18,
                }}
              >
                {/* Card 1: Actual Volume Delivered */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '100%', height: 170 }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 124,
                        background: NAVY,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        padding: '0 18px 0 152px',
                      }}
                    >
                      <FittedText
                        text={formatCompactLiters(totals.deliveredL, 2)}
                        maxWidth={254}
                        maxSize={84}
                        minSize={42}
                        weight={700}
                        color={GOLD}
                        align="center"
                      />
                    </div>
                    <img
                      src="/assets/sbfp-dashboard/kpi-boy.png"
                      alt="Boy drinking milk"
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: 0,
                        width: 146,
                        height: 165,
                        objectFit: 'contain',
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 29,
                      fontWeight: 700,
                      color: NAVY,
                      letterSpacing: '0.2px',
                      textAlign: 'center',
                      lineHeight: 1.05,
                    }}
                  >
                    ACTUAL VOLUME DELIVERED (LITERS)
                  </div>
                </div>

                {/* Card 2: Total Value of Milk Contracts */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '100%', height: 170 }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 124,
                        background: NAVY,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        padding: '0 150px 0 16px',
                      }}
                    >
                      <FittedText
                        text={formatCompactPeso(totals.contractAmt)}
                        maxWidth={258}
                        maxSize={84}
                        minSize={42}
                        weight={700}
                        color={GOLD}
                        align="center"
                      />
                    </div>
                    <img
                      src="/assets/sbfp-dashboard/kpi-farmer.png"
                      alt="Dairy farmer with milk can"
                      style={{
                        position: 'absolute',
                        right: 0,
                        bottom: 0,
                        width: 148,
                        height: 155,
                        objectFit: 'contain',
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 29,
                      fontWeight: 700,
                      color: NAVY,
                      letterSpacing: '0.2px',
                      textAlign: 'center',
                      lineHeight: 1.05,
                    }}
                  >
                    TOTAL VALUE OF MILK CONTRACTS
                  </div>
                </div>

                {/* Card 3: Total Contracted Volume */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '100%', height: 170 }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 124,
                        background: NAVY,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        padding: '0 142px 0 16px',
                      }}
                    >
                      <FittedText
                        text={formatCompactLiters(totals.contractedL, 2)}
                        maxWidth={266}
                        maxSize={84}
                        minSize={42}
                        weight={700}
                        color={GOLD}
                        align="center"
                      />
                    </div>
                    <img
                      src="/assets/sbfp-dashboard/kpi-bottle.png"
                      alt="Milk bottle and glass"
                      style={{
                        position: 'absolute',
                        right: 0,
                        bottom: 0,
                        width: 139,
                        height: 165,
                        objectFit: 'contain',
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 29,
                      fontWeight: 700,
                      color: NAVY,
                      letterSpacing: '0.2px',
                      textAlign: 'center',
                      lineHeight: 1.05,
                    }}
                  >
                    TOTAL CONTRACTED VOLUME (LITERS)
                  </div>
                </div>
              </div>

              {/* 3. Status of Implementation */}
              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    background: STRIP_BG,
                    height: 46,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 38,
                    fontWeight: 700,
                    color: NAVY,
                    letterSpacing: '0.4px',
                  }}
                >
                  STATUS OF IMPLEMENTATION
                </div>
                <div
                  style={{
                    margin: '10px 48px 0',
                    background: NAVY,
                    height: 168,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1.32fr',
                    alignItems: 'center',
                    padding: '12px 0',
                  }}
                >
                  {[
                    { value: statusCounts.completed, label: 'COMPLETED' },
                    { value: statusCounts.ongoingDelivery, label: 'ONGOING\nDELIVERY' },
                    { value: statusCounts.forDelivery, label: 'FOR DELIVERY' },
                    { value: statusCounts.ongoingProcurement, label: 'ONGOING\nPROCUREMENT' },
                    { value: statusCounts.forPreparation, label: 'FOR\nPREPARATION' },
                  ].map((item, idx) => (
                    <div
                      key={item.label}
                      style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderLeft: idx === 0 ? 'none' : '1.5px solid rgba(255,255,255,0.45)',
                        padding: '0 8px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 78,
                          fontWeight: 700,
                          color: WHITE,
                          lineHeight: 0.95,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtInt(item.value)}
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 20,
                          fontWeight: 500,
                          color: WHITE,
                          lineHeight: 1.05,
                          whiteSpace: 'pre-line',
                          letterSpacing: '0.3px',
                        }}
                      >
                        {item.label}
                      </div>
                    </div>
                  ))}
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderLeft: '1.5px solid rgba(255,255,255,0.45)',
                      padding: '0 10px',
                      textAlign: 'center',
                      color: WHITE,
                    }}
                  >
                    <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.15, letterSpacing: '0.2px' }}>
                      <div>BATCH 1 - AUG TO SEPT</div>
                      <div>BATCH 2 - SEPT TO NOV</div>
                      <div>BATCH 3 - NOV TO FEB</div>
                      <div>BATCH 4 - FEB TO MARCH</div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 21, fontWeight: 500, letterSpacing: '0.4px' }}>
                      BATCHES
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Assured Commitment Row */}
              <div
                style={{
                  margin: '16px 48px 0',
                  display: 'grid',
                  gridTemplateColumns: '442px 1fr',
                  gap: 12,
                  height: 112,
                }}
              >
                <div
                  style={{
                    background: STRIP_BG,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 16px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 40, fontWeight: 700, color: NAVY, lineHeight: 1 }}>
                    ASSURED COMMITMENT
                  </div>
                  <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700, color: NAVY, lineHeight: 1.05 }}>
                    UNDELIVERED VOLUME AND CONTRACT VALUE
                  </div>
                </div>

                <div
                  style={{
                    background: NAVY,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    alignItems: 'center',
                    padding: '8px 0',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 14px',
                    }}
                  >
                    <FittedText
                      text={fmtVol(totals.undeliveredL)}
                      maxWidth={400}
                      maxSize={56}
                      minSize={30}
                      weight={700}
                      color={GOLD}
                    />
                    <div style={{ marginTop: 4, fontSize: 22, fontWeight: 500, color: WHITE, letterSpacing: '0.3px' }}>
                      REMAINING VOLUME
                    </div>
                  </div>
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderLeft: '1.5px solid rgba(255,255,255,0.45)',
                      padding: '0 14px',
                    }}
                  >
                    <FittedText
                      text={`${PESO}${fmtInt(totals.remainingContract)}`}
                      maxWidth={400}
                      maxSize={56}
                      minSize={30}
                      weight={700}
                      color={GOLD}
                    />
                    <div style={{ marginTop: 4, fontSize: 22, fontWeight: 500, color: WHITE, letterSpacing: '0.3px' }}>
                      CONTRACT VALUE
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. Delivery Rate & Actual Amount Paid/Disbursed */}
              <div
                style={{
                  margin: '16px 48px 0',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '100%',
                      background: STRIP_BG,
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 29,
                      fontWeight: 600,
                      color: NAVY,
                    }}
                  >
                    DELIVERY/ACCOMPLISHMENT RATE
                  </div>
                  <div
                    style={{
                      height: 98,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FittedText
                      text={fmtPct(totals.pctDelivered)}
                      maxWidth={600}
                      maxSize={76}
                      minSize={42}
                      weight={700}
                      color="#041E42"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '100%',
                      background: STRIP_BG,
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 29,
                      fontWeight: 600,
                      color: NAVY,
                    }}
                  >
                    ACTUAL AMOUNT PAID/DISBURSED
                  </div>
                  <div
                    style={{
                      height: 98,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FittedText
                      text={fmtPesoExact(totals.paidAmt)}
                      maxWidth={620}
                      maxSize={72}
                      minSize={38}
                      weight={700}
                      color="#041E42"
                    />
                  </div>
                </div>
              </div>

              {/* 6. Regional Distribution Table */}
              <div style={{ marginTop: 4 }}>
                <div
                  style={{
                    background: STRIP_BG,
                    height: 46,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 38,
                    fontWeight: 700,
                    color: NAVY,
                    letterSpacing: '0.4px',
                  }}
                >
                  REGIONAL DISTRIBUTION
                </div>

                <div style={{ margin: '10px 48px 0' }}>
                  <table className="mcd-table">
                    <thead>
                      <tr>
                        <th style={{ width: '7.5%' }}>REGION</th>
                        <th style={{ width: '5%' }}>SDOs</th>
                        <th style={{ width: '8.5%' }}>BENEFICIARIES</th>
                        <th style={{ width: '9.5%' }}>DELIVERED<br />PACKS</th>
                        <th style={{ width: '11.5%' }}>CONTRACTED<br />VALUE (PHP)</th>
                        <th style={{ width: '11%' }}>CONTRACTED<br />VOLUME</th>
                        <th style={{ width: '10%' }}>AMOUNT PAID<br />(PHP)</th>
                        <th style={{ width: '10.5%' }}>DELIVERED<br />VOLUME</th>
                        <th style={{ width: '11%' }}>VALUE DELIVERED<br />(PHP)</th>
                        <th style={{ width: '7.5%' }}>DELIVERY<br />%</th>
                        <th style={{ width: '8%' }}>DISBURSEMENT<br />%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regions.length === 0 ? (
                        <tr>
                          <td colSpan={11} style={{ textAlign: 'center', padding: '24px', color: '#475569' }}>
                            No SBFP records found for this school year.
                          </td>
                        </tr>
                      ) : (
                        regions.map((reg, idx) => (
                          <tr key={reg.region} className={idx % 2 === 0 ? 'mcd-even' : 'mcd-odd'}>
                            <td className="mcd-reg">{reg.region}</td>
                            <td>{fmtInt(reg.sdoCount)}</td>
                            <td>{fmtInt(reg.beneficiaries)}</td>
                            <td>{fmtInt(reg.deliveredPacks)}</td>
                            <td>{fmtInt(reg.contractAmt)}</td>
                            <td>{fmtVol(reg.contractedL)}</td>
                            <td>{fmtInt(reg.paidAmt)}</td>
                            <td>{fmtVol(reg.deliveredL)}</td>
                            <td>{fmtInt(reg.valueDelivered)}</td>
                            <td>{fmtPct(reg.pctDelivered)}</td>
                            <td>{fmtPct(reg.pctDisbursed)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="mcd-reg">TOTAL</td>
                        <td>{fmtInt(totals.sdoCount)}</td>
                        <td>{fmtInt(totals.beneficiaries)}</td>
                        <td>{fmtInt(totals.deliveredPacks)}</td>
                        <td>{fmtInt(totals.contractAmt)}</td>
                        <td>{fmtVol(totals.contractedL)}</td>
                        <td>{fmtInt(totals.paidAmt)}</td>
                        <td>{fmtVol(totals.deliveredL)}</td>
                        <td>{fmtInt(totals.valueDelivered)}</td>
                        <td>{fmtPct(totals.pctDelivered)}</td>
                        <td>{fmtPct(totals.pctDisbursed)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
