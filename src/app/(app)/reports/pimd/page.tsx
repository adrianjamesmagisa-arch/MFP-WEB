'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PCC_CENTERS } from '@/lib/types'
import { Download, Filter } from 'lucide-react'

// ── Brand colours & Values ──────────────────────────────────────────
const NAVY  = '#002C65'
const HDR_NAVY = '#12476A'
const HDR_LOGO = '#13547E'
const OUTLINE = '#00537B'
const CHART_BG = '#F3FBFE'
const WHITE = '#FFFFFF'
const BGD_GRAD = 'linear-gradient(to bottom, #d6eaf8 0%, #ffffff 40%, #ffffff 70%, #d5e5ec 100%)'

const YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026']
const MONTHS = [
  ['1','January'],['2','February'],['3','March'],['4','April'],
  ['5','May'],['6','June'],['7','July'],['8','August'],
  ['9','September'],['10','October'],['11','November'],['12','December'],
]

const formatCount = (value: unknown): string => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Math.round(number).toLocaleString("en-US");
};
function c(v: number) { return '₱' + v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) }

const MILK_LABEL: Record<string,string> = {
  PM:'Pasteurized Milk', SM:'Sterilized Milk', SMP:'Skim Milk Powder', Karabao:'Karabao Milk',
}

interface Stats {
  grossIncome:number; grossRevenue:number; dswdCenters:number
  totalBene:number; beneByFunder:Record<string,number>
  totalPacks:number; packsByFunder:Record<string,number>
  volumeByType:Record<string,number>; packsBySize:Record<string,number>
  coopCount:number; districtCount:number; divisionCount:number
  provinceCount:number; schoolCount:number
}

const BASE_WIDTH = 1414
const BASE_HEIGHT = 2000

// ── Text Fitting Helper ────────────────────────────────────────────
function FittedText({ text, maxWidth, maxSize = 62, minSize = 44, weight = 900, color = WHITE }: { text: string, maxWidth: number, maxSize?: number, minSize?: number, weight?: number, color?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    let size = maxSize;
    el.style.fontSize = `${size}px`;
    while (el.scrollWidth > el.clientWidth && size > minSize) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }, [text, maxWidth, maxSize, minSize])

  return (
    <div ref={ref} style={{ width: maxWidth, fontWeight: weight, color: color, whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '-1px', textAlign: 'center', overflow: 'hidden', margin: '0 auto' }}>
      {text}
    </div>
  )
}

// ── SVG Vertical Bar Chart (Milk Utilized) ─────────────────────────
function BarChart({ data }: { data: Record<string,number> }) {
  const entries = Object.entries(data).filter(([,v]) => v >= 0)
  if (!entries.length) entries.push(['Pasteurized Milk',0],['Sterilized Milk',0],['Commercial Milk',0])

  const maxVal = Math.max(...entries.map(([,v]) => v), 1)
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal||1)))
  const yMax = Math.ceil((maxVal||1) / mag) * mag
  const steps = 4

  const vW=622, vH=342, PL=70, PB=40, PT=60, PR=20
  const cW=vW-PL-PR, cH=vH-PT-PB
  const bGap=cW/entries.length
  const bW=bGap*0.6
  const formatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width="100%" height="100%" style={{position:'absolute',top:0,left:0}}>
      <text x={vW/2} y={35} textAnchor="middle" fontSize={24} fontWeight="900" fill={HDR_NAVY} letterSpacing={-0.5}>MILK UTILIZED</text>
      
      {Array.from({length:steps+1},(_,i)=>{
        const val=(yMax/steps)*i
        const y=PT+cH-(val/yMax)*cH
        const lbl=formatter.format(val)
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={vW-PR} y2={y} stroke="#d1d5db" strokeWidth={1}/>
            <text x={PL-10} y={y+5} textAnchor="end" fontSize={12} fill="#4b5563">{lbl}</text>
          </g>
        )
      })}
      
      {entries.map(([type,val],i)=>{
        const bH=Math.max((val/yMax)*cH, 2)
        const x=PL+i*bGap+(bGap-bW)/2
        const y=PT+cH-bH
        const label = MILK_LABEL[type]??type
        return (
          <g key={type}>
            <rect x={x} y={y} width={bW} height={bH} fill={NAVY}/>
            <text x={x+bW/2} y={y-8} textAnchor="middle" fontSize={11} fontWeight="bold" fill={NAVY}>{formatCount(val)}</text>
            <text x={x+bW/2} y={PT+cH+20} textAnchor="middle" fontSize={12} fill="#374151" fontWeight="600">{label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── SVG Horizontal Bar Chart (Packaging & Size) ────────────────────
function HBar({ data }: { data: Record<string,number> }) {
  const categories = ['180 ML CAN/POUCH', '200 POUCH', '500 ML', '1 LITER BOTTLE'];
  const entries = categories.map(cat => [cat, data[cat] || 0] as const);

  const maxVal=Math.max(...entries.map(([,v])=>v),1)
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal||1)))
  const yMax = Math.ceil((maxVal||1)/mag)*mag

  const vW=644, vH=355, rowH=50, labelW=160, numW=60, PR=30, PT=60
  const barAreaW=vW-labelW-numW-PR
  const formatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width="100%" height="100%" style={{position:'absolute',top:0,left:0}}>
      <text x={vW/2} y={35} textAnchor="middle" fontSize={24} fontWeight="900" fill={WHITE} letterSpacing={-0.5}>PACKAGING AND SIZE</text>
      
      {entries.map(([type,val],i)=>{
        const bW=(val/yMax)*barAreaW
        const y=PT+i*rowH+5
        const label=(MILK_LABEL[type]??type).toUpperCase()
        return (
          <g key={type}>
            <text x={labelW-15} y={y+20} textAnchor="end" fontSize={13} fill={WHITE} fontWeight="600">{label}</text>
            <rect x={labelW} y={y} width={Math.max(bW,2)} height={30} fill={WHITE}/>
            <text x={labelW+Math.max(bW,2)+10} y={y+20} fontSize={13} fill={WHITE} fontWeight="600">{formatCount(val)}</text>
          </g>
        )
      })}
      
      <line x1={labelW} y1={PT+entries.length*rowH+10} x2={vW-PR} y2={PT+entries.length*rowH+10} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5}/>
      {Array.from({length:7},(_,i)=>{
        const v = (yMax/6)*i
        const x = labelW + (v/yMax)*barAreaW
        const vStr = formatter.format(v)
        return (
          <g key={i}>
            <line x1={x} y1={PT+entries.length*rowH+10} x2={x} y2={PT+entries.length*rowH+15} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}/>
            <text x={x+15} y={PT+entries.length*rowH+25} fontSize={11} fill="rgba(255,255,255,0.9)" transform={`rotate(-45 ${x+15} ${PT+entries.length*rowH+25})`} textAnchor="end" fontWeight="500">{vStr}</text>
          </g>
        )
      })}
    </svg>
  )
}

const ALL_CENTERS_VALUE = '__ALL_CENTERS__'

// ── Main Page ──────────────────────────────────────────────────────
export default function PIMDReportPage() {
  const supabase = createClient()
  const [center, setCenter] = useState(ALL_CENTERS_VALUE)
  const [year,   setYear]   = useState('')
  const [month,  setMonth]  = useState('')
  const [stats,  setStats]  = useState<Stats|null>(null)
  const [loading,setLoading]= useState(true)
  const [isEncoder, setIsEncoder] = useState(false)
  const [scale, setScale] = useState(1)
  const [showReference, setShowReference] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('compare') === '1') setShowReference(true)

    const ro = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setScale(Math.min(1, Math.max(0.1, entry.contentRect.width / BASE_WIDTH)))
      }
    })
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      if (!user) return
      supabase.from('profiles').select('role,center').eq('id',user.id).single().then(({data})=>{
        if (!data) return
        if (data.role==='encoder') { 
          setIsEncoder(true)
          const c = data.center === 'NHQGP (NIZ)' ? 'NIZ' : (data.center || ALL_CENTERS_VALUE)
          setCenter(c)
        }
      })
    })
  },[])

  useEffect(()=>{ fetchData() },[center,year,month])

  async function fetchData() {
    setLoading(true)
    setStats(null)
    let q = supabase
      .from('mfp_data')
      .select('beneficiaries,milk_packs,milk_cost,total_funds_transferred,funded_by,center,province,division,municipality,elementary_school,milk_type,total_volume_requirements,supplier_id,date_started')
      .range(0,49999)
    if (center && center !== ALL_CENTERS_VALUE) q = q.eq('center', center)
    if (year)   q = q.eq('year', parseInt(year))
    let {data:rows} = await q
    rows = rows ?? []
    if (month && rows.length) {
      const m = parseInt(month)
      rows = rows.filter(r=>r.date_started && (new Date(r.date_started).getMonth()+1)===m)
    }
    const grossIncome  = rows.reduce((s,r)=>s+(r.milk_cost||0),0)
    const grossRevenue = rows.reduce((s,r)=>s+(r.total_funds_transferred||0),0)
    const totalBene    = rows.reduce((s,r)=>s+(r.beneficiaries||0),0)
    const totalPacks   = rows.reduce((s,r)=>s+(r.milk_packs||0),0)
    const beneByFunder:Record<string,number>  = {}
    const packsByFunder:Record<string,number> = {}
    const volumeByType:Record<string,number>  = {}
    const packsBySize:Record<string,number>   = {}
    
    rows.forEach(r=>{
      const f=r.funded_by||'OTHERS'
      beneByFunder[f]  = (beneByFunder[f]||0)  + (r.beneficiaries||0)
      packsByFunder[f] = (packsByFunder[f]||0) + (r.milk_packs||0)
      
      const t=r.milk_type||'Unknown'
      volumeByType[t]  = (volumeByType[t]||0)  + (r.total_volume_requirements||0)
      
      let size = 'OTHER'
      if (r.milk_packs > 0 && r.total_volume_requirements > 0) {
        const mlPerPack = (r.total_volume_requirements / r.milk_packs) * 1000
        if (Math.abs(mlPerPack - 180) < 10) size = '180 ML CAN/POUCH'
        else if (Math.abs(mlPerPack - 200) < 10) size = '200 POUCH'
        else if (Math.abs(mlPerPack - 500) < 10) size = '500 ML'
        else if (Math.abs(mlPerPack - 1000) < 10) size = '1 LITER BOTTLE'
        else size = `${Math.round(mlPerPack)} ML`
      } else {
        // Fallback mapping if quantities are zero or missing
        if (t === 'PM') size = '180 ML CAN/POUCH'
        else if (t === 'Karabao') size = '200 POUCH'
        else if (t === 'SM') size = '500 ML'
        else if (t === 'SMP') size = '1 LITER BOTTLE'
      }
      packsBySize[size] = (packsBySize[size]||0) + (r.milk_packs||0)
    })
    
    setStats({
      grossIncome, grossRevenue,
      dswdCenters: new Set(rows.filter(r=>r.funded_by==='DSWD').map(r=>r.center)).size,
      totalBene, beneByFunder, totalPacks, packsByFunder,
      volumeByType, packsBySize,
      coopCount:    new Set(rows.map(r=>r.supplier_id).filter(Boolean)).size,
      districtCount:new Set(rows.map(r=>r.municipality).filter(Boolean)).size,
      divisionCount:new Set(rows.map(r=>r.division).filter(Boolean)).size,
      provinceCount:new Set(rows.map(r=>r.province).filter(Boolean)).size,
      schoolCount:  new Set(rows.map(r=>r.elementary_school).filter(Boolean)).size,
    })
    setLoading(false)
  }

  const eff = center === ALL_CENTERS_VALUE ? 'ALL CENTERS' : (center === 'NIZ' ? 'NHQGP (NIZ)' : (center || 'ALL CENTERS').toUpperCase())

  return (
    <div style={{display:'flex', flexDirection:'column', width:'100%', height:'100%'}}>
      <style>{`
        @media print {
          aside, .no-print, nav, header { display:none !important; }
          main { padding:0 !important; overflow:visible !important; background:white !important; }
          body { background:white !important; margin:0 !important; }
          #pimd-wrapper { padding: 0 !important; margin: 0 auto !important; display: block !important; }
          .pimd-scaled-slot { width: 1414px !important; height: 2000px !important; }
          #pimd-factsheet { 
            transform: scale(1) !important;
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
          }
          /* Hide the reference overlay in print if it was enabled */
          .pimd-reference-overlay { display: none !important; }
        }
        @page { size: 1414px 2000px; margin: 0; }
        
        .box-title { color:white; font-size:25px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
        .box-val { color:white; font-size:68px; font-weight:900; letter-spacing:-1px; line-height:1; }
        
        .abs-card { position: absolute; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        
        .pimd-artboard {
          position: relative;
          width: 1414px;
          height: 2000px;
          min-width: 1414px;
          min-height: 2000px;
          overflow: hidden;
          box-sizing: border-box;
          background: ${BGD_GRAD};
          font-family: 'Inter', Arial, sans-serif;
        }

        .pimd-artboard * { box-sizing: border-box; }

        .pimd-transparent-asset {
          display: block;
          max-width: 100%;
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: transparent !important;
          border: 0;
          box-shadow: none;
        }

        .pimd-asset-wrapper {
          position: absolute;
          background: transparent !important;
          border: 0;
          box-shadow: none;
          overflow: visible;
        }

        .pimd-reference-overlay {
          position: absolute;
          left: 0;
          top: 0;
          width: 1414px;
          height: 2000px;
          object-fit: fill;
          pointer-events: none;
          opacity: 0.5;
          z-index: 9999;
        }

        /* Top-level sections strictly fixed coordinates */
        .pimd-header-main { position: absolute; left: 0; top: 86px; width: 1089px; height: 270px; background: ${HDR_NAVY}; padding: 0; display: block; }
        .pimd-header-logos { position: absolute; left: 1090px; top: 114px; width: 324px; height: 213px; background: ${HDR_LOGO}; }
        .pimd-gross-income { position: absolute; left: 67px; top: 424px; width: 928px; height: 151px; background: ${NAVY}; padding: 0 40px; }
        .pimd-accomplishment { position: absolute; left: 1022px; top: 424px; width: 325px; height: 151px; background: ${NAVY}; }
        .pimd-gross-revenue { position: absolute; left: 71px; top: 594px; width: 927px; height: 150px; background: ${NAVY}; padding: 0 40px; }
        .pimd-dswd-centers { position: absolute; left: 1023px; top: 594px; width: 321px; height: 148px; background: ${NAVY}; border-radius: 20px; overflow: hidden; }
        .pimd-beneficiary-frame { position: absolute; left: 67px; top: 779px; width: 1280px; height: 293px; background: transparent; border: 7px solid rgb(0, 83, 123); border-radius: 64px; }
        .pimd-beneficiary-total-card { position: absolute; left: 102px; top: 813px; width: 596px; height: 136px; background: ${NAVY}; border-radius: 18px; padding: 0; }
        .pimd-milk-packs-card { position: absolute; left: 716px; top: 813px; width: 597px; height: 136px; background: ${NAVY}; border-radius: 18px; padding: 0; }
        .pimd-milk-utilized-panel { position: absolute; left: 63px; top: 1129px; width: 622px; height: 342px; background: ${CHART_BG}; border-radius: 40px; box-shadow: 0 7px 28px rgba(0,0,0,0.05); }
        .pimd-packaging-panel { position: absolute; left: 714px; top: 1122px; width: 644px; height: 355px; background: ${NAVY}; border-radius: 40px; }
        .pimd-bottom-left-blue-block { position: absolute; left: 0; top: 1524px; width: 435px; height: 135px; background: ${NAVY}; border-radius: 0; z-index: 2; }
        .pimd-cooperative-suppliers { position: absolute; left: 451px; top: 1524px; width: 256px; height: 135px; background: ${NAVY}; border-radius: 0; padding: 0 20px; z-index: 4; }
        .pimd-districts { position: absolute; left: 719px; top: 1523px; width: 639px; height: 73px; background: ${NAVY}; border-radius: 0; flex-direction: row; justify-content: space-between; padding: 0 40px; z-index: 4; }
        .pimd-sdo-card-background { position: absolute; left: 719px; top: 1606px; width: 343px; height: 312px; background: ${NAVY}; z-index: 20; }
        .pimd-sdo-card-content { position: absolute; left: 719px; top: 1606px; width: 343px; height: 312px; padding: 0 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; z-index: 40; pointer-events: none; }
        .pimd-provinces { position: absolute; left: 1073px; top: 1605px; width: 285px; height: 150px; background: ${NAVY}; border-radius: 0; padding: 0 20px; z-index: 4; }
        .pimd-schools { position: absolute; left: 1073px; top: 1765px; width: 285px; height: 151px; background: ${NAVY}; border-radius: 0; padding: 0 20px; z-index: 4; }
      `}</style>

      {/* ── Filter bar ────────────────────────── */}
      <div className="no-print" style={{marginBottom:'1.5rem',display:'flex',alignItems:'center',gap:'0.75rem',flexWrap:'wrap'}}>
        <span style={{fontWeight:700,color:NAVY,display:'flex',alignItems:'center',gap:'0.4rem'}}>
          <Filter size={15}/> Filters:
        </span>
        {!isEncoder && (
          <select value={center} onChange={e=>setCenter(e.target.value)}
            style={{padding:'0.45rem 0.75rem',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:'0.83rem',fontWeight:600,color:NAVY,cursor:'pointer'}}>
            <option value={ALL_CENTERS_VALUE}>All Centers</option>
            {PCC_CENTERS.map(c => {
              const val = c === 'NHQGP (NIZ)' ? 'NIZ' : c;
              return <option key={val} value={val}>{c}</option>
            })}
          </select>
        )}
        <select value={year} onChange={e=>setYear(e.target.value)}
          style={{padding:'0.45rem 0.75rem',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:'0.83rem',fontWeight:600,color:NAVY,cursor:'pointer'}}>
          <option value="">All Years</option>
          {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e=>setMonth(e.target.value)}
          style={{padding:'0.45rem 0.75rem',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:'0.83rem',fontWeight:600,color:NAVY,cursor:'pointer'}}>
          <option value="">All Months</option>
          {MONTHS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={async ()=>{
          const images = Array.from(document.querySelectorAll("#pimd-factsheet img")) as HTMLImageElement[];
          await Promise.all(
            images.map(async (image) => {
              if (!image.complete) {
                await new Promise<void>((resolve, reject) => {
                  image.addEventListener("load", () => resolve(), { once: true });
                  image.addEventListener("error", () => reject(), { once: true });
                });
              }
              if ("decode" in image) {
                try {
                  await image.decode();
                } catch {
                  // Image may already be decoded.
                }
              }
            })
          );
          await document.fonts.ready;
          window.print();
        }}
          style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 1.25rem',borderRadius:8,border:'none',background:NAVY,color:WHITE,fontWeight:700,fontSize:'0.83rem',cursor:'pointer',boxShadow:'0 2px 8px rgba(15,37,87,0.25)'}}>
          <Download size={14}/> Download PDF
        </button>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'5rem',color:'#64748b'}}>⏳ Loading data…</div>
      ) : stats ? (
        
        <div id="pimd-wrapper" ref={wrapperRef} className="pimd-stage" style={{width:'100%', display:'flex', justifyContent:'center'}}>
          {/* ══════════════════════════════════════════
              FIXED INFOGRAPHIC ARTBOARD (1414 x 2000)
          ══════════════════════════════════════════ */}
          <div className="pimd-scaled-slot" style={{ width: `${BASE_WIDTH * scale}px`, height: `${BASE_HEIGHT * scale}px` }}>
            <section id="pimd-factsheet" className="pimd-artboard" style={{
              transform: `scale(${scale})`, transformOrigin: "top left",
            }}>

              {showReference && (
                <img
                  className="pimd-reference-overlay"
                  src="/__pimd_reference__/inforgraphic-template.png"
                  alt=""
                />
              )}

              {/* ── HEADER ─────────────────────────────── */}
              <div className="pimd-header-main">
                <h1 style={{ position: 'absolute', margin: 0, padding: 0, fontSize: '64px', fontWeight: 900, lineHeight: 0.82, letterSpacing: '-1px', color: WHITE, left: '52px', top: '50px', textAlign: 'left' }}>
                  <span style={{ display: 'block' }}>MILK FEEDING PROGRAM</span>
                  <span style={{ display: 'block', marginTop: '10px' }}>FACTSHEET</span>
                </h1>
                <div style={{ position: 'absolute', left: '49px', top: '172px', width: '868px', height: '2px', background: WHITE }}></div>
                <div style={{ position: 'absolute', left: '52px', top: '201px', fontSize: '24px', fontWeight: 500, color: WHITE, letterSpacing: '1px' }}>{eff}</div>
              </div>

              {/* Logo Panel */}
              <div className="pimd-header-logos">
                <div className="pimd-asset-wrapper" style={{ left: '40px', top: '53px', width: '124px', height: '108px' }}>
                  <img src="/assets/pimd-infographic/06_DA_PCC_LOGO_TRANSPARENT.png" alt="DA Logo" className="pimd-transparent-asset"/>
                </div>
                <div className="pimd-asset-wrapper" style={{ left: '164px', top: '40px', width: '123px', height: '129px' }}>
                  <img src="/assets/pimd-infographic/04_BAGONG_PILIPINAS_TRANSPARENT.png" alt="Bagong Pilipinas" className="pimd-transparent-asset"/>
                </div>
              </div>

              {/* ── METRICS ROW 1 ───────────────────────── */}
              <div className="abs-card pimd-gross-income">
                <div className="box-title" style={{marginBottom:'10px'}}>GROSS INCOME FROM THE RAW MILK</div>
                <FittedText text={c(stats.grossIncome)} maxWidth={840} maxSize={62} minSize={44} />
              </div>

              <div className="abs-card pimd-accomplishment">
                <div className="box-title" style={{fontSize:'19px'}}>MILK FEEDING PROGRAM<br/>ACCOMPLISHMENT</div>
                <div className="box-val" style={{fontSize:'70px', marginTop:'14px'}}>00%</div>
              </div>

              <div className="abs-card pimd-gross-revenue">
                <div className="box-title" style={{marginBottom:'10px'}}>GROSS REVENUE EARNED (COOPERATIVE)</div>
                <FittedText text={c(stats.grossRevenue)} maxWidth={840} maxSize={62} minSize={44} />
              </div>

              <div className="pimd-dswd-centers">
                <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center'}}>
                  <div className="box-title" style={{fontSize:'18px', lineHeight:1.15, padding:'0 48px', width:'100%', textAlign:'center'}}>NO. OF CHILD<br/>DEVELOPMENT<br/>CENTERS UNDER DSWD</div>
                  <div style={{width:'100%', marginTop:'4px', textAlign:'center'}}><FittedText text={formatCount(stats.dswdCenters)} maxWidth={200} maxSize={64} minSize={44} /></div>
                </div>
                <img src="/assets/pimd-infographic/01_DSWD_LOGO_TRANSPARENT.png" alt="DSWD" style={{position:'absolute', right:'16px', bottom:'16px', objectFit:'contain', background:'transparent', width:'41px', height:'36px', zIndex:5}}/>
              </div>

              {/* ── BENEFICIARIES ROW ─────────────────── */}
              <div className="pimd-beneficiary-frame">
                {/* Breakdown Texts (Positioned manually within the container) */}
                <div style={{ position:'absolute', top: '190px', left:0, width: '640px', display:'flex', justifyContent:'space-evenly', alignItems:'center' }}>
                  {['DSWD','DEPED','LGU','OTHERS'].map(f=>(
                    <div key={f} style={{textAlign:'center', width: '25%'}}>
                      <div style={{color:NAVY, fontWeight:900, fontSize:'40px', lineHeight:1}}><FittedText text={formatCount(stats.beneByFunder[f]||0)} maxWidth={130} maxSize={40} minSize={20} color={NAVY} /></div>
                      <div style={{color:NAVY, fontWeight:700, fontSize:'20px'}}>{f}</div>
                    </div>
                  ))}
                </div>
                {/* Divider */}
                <div style={{ position:'absolute', top: '178px', left: '636px', width: '8px', height: '75px', background:NAVY }}></div>
                
                <div style={{ position:'absolute', top: '190px', left: '644px', width: '636px', display:'flex', justifyContent:'space-evenly', alignItems:'center' }}>
                  {['DSWD','DEPED','LGU','OTHERS'].map(f=>(
                    <div key={f} style={{textAlign:'center', width: '25%'}}>
                      <div style={{color:NAVY, fontWeight:900, fontSize:'40px', lineHeight:1}}><FittedText text={formatCount(stats.packsByFunder[f]||0)} maxWidth={130} maxSize={40} minSize={20} color={NAVY} /></div>
                      <div style={{color:NAVY, fontWeight:700, fontSize:'20px'}}>{f}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="pimd-beneficiary-total-card" style={{overflow:'visible'}}>
                <div style={{position:'absolute', inset:0, width:'100%', textAlign:'center', zIndex:2, pointerEvents:'none'}}>
                  <div className="box-title" style={{position:'absolute', top:'14px', left:'50%', transform:'translateX(-50%)', width:'100%', padding:'0 12px', margin:0, textAlign:'center', fontWeight:800, lineHeight:1.05, fontSize:'21px'}}>
                    TOTAL NUMBER OF CHILDREN BENEFICIARIES
                  </div>
                  <div style={{position:'absolute', top:'59px', left:'50%', transform:'translateX(-50%)', width:'100%', margin:0, textAlign:'center', display:'flex', justifyContent:'center'}}>
                    <FittedText text={formatCount(stats.totalBene)} maxWidth={346} maxSize={50} minSize={42} />
                  </div>
                </div>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '100px', top: '878px', width: '105px', height: '72px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/03_TWO_CHILDREN_TRANSPARENT.png" alt="Children" className="pimd-transparent-asset"/>
              </div>

              <div className="pimd-milk-packs-card" style={{overflow:'visible'}}>
                <div style={{position:'absolute', inset:0, width:'100%', textAlign:'center', zIndex:2, pointerEvents:'none'}}>
                  <div className="box-title" style={{position:'absolute', top:'14px', left:'50%', transform:'translateX(-50%)', width:'100%', padding:'0 12px', margin:0, textAlign:'center', fontWeight:800, lineHeight:1.05, fontSize:'19px'}}>
                    MILK PACKS DISTRIBUTED TO CHILDREN<br/>BENEFICIARIES
                  </div>
                  <div style={{position:'absolute', top:'59px', left:'50%', transform:'translateX(-50%)', width:'100%', margin:0, textAlign:'center', display:'flex', justifyContent:'center'}}>
                    <FittedText text={formatCount(stats.totalPacks)} maxWidth={346} maxSize={48} minSize={42} />
                  </div>
                </div>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '1206px', top: '871px', width: '104px', height: '78px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/05_THREE_CHILDREN_ILLUSTRATION_TRANSPARENT.png" alt="Children" className="pimd-transparent-asset"/>
              </div>

              {/* ── CHARTS ROW ────────────────────────── */}
              <div className="pimd-milk-utilized-panel">
                <BarChart data={stats.volumeByType}/>
              </div>

              <div className="pimd-packaging-panel">
                <HBar data={stats.packsBySize}/>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '727px', top: '1409px', width: '66px', height: '76px', zIndex: 5 }}>
                <img src="/assets/pimd-infographic/02_MILKY_BOY_TRANSPARENT.png" alt="Milky Boy" className="pimd-transparent-asset"/>
              </div>

              {/* ── BOTTOM ROW ────────────────────────── */}
              <div className="pimd-bottom-left-blue-block"></div>
              
              <div className="pimd-asset-wrapper" style={{ left: '33px', top: '1465px', width: '788px', height: '534px', zIndex: 30 }}>
                <img src="/assets/pimd-infographic/08_THREE_CHILDREN_DRINKING_MILK_TRANSPARENT.png" alt="Children drinking" className="pimd-transparent-asset" style={{ objectPosition:'bottom left', pointerEvents:'none' }}/>
              </div>

              <div className="abs-card pimd-cooperative-suppliers">
                <div className="box-title" style={{fontSize:'18px'}}>NO. OF COOPERATIVE<br/>MILK SUPPLIERS</div>
                <div style={{marginTop: '15px'}}><FittedText text={formatCount(stats.coopCount)} maxWidth={200} maxSize={64} minSize={44} /></div>
              </div>

              <div className="abs-card pimd-districts">
                <div className="box-title" style={{fontSize:'22px', margin: 0}}>NO. OF DISTRICTS SUPPLIED</div>
                <div className="box-val" style={{fontSize:'56px', margin: 0}}>{formatCount(stats.districtCount)}</div>
              </div>

              <div className="pimd-sdo-card-background" />
              <div className="pimd-sdo-card-content">
                <div className="box-title" style={{fontSize:'24px', marginBottom:'28px', pointerEvents:'auto'}}>NO. OF SCHOOL<br/>DIVISION OFFICE</div>
                <div style={{pointerEvents:'auto'}}><FittedText text={formatCount(stats.divisionCount)} maxWidth={250} maxSize={110} minSize={44} /></div>
              </div>
              <div className="pimd-asset-wrapper" style={{ left: '838px', top: '1843px', width: '98px', height: '51px', zIndex: 41, pointerEvents:'auto' }}>
                <img src="/assets/pimd-infographic/07_DEPED_LOGO_TRANSPARENT.png" alt="DepEd" className="pimd-transparent-asset"/>
              </div>

              <div className="abs-card pimd-provinces">
                <div className="box-title" style={{fontSize:'19px'}}>NO. OF PROVINCES<br/>SUPPLIED</div>
                <div style={{marginTop: '15px'}}><FittedText text={formatCount(stats.provinceCount)} maxWidth={240} maxSize={70} minSize={44} /></div>
              </div>

              <div className="abs-card pimd-schools">
                <div className="box-title" style={{fontSize:'19px'}}>NO. OF SCHOOLS<br/>SUPPLIED</div>
                <div style={{marginTop: '15px'}}><FittedText text={formatCount(stats.schoolCount)} maxWidth={240} maxSize={70} minSize={44} /></div>
              </div>

            </section>
          </div>
        </div>
      ) : null}
    </div>
  )
}
