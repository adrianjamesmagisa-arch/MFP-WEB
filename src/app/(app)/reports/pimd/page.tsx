'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PCC_CENTERS } from '@/lib/types'
import { Download, Filter } from 'lucide-react'

// ── Brand colours ──────────────────────────────────────────────────
const NAVY  = '#0f2557'
const NAVY2 = '#1a3a6b'
const GOLD  = '#f5a623'
const LBG   = '#dce9f8'   // light-blue background
const WHITE = '#ffffff'

const YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026']
const MONTHS = [
  ['1','January'],['2','February'],['3','March'],['4','April'],
  ['5','May'],['6','June'],['7','July'],['8','August'],
  ['9','September'],['10','October'],['11','November'],['12','December'],
]

function n(v: number) { return v.toLocaleString('en-PH') }
function c(v: number) { return '₱' + v.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}) }

const MILK_LABEL: Record<string,string> = {
  PM:'Pasteurized Milk', SM:'Sterilized Milk', SMP:'Skim Milk Powder', Karabao:'Karabao Milk',
}

interface Stats {
  grossIncome:number; grossRevenue:number; dswdCenters:number
  totalBene:number; beneByFunder:Record<string,number>
  totalPacks:number; packsByFunder:Record<string,number>
  volumeByType:Record<string,number>; packsByType:Record<string,number>
  coopCount:number; districtCount:number; divisionCount:number
  provinceCount:number; schoolCount:number
}

// ── SVG Vertical Bar Chart ─────────────────────────────────────────
function BarChart({ data }: { data: Record<string,number> }) {
  const entries = Object.entries(data).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1])
  if (!entries.length) return (
    <div style={{textAlign:'center',color:'#94a3b8',padding:'1.5rem',fontSize:'0.8rem'}}>No data</div>
  )

  const maxVal = Math.max(...entries.map(([,v]) => v), 1)
  // nice Y-axis ceiling
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal)))
  const yMax = Math.ceil(maxVal / mag) * mag
  const steps = 4

  const W = 300, H = 170
  const PL = 55, PB = 42, PT = 18, PR = 8
  const cW = W - PL - PR
  const cH = H - PT - PB
  const bW = (cW / entries.length) * 0.55
  const bGap = cW / entries.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{overflow:'visible', display:'block'}}>
      {/* grid + Y labels */}
      {Array.from({length:steps+1},(_,i)=>{
        const val = (yMax/steps)*i
        const y   = PT + cH - (val/yMax)*cH
        const lbl = val>=1000000?`${(val/1000000).toFixed(0)}M` : val>=1000?`${(val/1000).toFixed(0)}K` : val
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#e2e8f0" strokeWidth={0.7}/>
            <text x={PL-4} y={y+3} textAnchor="end" fontSize={7} fill="#94a3b8">{String(lbl)}</text>
          </g>
        )
      })}

      {/* Axes */}
      <line x1={PL} y1={PT} x2={PL} y2={PT+cH} stroke="#cbd5e1" strokeWidth={1}/>
      <line x1={PL} y1={PT+cH} x2={W-PR} y2={PT+cH} stroke="#cbd5e1" strokeWidth={1}/>

      {/* Bars */}
      {entries.map(([type, val], i)=>{
        const bH = Math.max((val/yMax)*cH, 2)
        const x  = PL + i*bGap + (bGap-bW)/2
        const y  = PT + cH - bH
        const vlbl = val>=1000000?`${(val/1000000).toFixed(2)}M` : val>=1000?`${(val/1000).toFixed(0)}K` : String(val)
        const words = (MILK_LABEL[type]??type).split(' ')
        return (
          <g key={type}>
            <rect x={x} y={y} width={bW} height={bH} fill={NAVY} rx={2}/>
            <text x={x+bW/2} y={y-4} textAnchor="middle" fontSize={7} fontWeight="bold" fill={NAVY}>{vlbl}</text>
            {words.map((w,wi)=>(
              <text key={wi} x={x+bW/2} y={PT+cH+13+wi*9}
                textAnchor="middle" fontSize={6.5} fill="#475569">{w}</text>
            ))}
          </g>
        )
      })}
    </svg>
  )
}

// ── SVG Horizontal Bar Chart ───────────────────────────────────────
function HBar({ data }: { data: Record<string,number> }) {
  const entries = Object.entries(data).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1])
  if (!entries.length) return (
    <div style={{textAlign:'center',color:'#90aed6',padding:'1.5rem',fontSize:'0.8rem'}}>No data</div>
  )
  const maxVal = Math.max(...entries.map(([,v]) => v), 1)

  const W = 290, rowH = 28, labelW = 95, numW = 40, PR = 10
  const barAreaW = W - labelW - numW - PR
  const H = entries.length * rowH + 10

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{overflow:'visible', display:'block'}}>
      {entries.map(([type, val], i)=>{
        const bW = (val/maxVal) * barAreaW
        const y  = i * rowH + 5
        const label = MILK_LABEL[type] ?? type
        return (
          <g key={type}>
            {/* label */}
            <text x={0} y={y+16} fontSize={8} fill="#90aed6" fontWeight={700}>{label}</text>
            {/* bar */}
            <rect x={labelW} y={y+6} width={Math.max(bW,2)} height={14} fill={GOLD} rx={3} opacity={0.9}/>
            {/* value */}
            <text x={labelW + Math.max(bW,2) + 4} y={y+16} fontSize={7.5} fill={WHITE} fontWeight={700}>{n(val)}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Main Page ──────────────────────────────────────────────────────
export default function PIMDReportPage() {
  const supabase = createClient()
  const [center, setCenter] = useState('')
  const [year,   setYear]   = useState('')
  const [month,  setMonth]  = useState('')
  const [stats,  setStats]  = useState<Stats|null>(null)
  const [loading,setLoading]= useState(true)
  const [isEncoder, setIsEncoder] = useState(false)

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      if (!user) return
      supabase.from('profiles').select('role,center').eq('id',user.id).single().then(({data})=>{
        if (!data) return
        if (data.role==='encoder') { setIsEncoder(true); setCenter(data.center??'') }
      })
    })
  },[])

  useEffect(()=>{ fetchData() },[center,year,month])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('mfp_data')
      .select('beneficiaries,milk_packs,milk_cost,total_funds_transferred,funded_by,center,province,division,municipality,elementary_school,milk_type,total_volume_requirements,supplier_id,date_started')
      .range(0,49999)

    if (center) q = q.eq('center', center)
    if (year)   q = q.eq('year', parseInt(year))

    let {data:rows} = await q
    rows = rows ?? []

    if (month && rows.length) {
      const m = parseInt(month)
      rows = rows.filter(r => r.date_started && (new Date(r.date_started).getMonth()+1)===m)
    }

    const grossIncome  = rows.reduce((s,r)=>s+(r.milk_cost||0),0)
    const grossRevenue = rows.reduce((s,r)=>s+(r.total_funds_transferred||0),0)
    const totalBene    = rows.reduce((s,r)=>s+(r.beneficiaries||0),0)
    const totalPacks   = rows.reduce((s,r)=>s+(r.milk_packs||0),0)

    const beneByFunder:Record<string,number>   = {}
    const packsByFunder:Record<string,number>  = {}
    const volumeByType:Record<string,number>   = {}
    const packsByType:Record<string,number>    = {}

    rows.forEach(r=>{
      const f = r.funded_by||'Others'
      beneByFunder[f]  = (beneByFunder[f]||0)  + (r.beneficiaries||0)
      packsByFunder[f] = (packsByFunder[f]||0) + (r.milk_packs||0)
      const t = r.milk_type||'Unknown'
      volumeByType[t]  = (volumeByType[t]||0)  + (r.total_volume_requirements||0)
      packsByType[t]   = (packsByType[t]||0)   + (r.milk_packs||0)
    })

    const dswdCenters   = new Set(rows.filter(r=>r.funded_by==='DSWD').map(r=>r.center)).size
    setStats({
      grossIncome, grossRevenue, dswdCenters,
      totalBene, beneByFunder,
      totalPacks, packsByFunder,
      volumeByType, packsByType,
      coopCount:    new Set(rows.map(r=>r.supplier_id).filter(Boolean)).size,
      districtCount:new Set(rows.map(r=>r.municipality).filter(Boolean)).size,
      divisionCount:new Set(rows.map(r=>r.division).filter(Boolean)).size,
      provinceCount:new Set(rows.map(r=>r.province).filter(Boolean)).size,
      schoolCount:  new Set(rows.map(r=>r.elementary_school).filter(Boolean)).size,
    })
    setLoading(false)
  }

  const eff = center || 'NATIONAL IMPACT ZONE'
  const dateLbl = [year?`FY ${year}`:'All Years', month?MONTHS.find(m=>m[0]===month)?.[1]:''].filter(Boolean).join(' · ')
  const printFooter = [eff, dateLbl, new Date().toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})].filter(Boolean).join(' · ')

  return (
    <>
      <style>{`
        @media print {
          aside,.no-print { display:none !important; }
          main { padding:0 !important; overflow:visible !important; background:white !important; }
          body { background:white !important; margin:0 !important; }
          #pimd { width:210mm; max-width:210mm; margin:0 auto; box-shadow:none !important; border-radius:0 !important; }
        }
        @page { size:A4 portrait; margin:8mm; }
      `}</style>

      {/* ── Filter bar ────────────────────────────────── */}
      <div className="no-print" style={{marginBottom:'1.5rem',display:'flex',alignItems:'center',gap:'0.75rem',flexWrap:'wrap'}}>
        <span style={{fontWeight:700,color:NAVY,display:'flex',alignItems:'center',gap:'0.4rem'}}>
          <Filter size={15}/> Filters:
        </span>

        {!isEncoder && (
          <select value={center} onChange={e=>setCenter(e.target.value)}
            style={{padding:'0.45rem 0.75rem',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:'0.83rem',fontWeight:600,color:NAVY,cursor:'pointer'}}>
            <option value="">All Centers</option>
            {PCC_CENTERS.map(c=><option key={c} value={c}>{c}</option>)}
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

        <button onClick={()=>window.print()}
          style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 1.25rem',borderRadius:8,border:'none',background:NAVY,color:WHITE,fontWeight:700,fontSize:'0.83rem',cursor:'pointer',boxShadow:'0 2px 8px rgba(15,37,87,0.25)'}}>
          <Download size={14}/> Download PDF
        </button>
      </div>

      {/* ══════════════════════════════════════════════
          INFOGRAPHIC CARD
      ══════════════════════════════════════════════ */}
      <div id="pimd" style={{
        width:'100%', maxWidth:760, margin:'0 auto',
        fontFamily:"'Plus Jakarta Sans','Inter',Arial,sans-serif",
        background:'white', boxShadow:'0 6px 40px rgba(0,0,0,0.18)',
        borderRadius:10, overflow:'hidden',
      }}>

        {/* ── HEADER ──────────────────────────────── */}
        <div style={{background:NAVY,padding:'1.4rem 1.75rem 1rem',borderBottom:`4px solid ${GOLD}`}}>
          <div style={{fontSize:'2rem',fontWeight:900,color:WHITE,lineHeight:1.1,textTransform:'uppercase',letterSpacing:'-0.5px'}}>
            MILK FEEDING PROGRAM<br/>FACTSHEET
          </div>
          <div style={{width:180,height:3,background:GOLD,margin:'0.5rem 0'}}/>
          <div style={{color:'#a8c4f0',fontWeight:700,fontSize:'0.88rem',letterSpacing:2,textTransform:'uppercase'}}>{eff}</div>
          {dateLbl && <div style={{color:'#6b93c9',fontSize:'0.72rem',marginTop:'0.15rem'}}>{dateLbl}</div>}
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'5rem',color:'#64748b',fontSize:'0.95rem'}}>⏳ Loading data…</div>
        ) : stats ? (<>

          {/* ── METRICS ROW ─────────────────────────── */}
          <div style={{background:LBG,padding:'1rem 1.5rem',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>

            {/* Left column: 2 full-width navy boxes */}
            <div style={{display:'flex',flexDirection:'column',gap:'0.65rem'}}>
              <div style={{background:NAVY,borderRadius:10,padding:'0.9rem 1.25rem'}}>
                <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,textAlign:'center'}}>
                  GROSS INCOME FROM THE RAW MILK
                </div>
                <div style={{color:WHITE,fontSize:'1.55rem',fontWeight:900,textAlign:'center',marginTop:'0.2rem',letterSpacing:'-0.5px'}}>
                  {c(stats.grossIncome)}
                </div>
              </div>
              <div style={{background:NAVY2,borderRadius:10,padding:'0.9rem 1.25rem'}}>
                <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,textAlign:'center'}}>
                  GROSS REVENUE EARNED (COOPERATIVE)
                </div>
                <div style={{color:WHITE,fontSize:'1.55rem',fontWeight:900,textAlign:'center',marginTop:'0.2rem',letterSpacing:'-0.5px'}}>
                  {c(stats.grossRevenue)}
                </div>
              </div>
            </div>

            {/* Right column: accomplishment + DSWD centers */}
            <div style={{display:'flex',flexDirection:'column',gap:'0.65rem'}}>
              <div style={{background:NAVY,borderRadius:10,padding:'0.9rem 1.25rem',flex:1,textAlign:'center'}}>
                <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1.5}}>
                  MILK FEEDING PROGRAM ACCOMPLISHMENT
                </div>
                <div style={{color:WHITE,fontSize:'2rem',fontWeight:900,marginTop:'0.15rem'}}>00%</div>
              </div>
              <div style={{background:NAVY,borderRadius:10,padding:'0.9rem 1.25rem',flex:1,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                    NO. OF CHILD DEVELOPMENT<br/>CENTERS UNDER DSWD
                  </div>
                  <div style={{color:WHITE,fontSize:'2rem',fontWeight:900,marginTop:'0.1rem'}}>{n(stats.dswdCenters)}</div>
                </div>
                <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem'}}>🤝</div>
              </div>
            </div>
          </div>

          {/* ── BENEFICIARIES ROW ───────────────────── */}
          <div style={{background:LBG,padding:'0 1.5rem 1rem'}}>
            <div style={{background:NAVY,borderRadius:12,padding:'1rem 1.5rem',display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>

              {/* Left: beneficiaries */}
              <div style={{paddingRight:'1.25rem',borderRight:'1.5px solid rgba(255,255,255,0.15)'}}>
                <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                  TOTAL NUMBER OF CHILDREN BENEFICIARIES
                </div>
                <div style={{color:WHITE,fontSize:'2.2rem',fontWeight:900,letterSpacing:'-1px',margin:'0.2rem 0'}}>
                  {n(stats.totalBene)}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.25rem',marginTop:'0.5rem'}}>
                  {['DSWD','DepEd','LDS','Others'].map(f=>(
                    <div key={f} style={{textAlign:'center'}}>
                      <div style={{color:WHITE,fontWeight:900,fontSize:'1rem'}}>{n(stats.beneByFunder[f]||0)}</div>
                      <div style={{color:'#90aed6',fontSize:'0.56rem',fontWeight:700,textTransform:'uppercase'}}>{f}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: packs */}
              <div style={{paddingLeft:'1.25rem'}}>
                <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                  MILK PACKS DISTRIBUTED TO CHILDREN
                </div>
                <div style={{color:GOLD,fontSize:'2.2rem',fontWeight:900,letterSpacing:'-1px',margin:'0.2rem 0'}}>
                  {n(stats.totalPacks)}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.25rem',marginTop:'0.5rem'}}>
                  {['DSWD','DepEd','LDS','Others'].map(f=>(
                    <div key={f} style={{textAlign:'center'}}>
                      <div style={{color:WHITE,fontWeight:900,fontSize:'1rem'}}>{n(stats.packsByFunder[f]||0)}</div>
                      <div style={{color:'#90aed6',fontSize:'0.56rem',fontWeight:700,textTransform:'uppercase'}}>{f}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── CHARTS ROW ──────────────────────────── */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',background:'white'}}>

            {/* Milk Utilized — vertical bar chart */}
            <div style={{padding:'1rem 1.25rem',borderRight:'1px solid #e2e8f0'}}>
              <div style={{fontWeight:900,fontSize:'0.8rem',color:NAVY,textTransform:'uppercase',letterSpacing:1,textAlign:'center',marginBottom:'0.5rem'}}>
                MILK UTILIZED (Volume L)
              </div>
              <BarChart data={stats.volumeByType}/>
            </div>

            {/* Packaging & Size — horizontal bars */}
            <div style={{background:NAVY,padding:'1rem 1.25rem'}}>
              <div style={{fontWeight:900,fontSize:'0.8rem',color:WHITE,textTransform:'uppercase',letterSpacing:1,textAlign:'center',marginBottom:'0.75rem',borderBottom:`2px solid ${GOLD}`,paddingBottom:'0.4rem'}}>
                PACKAGING AND SIZE (Packs)
              </div>
              <HBar data={stats.packsByType}/>
            </div>
          </div>

          {/* ── BOTTOM ROW ──────────────────────────── */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1.6fr',background:NAVY}}>

            {/* Left: suppliers */}
            <div style={{padding:'1.25rem',borderRight:'1px solid rgba(255,255,255,0.1)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'0.4rem',background:'rgba(0,0,0,0.1)'}}>
              <div style={{fontSize:'2.5rem',lineHeight:1}}>🏭</div>
              <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1,textAlign:'center',marginTop:'0.25rem'}}>
                NO. OF COOPERATIVE<br/>MILK SUPPLIERS
              </div>
              <div style={{color:GOLD,fontSize:'2.8rem',fontWeight:900,lineHeight:1}}>{n(stats.coopCount)}</div>
            </div>

            {/* Right: 4 stat grid */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>

              {/* Districts - full width top */}
              <div style={{gridColumn:'1/-1',padding:'0.75rem 1.25rem',borderBottom:'1px solid rgba(255,255,255,0.1)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{color:'#90aed6',fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                  NO. OF DISTRICTS SUPPLIED
                </div>
                <div style={{color:WHITE,fontSize:'1.8rem',fontWeight:900}}>{n(stats.districtCount)}</div>
              </div>

              {/* Division */}
              <div style={{padding:'0.75rem 1rem',borderRight:'1px solid rgba(255,255,255,0.1)',borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
                <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                  NO. OF SCHOOL<br/>DIVISION OFFICE
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'0.4rem',marginTop:'0.2rem'}}>
                  <div style={{color:WHITE,fontSize:'1.8rem',fontWeight:900}}>{n(stats.divisionCount)}</div>
                  <span style={{fontSize:'1.2rem'}}>📚</span>
                </div>
              </div>

              {/* Provinces */}
              <div style={{padding:'0.75rem 1rem',borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
                <div style={{color:'#90aed6',fontSize:'0.58rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                  NO. OF PROVINCES<br/>SUPPLIED
                </div>
                <div style={{color:WHITE,fontSize:'1.8rem',fontWeight:900,marginTop:'0.2rem'}}>{n(stats.provinceCount)}</div>
              </div>

              {/* Schools - full width bottom */}
              <div style={{gridColumn:'1/-1',padding:'0.75rem 1.25rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{color:'#90aed6',fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                  NO. OF SCHOOLS SUPPLIED
                </div>
                <div style={{color:WHITE,fontSize:'1.8rem',fontWeight:900}}>{n(stats.schoolCount)}</div>
              </div>
            </div>
          </div>

          {/* ── FOOTER ──────────────────────────────── */}
          <div style={{background:'#07163a',padding:'0.5rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{color:'#4a6fa5',fontSize:'0.62rem'}}>DA-PCC Milk Feeding Program Monitoring System</div>
            <div style={{color:'#4a6fa5',fontSize:'0.62rem'}}>{printFooter}</div>
          </div>

        </>) : null}
      </div>
    </>
  )
}
