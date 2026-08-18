'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PCC_CENTERS } from '@/lib/types'
import { Download, Filter } from 'lucide-react'
import Image from 'next/image'

// ── Brand colours ──────────────────────────────────────────────────
const NAVY  = '#0f2f57'
const WHITE = '#ffffff'
const LBG   = 'linear-gradient(135deg, #dce9f8 0%, #fefcf3 50%, #dce9f8 100%)' // matched from Canva

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
  if (!entries.length) return <div style={{textAlign:'center',color:'#94a3b8',padding:'1.5rem',fontSize:'0.78rem'}}>No data</div>

  const maxVal = Math.max(...entries.map(([,v]) => v), 1)
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal)))
  const yMax = Math.ceil(maxVal / mag) * mag
  const steps = 4

  const W=310, H=160, PL=45, PB=25, PT=15, PR=8
  const cW=W-PL-PR, cH=H-PT-PB
  const bW=(cW/entries.length)*0.45
  const bGap=cW/entries.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{overflow:'visible',display:'block'}}>
      {Array.from({length:steps+1},(_,i)=>{
        const val=(yMax/steps)*i
        const y=PT+cH-(val/yMax)*cH
        const lbl=val>=1000000?`${(val/1000000).toFixed(0)}M`:val>=1000?`${(val/1000).toFixed(0)}K`:String(val)
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#e2e8f0" strokeWidth={0.7}/>
            <text x={PL-4} y={y+3} textAnchor="end" fontSize={8} fill="#64748b">{lbl}</text>
          </g>
        )
      })}
      {/* Bottom axis line */}
      <line x1={PL} y1={PT+cH} x2={W-PR} y2={PT+cH} stroke="#cbd5e1" strokeWidth={1.5}/>
      
      {entries.map(([type,val],i)=>{
        const bH=Math.max((val/yMax)*cH,2)
        const x=PL+i*bGap+(bGap-bW)/2
        const y=PT+cH-bH
        const vlbl=val>=1000000?`${(val/1000000).toFixed(2)}M`:val>=1000?`${(val/1000).toFixed(0)}K`:String(val)
        const label = MILK_LABEL[type]??type
        return (
          <g key={type}>
            <rect x={x} y={y} width={bW} height={bH} fill={NAVY}/>
            <text x={x+bW/2} y={y-5} textAnchor="middle" fontSize={7.5} fontWeight="bold" fill={NAVY}>{vlbl}</text>
            
            {/* 2-line label below bar */}
            {label.split(' ').map((w,wi)=>(
              <text key={wi} x={x+bW/2} y={PT+cH+10+wi*9} textAnchor="middle" fontSize={6.5} fill="#475569">{w}</text>
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
  if (!entries.length) return <div style={{textAlign:'center',color:'#90aed6',padding:'1.5rem',fontSize:'0.78rem'}}>No data</div>
  
  const maxVal=Math.max(...entries.map(([,v])=>v),1)
  const W=290, rowH=24, labelW=85, numW=40, PR=15
  const barAreaW=W-labelW-numW-PR
  const H=entries.length*rowH+25

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{overflow:'visible',display:'block'}}>
      {entries.map(([type,val],i)=>{
        const bW=(val/maxVal)*barAreaW
        const y=i*rowH+5
        const label=MILK_LABEL[type]??type
        return (
          <g key={type}>
            <text x={labelW-5} y={y+12} textAnchor="end" fontSize={7} fill={WHITE} fontWeight={600}>{label}</text>
            {/* White bar */}
            <rect x={labelW} y={y+4} width={Math.max(bW,2)} height={11} fill={WHITE}/>
            {/* Number outside the bar */}
            <text x={labelW+Math.max(bW,2)+4} y={y+12} fontSize={7} fill={WHITE} fontWeight={600}>{val}</text>
          </g>
        )
      })}
      
      {/* Bottom axis with slanted labels (0, 20000, 40000...) */}
      <line x1={labelW} y1={entries.length*rowH+10} x2={W-PR} y2={entries.length*rowH+10} stroke="rgba(255,255,255,0.2)" strokeWidth={1}/>
      {Array.from({length:6},(_,i)=>{
        const v = (maxVal/5)*i
        const x = labelW + (v/maxVal)*barAreaW
        const vStr = v>=1000?`${(v/1000).toFixed(0)}k`:v.toFixed(0)
        return (
          <g key={i}>
            <line x1={x} y1={entries.length*rowH+10} x2={x} y2={entries.length*rowH+13} stroke="rgba(255,255,255,0.4)" strokeWidth={1}/>
            <text x={x} y={entries.length*rowH+20} fontSize={6} fill="rgba(255,255,255,0.7)" transform={`rotate(-45 ${x} ${entries.length*rowH+20})`} textAnchor="end">{vStr}</text>
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
      rows = rows.filter(r=>r.date_started && (new Date(r.date_started).getMonth()+1)===m)
    }
    const grossIncome  = rows.reduce((s,r)=>s+(r.milk_cost||0),0)
    const grossRevenue = rows.reduce((s,r)=>s+(r.total_funds_transferred||0),0)
    const totalBene    = rows.reduce((s,r)=>s+(r.beneficiaries||0),0)
    const totalPacks   = rows.reduce((s,r)=>s+(r.milk_packs||0),0)
    const beneByFunder:Record<string,number>  = {}
    const packsByFunder:Record<string,number> = {}
    const volumeByType:Record<string,number>  = {}
    const packsByType:Record<string,number>   = {}
    rows.forEach(r=>{
      const f=r.funded_by||'OTHERS'
      beneByFunder[f]  = (beneByFunder[f]||0)  + (r.beneficiaries||0)
      packsByFunder[f] = (packsByFunder[f]||0) + (r.milk_packs||0)
      const t=r.milk_type||'Unknown'
      volumeByType[t]  = (volumeByType[t]||0)  + (r.total_volume_requirements||0)
      packsByType[t]   = (packsByType[t]||0)   + (r.milk_packs||0)
    })
    setStats({
      grossIncome, grossRevenue,
      dswdCenters: new Set(rows.filter(r=>r.funded_by==='DSWD').map(r=>r.center)).size,
      totalBene, beneByFunder, totalPacks, packsByFunder,
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

  return (
    <>
      <style>{`
        @media print {
          aside,.no-print { display:none !important; }
          main { padding:0 !important; overflow:visible !important; background:white !important; }
          body { background:white !important; margin:0 !important; }
          #pimd { width:210mm; max-width:210mm; margin:0 auto; box-shadow:none !important; border-radius:0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { size:A4 portrait; margin:6mm; }
        
        .box-title { color:white; font-size:0.6rem; font-weight:400; text-transform:uppercase; letter-spacing:1px; margin-bottom:0.2rem; }
        .box-val { color:white; font-size:1.8rem; font-weight:900; letter-spacing:-0.5px; line-height:1; }
      `}</style>

      {/* ── Filter bar ────────────────────────── */}
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

      {/* ══════════════════════════════════════════
          INFOGRAPHIC
      ══════════════════════════════════════════ */}
      <div id="pimd" style={{
        width:'100%', maxWidth:760, margin:'0 auto',
        fontFamily:"'Inter',Arial,sans-serif",
        background: LBG,
        position: 'relative',
        overflow: 'hidden',
        minHeight: 1000
      }}>

        {/* ── HEADER ─────────────────────────────── */}
        <div style={{display:'flex', width:'100%', alignItems:'stretch', height:110}}>
          {/* Left Navy Block */}
          <div style={{background:NAVY, width:'75%', padding:'1.5rem 2rem', position:'relative'}}>
            <div style={{fontSize:'2.1rem',fontWeight:900,color:WHITE,lineHeight:1.05,textTransform:'uppercase',letterSpacing:'-1px'}}>
              MILK FEEDING PROGRAM<br/>FACTSHEET
            </div>
            <div style={{width:'90%',height:2,background:WHITE,margin:'0.6rem 0'}}/>
            <div style={{color:WHITE,fontWeight:400,fontSize:'0.9rem',textTransform:'uppercase',letterSpacing:0.5}}>{eff}</div>
            
            {/* The little cutout triangle to match the angle? The canva design just has a straight box overlapping another navy box */}
          </div>
          {/* Right Navy Block (slightly different shade or texture in Canva, we'll just use NAVY and put the logos) */}
          <div style={{background:'#164070', width:'25%', position:'relative', display:'flex', alignItems:'center', justifyContent:'center'}}>
            {/* Logos sit here */}
            <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
              <div style={{position:'relative', width:55, height:55}}>
                <Image src="/pimd/da-logo.png" alt="DA Logo" fill style={{objectFit:'contain'}}/>
              </div>
              <div style={{position:'relative', width:60, height:60}}>
                <Image src="/pimd/bagong-pilipinas.png" alt="Bagong Pilipinas" fill style={{objectFit:'contain'}}/>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'5rem',color:'#64748b'}}>⏳ Loading data…</div>
        ) : stats ? (
          <div style={{padding:'1.5rem 2rem 2rem', display:'flex', flexDirection:'column', gap:'1rem', position:'relative', zIndex:1}}>

            {/* ── METRICS ROW 1 ───────────────────────── */}
            <div style={{display:'flex', gap:'1rem'}}>
              {/* Left Column */}
              <div style={{flex:1.2, display:'flex', flexDirection:'column', gap:'0.6rem'}}>
                <div style={{background:NAVY, borderRadius:12, padding:'1.2rem', textAlign:'center'}}>
                  <div className="box-title">GROSS INCOME FROM THE RAW MILK</div>
                  <div className="box-val">{c(stats.grossIncome)}</div>
                </div>
                <div style={{background:NAVY, borderRadius:12, padding:'1.2rem', textAlign:'center'}}>
                  <div className="box-title">GROSS REVENUE EARNED (COOPERATIVE)</div>
                  <div className="box-val">{c(stats.grossRevenue)}</div>
                </div>
              </div>

              {/* Right Column */}
              <div style={{flex:0.8, display:'flex', flexDirection:'column', gap:'0.6rem'}}>
                <div style={{background:NAVY, borderRadius:12, padding:'1.2rem', textAlign:'center', height:'100%', display:'flex', flexDirection:'column', justifyContent:'center'}}>
                  <div className="box-title">MILK FEEDING PROGRAM<br/>ACCOMPLISHMENT</div>
                  <div className="box-val" style={{marginTop:'0.2rem'}}>00%</div>
                </div>
                <div style={{background:NAVY, borderRadius:12, padding:'0.8rem 1.2rem', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <div>
                    <div className="box-title" style={{textAlign:'left'}}>NO. OF CHILD DEVELOPMENT<br/>CENTERS UNDER DSWD</div>
                    <div className="box-val" style={{textAlign:'left'}}>{n(stats.dswdCenters)}</div>
                  </div>
                  <div style={{background:WHITE, borderRadius:4, padding:'0.2rem', display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <Image src="/pimd/dswd-logo.png" alt="DSWD" width={32} height={32} style={{objectFit:'contain'}}/>
                  </div>
                </div>
              </div>
            </div>

            {/* ── BENEFICIARIES ROW ─────────────────── */}
            <div style={{background:WHITE, borderRadius:16, border:`3px solid ${NAVY}`, padding:'1rem 1rem 0.5rem', display:'flex', flexDirection:'column'}}>
              
              <div style={{display:'flex', gap:'0.8rem', marginBottom:'0.8rem'}}>
                {/* Total Beneficiaries Box */}
                <div style={{flex:1, background:NAVY, borderRadius:12, padding:'1rem', position:'relative', display:'flex', flexDirection:'column', alignItems:'center'}}>
                  <div style={{position:'absolute', bottom:-5, left:5}}>
                    <Image src="/pimd/children-left.png" alt="Children" width={55} height={55} style={{objectFit:'contain'}}/>
                  </div>
                  <div className="box-title">TOTAL NUMBER OF CHILDREN BENEFICIARIES</div>
                  <div className="box-val" style={{fontSize:'2.2rem'}}>{n(stats.totalBene)}</div>
                </div>

                {/* Milk Packs Box */}
                <div style={{flex:1, background:NAVY, borderRadius:12, padding:'1rem', position:'relative', display:'flex', flexDirection:'column', alignItems:'center'}}>
                  <div style={{position:'absolute', bottom:-5, right:5}}>
                    <Image src="/pimd/children-right.png" alt="Children" width={55} height={55} style={{objectFit:'contain'}}/>
                  </div>
                  <div className="box-title">MILK PACKS DISTRIBUTED TO CHILDREN BENEFICIARIES</div>
                  <div className="box-val" style={{fontSize:'2.2rem'}}>{n(stats.totalPacks)}</div>
                </div>
              </div>

              {/* The breakdowns */}
              <div style={{display:'flex', alignItems:'center'}}>
                {/* Left Breakdown */}
                <div style={{flex:1, display:'flex', justifyContent:'center', gap:'1.5rem'}}>
                  {['DSWD','DEPED','LGU','OTHERS'].map(f=>(
                    <div key={f} style={{textAlign:'center'}}>
                      <div style={{color:NAVY, fontWeight:900, fontSize:'1.1rem'}}>{n(stats.beneByFunder[f]||0)}</div>
                      <div style={{color:NAVY, fontWeight:700, fontSize:'0.6rem'}}>{f}</div>
                    </div>
                  ))}
                </div>
                {/* Divider */}
                <div style={{width:2, height:30, background:NAVY}}/>
                {/* Right Breakdown */}
                <div style={{flex:1, display:'flex', justifyContent:'center', gap:'1.5rem'}}>
                  {['DSWD','DEPED','LGU','OTHERS'].map(f=>(
                    <div key={f} style={{textAlign:'center'}}>
                      <div style={{color:NAVY, fontWeight:900, fontSize:'1.1rem'}}>{n(stats.packsByFunder[f]||0)}</div>
                      <div style={{color:NAVY, fontWeight:700, fontSize:'0.6rem'}}>{f}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── CHARTS ROW ────────────────────────── */}
            <div style={{display:'flex', gap:'1rem'}}>
              {/* Milk Utilized Chart */}
              <div style={{flex:1, background:WHITE, borderRadius:16, padding:'1rem', boxShadow:'0 4px 20px rgba(0,0,0,0.08)'}}>
                <div style={{color:NAVY, fontWeight:900, fontSize:'1rem', textAlign:'center', marginBottom:'1rem', letterSpacing:'-0.5px'}}>
                  MILK UTILIZED
                </div>
                <BarChart data={stats.volumeByType}/>
              </div>

              {/* Packaging & Size Chart */}
              <div style={{flex:1, background:NAVY, borderRadius:16, padding:'1rem', position:'relative'}}>
                <div style={{color:WHITE, fontWeight:900, fontSize:'1rem', textAlign:'center', marginBottom:'0.8rem', letterSpacing:'-0.5px'}}>
                  PACKAGING AND SIZE
                </div>
                <HBar data={stats.packsByType}/>
                {/* Milky Boy */}
                <div style={{position:'absolute', bottom:-10, left:-15, zIndex:10}}>
                  <Image src="/pimd/milky-boy.png" alt="Milky Boy" width={55} height={75} style={{objectFit:'contain'}}/>
                </div>
              </div>
            </div>

            {/* ── BOTTOM ROW ────────────────────────── */}
            <div style={{display:'flex', marginTop:'3rem', gap:'1rem'}}>
              
              {/* Left Side: Photo + Suppliers Box */}
              <div style={{flex:1.1, position:'relative'}}>
                {/* The large photo overlapping upwards */}
                <div style={{position:'absolute', bottom:-20, left:-20, width:330, height:280, zIndex:20}}>
                  <Image src="/pimd/children-photo.png" alt="Children drinking" fill style={{objectFit:'contain', objectPosition:'bottom left'}}/>
                </div>
                
                {/* Cooperative Milk Suppliers Box (positioned relative to fit in the grid) */}
                <div style={{background:NAVY, padding:'1rem', textAlign:'center', width:140, marginLeft:'auto', position:'relative', zIndex:10}}>
                  <div className="box-title">NO. OF COOPERATIVE<br/>MILK SUPPLIERS</div>
                  <div className="box-val" style={{fontSize:'2.5rem', marginTop:'0.5rem'}}>{n(stats.coopCount)}</div>
                </div>
              </div>

              {/* Right Side: Grid of 4 stats */}
              <div style={{flex:0.9, display:'flex', flexDirection:'column', gap:'4px'}}>
                {/* Districts */}
                <div style={{background:NAVY, padding:'0.8rem 1.2rem', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <div className="box-title" style={{margin:0, fontSize:'0.7rem'}}>NO. OF DISTRICTS SUPPLIED</div>
                  <div className="box-val">{n(stats.districtCount)}</div>
                </div>

                <div style={{display:'flex', gap:'4px'}}>
                  {/* Division */}
                  <div style={{background:NAVY, padding:'0.8rem 1.2rem', flex:1, display:'flex', flexDirection:'column', justifyContent:'center'}}>
                    <div className="box-title" style={{fontSize:'0.65rem'}}>NO. OF SCHOOL<br/>DIVISION OFFICE</div>
                    <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'0.8rem', marginTop:'0.4rem'}}>
                      <div className="box-val" style={{fontSize:'2.5rem'}}>{n(stats.divisionCount)}</div>
                      <div style={{background:WHITE, padding:'2px', borderRadius:2}}>
                        <Image src="/pimd/deped-logo.png" alt="DepEd" width={30} height={30} style={{objectFit:'contain'}}/>
                      </div>
                    </div>
                  </div>
                  {/* Provinces */}
                  <div style={{background:NAVY, padding:'0.8rem 1.2rem', flex:1, display:'flex', flexDirection:'column', justifyContent:'center', textAlign:'center'}}>
                    <div className="box-title" style={{fontSize:'0.65rem'}}>NO. OF PROVINCES<br/>SUPPLIED</div>
                    <div className="box-val" style={{fontSize:'2.2rem', marginTop:'0.4rem'}}>{n(stats.provinceCount)}</div>
                  </div>
                </div>

                {/* Schools */}
                <div style={{background:NAVY, padding:'0.8rem 1.2rem', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <div className="box-title" style={{margin:0, fontSize:'0.7rem'}}>NO. OF SCHOOLS SUPPLIED</div>
                  <div className="box-val">{n(stats.schoolCount)}</div>
                </div>
              </div>

            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
