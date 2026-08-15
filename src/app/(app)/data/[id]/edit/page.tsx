'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { PCC_CENTERS, REGIONS, MODES_OF_PROCUREMENT, type Cooperative } from '@/lib/types'
import { Save, X, AlertCircle, CheckCircle2, RotateCcw, PenLine } from 'lucide-react'

// ─── Formula defaults ───────────────────────────────────────────────────────────
const DEFAULT_FORMULAS = {
  total_volume_factor: 0.18,
  raw_milk_factor:     0.20,
  whole_milk_factor:   0.268,
  skim_milk_factor:    0.274,
  sugar_factor:        0.02,
}
type FormulaKey = keyof typeof DEFAULT_FORMULAS

// ─── Calc column definitions ────────────────────────────────────────────────────
type CalcDef = { letter: string; label: string; formulaKey?: FormulaKey; formulaStr: string; currency?: boolean }
const CALC_DEFS: Record<string, CalcDef> = {
  milk_packs:                { letter: 'I', label: 'Milk Packs',        formulaStr: '= Beneficiaries × Feeding Days' },
  total_volume_requirements: { letter: 'J', label: 'Total Vol. Req',    formulaKey: 'total_volume_factor', formulaStr: '= Milk Packs × [FACTOR]' },
  raw_milk_liters:           { letter: 'K', label: 'Raw Milk (L)',      formulaKey: 'raw_milk_factor',     formulaStr: '= Total Vol. Req × [FACTOR]' },
  whole_milk_kg:             { letter: 'L', label: 'Whole Milk (kg)',   formulaKey: 'whole_milk_factor',   formulaStr: '= Raw Milk × [FACTOR]' },
  skimmed_milk_kg:           { letter: 'M', label: 'Skimmed Milk (kg)', formulaKey: 'skim_milk_factor',    formulaStr: '= Raw Milk × [FACTOR]' },
  sugar:                     { letter: 'N', label: 'Sugar (kg)',         formulaKey: 'sugar_factor',       formulaStr: '= Total Vol. Req × [FACTOR]' },
  milk_cost:                 { letter: 'U', label: 'Milk Cost',          formulaStr: '= Milk Packs × Price', currency: true },
  total_funds_transferred:   { letter: 'W', label: 'Total Funds',       formulaStr: '= Milk Cost + Service Fee', currency: true },
}

const USER_INPUT_FIELDS = [
  'funded_by','region','center','province','division','municipality',
  'elementary_school','feeding_days','batch','beneficiaries',
  'milk_type','price','supplier_id','mode_of_procurement',
  'moa_signing','fund_transfer','date_started','date_completed','liquidation',
] as const

// ─── Types ──────────────────────────────────────────────────────────────────────
interface UserProfile { role: string; center: string; id: string }
interface FormState {
  year: string; funded_by: string; region: string; center: string
  province: string; division: string; municipality: string; elementary_school: string
  feeding_days: string; batch: string; beneficiaries: string
  milk_type: string; price: string; supplier_id: string
  milk_packs: string; total_volume_requirements: string; raw_milk_liters: string
  whole_milk_kg: string; skimmed_milk_kg: string; sugar: string
  milk_cost: string; service_fee: string; total_funds_transferred: string
  mode_of_procurement: string
  moa_signing: string; fund_transfer: string
  date_started: string; date_completed: string; liquidation: string
}
type ActiveCell = { rowIdx: number; letter: string; label: string; field: keyof FormState; formulaKey?: FormulaKey; formulaStr?: string }

const emptyForm = (center = ''): FormState => ({
  year: new Date().getFullYear().toString(),
  funded_by: '', region: '', center,
  province: '', division: '', municipality: '', elementary_school: '',
  feeding_days: '', batch: '', beneficiaries: '',
  milk_type: 'SM', price: '', supplier_id: '',
  milk_packs: '', total_volume_requirements: '', raw_milk_liters: '',
  whole_milk_kg: '', skimmed_milk_kg: '', sugar: '',
  milk_cost: '', service_fee: '0', total_funds_transferred: '',
  mode_of_procurement: '',
  moa_signing: '', fund_transfer: '',
  date_started: '', date_completed: '', liquidation: '',
})

const PROVINCES_BY_REGION: Record<string, string[]> = {
  CAR:   ['Abra','Apayao','Benguet','Ifugao','Kalinga','Mountain Province'],
  I:     ['Ilocos Norte','Ilocos Sur','La Union','Pangasinan'],
  II:    ['Batanes','Cagayan','Isabela','Nueva Vizcaya','Quirino'],
  III:   ['Aurora','Bataan','Bulacan','Nueva Ecija','Pampanga','Tarlac Province','Zambales'],
  IVA:   ['Batangas','Cavite','Laguna','Quezon Province','Rizal'],
  IVB:   ['Marinduque','Occidental Mindoro','Oriental Mindoro','Palawan','Romblon'],
  V:     ['Albay','Camarines Norte','Camarines Sur','Catanduanes','Masbate Province','Sorsogon'],
  NCR:   ['Metro Manila'],
  VI:    ['Aklan','Antique','Capiz','Guimaras','Iloilo Province','Negros Occidental'],
  VII:   ['Bohol Province','Cebu','Negros Oriental','Siquijor'],
  NIR:   ['Negros Occidental','Negros Oriental'],
  VIII:  ['Biliran','Eastern Samar','Leyte','Northern Samar','Samar','Southern Leyte'],
  IX:    ['Zamboanga del Norte','Zamboanga del Sur','Zamboanga Sibugay'],
  X:     ['Bukidnon','Camiguin','Lanao Del Norte','Misamis Occidental','Misamis Oriental'],
  XI:    ['Davao de Oro','Davao del Norte','Davao del Sur','Davao Occidental','Davao Oriental'],
  XII:   ['Cotabato Province','North Cotabato','Sarangani','South Cotabato','Sultan Kudarat'],
  CARAGA:['Agusan del Norte','Agusan del Sur','Dinagat Islands','Surigao del Norte','Surigao del Sur'],
  BARMM: ['Basilan','Lanao del Sur','Maguindanao','Sulu','Tawi-Tawi'],
}
const FEEDING_DAYS_OPTIONS = ['15','20','30','60','90','100','120','180']
const BATCH_OPTIONS = ['1','2','3','1 & 2','1, 2 & 3','2 & 3']
const YEARS = ['2019','2020','2021','2022','2023','2024','2025','2026','2027']

// ─── Calculations ───────────────────────────────────────────────────────────────
function calcAll(bene: number, days: number, price: number, svc: number, f: typeof DEFAULT_FORMULAS) {
  const milkPacks  = bene * days
  const totalVol   = milkPacks * f.total_volume_factor
  const rawMilk    = totalVol * f.raw_milk_factor
  const wholeMilk  = rawMilk * f.whole_milk_factor
  const skimMilk   = rawMilk * f.skim_milk_factor
  const sugar      = totalVol * f.sugar_factor
  const milkCost   = milkPacks * price
  const totalFunds = milkCost + svc
  return { milkPacks, totalVol, rawMilk, wholeMilk, skimMilk, sugar, milkCost, totalFunds }
}

// colOverrides: Set of field names where formula is disabled for the ENTIRE column
function recalculateRow(row: FormState, colOverrides: Set<string>, fml: typeof DEFAULT_FORMULAS): FormState {
  const bene  = parseFloat(row.beneficiaries) || 0
  const days  = parseFloat(row.feeding_days)  || 0
  const price = parseFloat(row.price)         || 0
  const svc   = parseFloat(row.service_fee)   || 0
  const r = { ...row }
  if (bene > 0 && days > 0) {
    const c = calcAll(bene, days, price, svc, fml)
    if (!colOverrides.has('milk_packs'))                r.milk_packs                = c.milkPacks.toString()
    if (!colOverrides.has('total_volume_requirements')) r.total_volume_requirements = c.totalVol.toFixed(4)
    if (!colOverrides.has('raw_milk_liters'))           r.raw_milk_liters           = c.rawMilk.toFixed(4)
    if (!colOverrides.has('whole_milk_kg'))             r.whole_milk_kg             = c.wholeMilk.toFixed(4)
    if (!colOverrides.has('skimmed_milk_kg'))           r.skimmed_milk_kg           = c.skimMilk.toFixed(4)
    if (!colOverrides.has('sugar'))                     r.sugar                     = c.sugar.toFixed(4)
    if (!colOverrides.has('milk_cost'))                 r.milk_cost                 = c.milkCost.toFixed(2)
    if (!colOverrides.has('total_funds_transferred'))   r.total_funds_transferred   = c.totalFunds.toFixed(2)
  } else {
    if (!colOverrides.has('milk_packs'))                r.milk_packs                = ''
    if (!colOverrides.has('total_volume_requirements')) r.total_volume_requirements = ''
    if (!colOverrides.has('raw_milk_liters'))           r.raw_milk_liters           = ''
    if (!colOverrides.has('whole_milk_kg'))             r.whole_milk_kg             = ''
    if (!colOverrides.has('skimmed_milk_kg'))           r.skimmed_milk_kg           = ''
    if (!colOverrides.has('sugar'))                     r.sugar                     = ''
    if (!colOverrides.has('milk_cost'))                 r.milk_cost                 = ''
    if (!colOverrides.has('total_funds_transferred'))   r.total_funds_transferred   = ''
  }
  return r
}

function countUserFilled(row: FormState): number {
  const em = emptyForm()
  return USER_INPUT_FIELDS.filter(f => row[f] !== '' && row[f] !== em[f]).length
}

function isRowValid(r: FormState): boolean {
  if (parseInt(r.beneficiaries || '0') <= 0) return false
  if (parseFloat(r.price || '0') <= 0) return false
  
  if (r.funded_by === 'DepEd') {
    if (!r.division?.trim()) return false
    if (!r.elementary_school?.trim()) return false
  }
  
  return true
}

function isDuplicate(r: FormState, existing: any[], currentId: string): boolean {
  if (!r.beneficiaries || !r.feeding_days || !r.milk_cost) return false;
  return existing.some(ex => 
    String(ex.id) !== String(currentId) &&
    String(ex.beneficiaries) === String(r.beneficiaries) &&
    String(ex.feeding_days) === String(r.feeding_days) &&
    parseFloat(ex.milk_cost || '0').toFixed(2) === parseFloat(r.milk_cost || '0').toFixed(2) &&
    parseFloat(ex.total_funds_transferred || '0').toFixed(2) === parseFloat(r.total_funds_transferred || '0').toFixed(2) &&
    (ex.moa_signing_date || '') === (r.moa_signing || '') &&
    (ex.fund_transfer_date || '') === (r.fund_transfer || '') &&
    (ex.liquidation_date || '') === (r.liquidation || '')
  )
}

function isDuplicateInForm(r: FormState, rowIdx: number, rows: FormState[]): boolean {
  if (!r.beneficiaries || !r.feeding_days || !r.milk_cost) return false;
  return rows.some((other, idx) => 
    idx !== rowIdx &&
    other.beneficiaries === r.beneficiaries &&
    other.feeding_days === r.feeding_days &&
    other.milk_cost === r.milk_cost &&
    other.total_funds_transferred === r.total_funds_transferred &&
    other.moa_signing === r.moa_signing &&
    other.fund_transfer === r.fund_transfer &&
    other.liquidation === r.liquidation
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const ROW_H = 46

const lTh: React.CSSProperties = {
  background: '#e2e8f0', color: '#475569', fontWeight: 700, fontSize: '0.72rem',
  textAlign: 'center', padding: '3px 4px', border: '1px solid #cbd5e1',
  height: 24, userSelect: 'none', letterSpacing: '0.04em', boxSizing: 'border-box',
}
const cTh: React.CSSProperties = { ...lTh, background: '#fef3c7', color: '#92400e' }
const nTd: React.CSSProperties = {
  background: '#f8fafc', color: '#1e293b', fontWeight: 600, fontSize: '0.73rem',
  padding: '4px 8px', border: '1px solid #e2e8f0', height: 36,
  verticalAlign: 'middle', whiteSpace: 'nowrap', boxSizing: 'border-box',
}
const cnTd: React.CSSProperties = { ...nTd, background: '#fffbeb', color: '#92400e' }
const rnTd: React.CSSProperties = {
  background: '#f1f5f9', color: '#94a3b8', textAlign: 'center',
  fontSize: '0.7rem', border: '1px solid #e2e8f0', fontWeight: 600,
  verticalAlign: 'middle', width: 36, userSelect: 'none' as const, height: ROW_H, boxSizing: 'border-box',
}
// Input cells
const iCell: React.CSSProperties = {
  border: '1px solid #e2e8f0', padding: 0, background: 'white',
  verticalAlign: 'middle', height: ROW_H, overflow: 'hidden', boxSizing: 'border-box',
}
const kCell: React.CSSProperties = { ...iCell, background: '#f0f9ff' }
// Input/select fill entire cell
const cInput: React.CSSProperties = {
  display: 'block', width: '100%', height: ROW_H,
  border: 'none', outline: 'none',
  padding: '0 8px', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif',
  background: 'transparent', color: '#1e293b', boxSizing: 'border-box' as const,
  verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
}
const cSelect: React.CSSProperties = { ...cInput, cursor: 'pointer' }
// Sticky cols
const sRn: React.CSSProperties = { position: 'sticky', left: 0,   zIndex: 6, width: 36,  minWidth: 36,  maxWidth: 36 }
const sA:  React.CSSProperties = { position: 'sticky', left: 36,  zIndex: 6, width: 85,  minWidth: 85,  maxWidth: 85 }
const sB:  React.CSSProperties = { position: 'sticky', left: 121, zIndex: 6, width: 135, minWidth: 135, maxWidth: 135 }
const sC:  React.CSSProperties = { position: 'sticky', left: 256, zIndex: 6, width: 110, minWidth: 110, maxWidth: 110 }
const sD:  React.CSSProperties = { position: 'sticky', left: 366, zIndex: 6, width: 160, minWidth: 160, maxWidth: 160, boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }
const dividerBorder = '2px solid #94a3b8'

// Prevent Enter from submitting the form inside any text/number input
const noEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault() }

// ─── Component ──────────────────────────────────────────────────────────────────


export default function EditRecordPage() {
  const params = useParams() as { id: string }
  const [rows, setRows]           = useState<FormState[]>([emptyForm()])
  // colOverrides: column fields where formula is DISABLED for all rows
  const [colOverrides, setColOverrides] = useState<Set<string>>(new Set(Object.keys(CALC_DEFS)))
  const [cooperatives, setCoop]   = useState<Cooperative[]>([])
  const [profile, setProfile]     = useState<UserProfile | null>(null)
  const [formulas, setFormulas]   = useState({ ...DEFAULT_FORMULAS })
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [formulasSaved, setFormulasSaved] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const [existingRecords, setExistingRecords] = useState<any[]>([])
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const factorInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router   = useRouter()

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('mfp_data').select('*').eq('id', params.id).single().then(({ data }) => {
      if (data) {
        setRows([{
          year: String(data.year || ''), funded_by: data.funded_by || '',
          region: data.region || '', center: data.center || '',
          province: data.province || '', division: data.division || '',
          municipality: data.municipality || '', elementary_school: data.elementary_school || '',
          feeding_days: String(data.feeding_days || ''), batch: data.batch || '',
          beneficiaries: String(data.beneficiaries || ''), milk_type: data.milk_type || '',
          price: data.price ? String(data.price) : '', supplier_id: data.supplier_id || '',
          milk_packs: String(data.milk_packs || ''), total_volume_requirements: String(data.total_volume_requirements || ''),
          raw_milk_liters: String(data.raw_milk_liters || ''), whole_milk_kg: String(data.whole_milk_kg || ''),
          skimmed_milk_kg: String(data.skimmed_milk_kg || ''), sugar: String(data.sugar || ''),
          milk_cost: data.milk_cost ? String(data.milk_cost) : '',
          service_fee: data.service_fee !== null ? String(data.service_fee) : '0',
          total_funds_transferred: data.total_funds_transferred ? String(data.total_funds_transferred) : '',
          mode_of_procurement: data.mode_of_procurement || '',
          moa_signing: data.moa_signing_date || '', fund_transfer: data.fund_transfer_date || '',
          date_started: data.date_started || '', date_completed: data.date_completed || '',
          liquidation: data.liquidation_date || ''
        }]);
      }
    });
    supabase.from('cooperatives').select('id, name, short_name, region, is_active, created_at').order('name')
      .then(({ data }) => setCoop(data ?? []))
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('role, center, id, formula_config').eq('id', user.id).single()
        .then(({ data }) => {
          if (!data) return
          const center = data.center ?? ''
          setProfile({ role: data.role, center, id: data.id })
          if (center) setRows(prev => prev.map(r => ({ ...r, center })))
          const saved = data.formula_config as Record<string, number> | null
          if (saved && typeof saved === 'object') {
            const merged = { ...DEFAULT_FORMULAS, ...Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in DEFAULT_FORMULAS && typeof v === 'number' && v > 0)) }
            setFormulas(merged)
          }

          // Fetch existing records for duplicate checking
          let q = supabase.from('mfp_data').select('milk_cost, total_funds_transferred, feeding_days, beneficiaries, moa_signing_date, fund_transfer_date, liquidation_date')
          if (center && data.role !== 'super_admin') q = q.eq('center', center)
          q.then(({ data: records }) => {
            if (records) setExistingRecords(records)
          })
        })
    })
  }, [])

  // ── Update a single cell ─────────────────────────────────────────────────────
  function updateRow(rowIdx: number, field: keyof FormState, value: string) {
    setError('') // Always clear error when user edits any cell
    const newRows = rows.map((r, i) => {
      if (i !== rowIdx) return r
      return recalculateRow({ ...r, [field]: value }, colOverrides, formulas)
    })
    // Auto-add disabled for Edit
    setRows(newRows)
  }

  // ── Toggle formula override for an ENTIRE COLUMN ─────────────────────────────
  function toggleColOverride(field: string, manual: boolean) {
    const newSet = new Set(colOverrides)
    if (manual) newSet.add(field)
    else newSet.delete(field)
    setColOverrides(newSet)
    if (!manual) {
      // Restore formula: recalculate all rows with formula re-enabled for this column
      setRows(prev => prev.map(r => recalculateRow(r, newSet, formulas)))
    }
  }

  // ── Update formula factor → recalculate all rows ─────────────────────────────
  function updateFactor(key: FormulaKey, val: number) {
    const nf = { ...formulas, [key]: val }
    setFormulas(nf)
    setRows(prev => prev.map(r => recalculateRow(r, colOverrides, nf)))
    saveFormulas(nf)
  }

  function saveFormulas(fml: typeof DEFAULT_FORMULAS) {
    if (!profile?.id) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      await supabase.from('profiles').update({ formula_config: fml }).eq('id', profile.id)
      setFormulasSaved(true)
      setTimeout(() => setFormulasSaved(false), 2000)
    }, 800)
  }

  function isModified(key: FormulaKey) { return Math.abs(formulas[key] - DEFAULT_FORMULAS[key]) > 0.00001 }

  const fmtNum = (v: string, currency = false) => {
    const n = parseFloat(v)
    if (isNaN(n) || v === '') return '—'
    return (currency ? '₱' : '') + n.toLocaleString('en-PH', { maximumFractionDigits: 2 })
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validRows = rows.filter(isRowValid)
    if (validRows.length === 0) {
      setError('Beneficiaries (Q) and Price (S) are required.')
      return
    }
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setLoading(false); return }
    const { error: err } = await supabase.from('mfp_data').update(
      {
        year: parseInt(validRows[0].year), funded_by: validRows[0].funded_by,
        region: validRows[0].region || null, center: validRows[0].center || null,
        province: validRows[0].province || null, division: validRows[0].division || null,
        municipality: validRows[0].municipality || null, elementary_school: validRows[0].elementary_school || null,
        milk_packs: parseFloat(validRows[0].milk_packs) || 0,
        total_volume_requirements: parseFloat(validRows[0].total_volume_requirements) || 0,
        raw_milk_liters: parseFloat(validRows[0].raw_milk_liters) || 0,
        whole_milk_kg: parseFloat(validRows[0].whole_milk_kg) || 0,
        skimmed_milk_kg: parseFloat(validRows[0].skimmed_milk_kg) || 0,
        sugar: parseFloat(validRows[0].sugar) || 0,
        feeding_days: parseInt(validRows[0].feeding_days) || 0, batch: validRows[0].batch || null,
        beneficiaries: parseInt(validRows[0].beneficiaries) || 0,
        milk_type: validRows[0].milk_type || null, price: parseFloat(validRows[0].price) || 0,
        supplier_id: validRows[0].supplier_id || null,
        milk_cost: parseFloat(validRows[0].milk_cost) || 0, service_fee: parseFloat(validRows[0].service_fee) || 0,
        total_funds_transferred: parseFloat(validRows[0].total_funds_transferred) || 0,
        mode_of_procurement: validRows[0].mode_of_procurement || null,
        moa_signing_date: validRows[0].moa_signing || null, fund_transfer_date: validRows[0].fund_transfer || null,
        date_started: validRows[0].date_started || null, date_completed: validRows[0].date_completed || null,
        liquidation_date: validRows[0].liquidation || null
      }).eq('id', params.id)
    if (err) { setError(err.message); setLoading(false) }
    else { setSavedCount(validRows.length); setSuccess(true); setTimeout(() => router.push('/data'), 2500) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const isSuperAdmin = profile?.role === 'super_admin'
  const validRowCount = rows.filter(isRowValid).length
  const activeBorder = (rowIdx: number, letter: string): React.CSSProperties => {
    if (activeCell?.rowIdx !== rowIdx || activeCell?.letter !== letter) return {}
    return { boxShadow: 'inset 0 0 0 2px #2563eb' }
  }

  // ── Render Formula Header ──────────────────────────────────────────────────────
  const renderFormulaHeader = (title: string, field: keyof FormState, formulaStr: string, factorKey?: FormulaKey) => {
    const isManual = colOverrides.has(field)
    return (
      <td key={field} style={{ ...cnTd, background: isManual ? '#fff7ed' : '#fffbeb' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span>{title}</span>
          <button type="button" onClick={() => toggleColOverride(field, !isManual)}
            title={isManual ? "Manual Override ON - Click to disable" : "Manual Override OFF - Click to enable"}
            style={{ 
              background: isManual ? '#ea580c' : '#fcd34d', color: isManual ? 'white' : '#92400e', 
              border: 'none', borderRadius: 4, width: 16, height: 16, fontSize: '0.55rem', fontWeight: 700, cursor: 'pointer'
            }}>M</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', opacity: isManual ? 0.6 : 1, color: '#92400e' }}>
          {formulaStr}
          {factorKey && (
            <input type="number" step="any"
              value={formulas[factorKey]}
              onChange={e => updateFactor(factorKey, parseFloat(e.target.value) || 0)}
              onKeyDown={noEnter} disabled={isManual} title="Edit formula factor"
              style={{ width: 44, padding: '1px 2px', border: '1px solid #fbbf24', borderRadius: 2, background: isManual ? '#f8fafc' : 'white', textAlign: 'center', fontSize: '0.65rem', outline: 'none', color: '#92400e' }}
            />
          )}
          {factorKey && isModified(factorKey) && <span style={{fontSize: '0.6rem'}}>✎</span>}
        </div>
      </td>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────────
  if (success) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <CheckCircle2 size={64} color="var(--gold)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ color: 'var(--navy)', fontWeight: 800, fontSize: '1.5rem' }}>{savedCount} Record{savedCount !== 1 ? 's' : ''} Saved!</h2>
        <p style={{ color: 'var(--gray-600)', marginTop: '0.5rem' }}>Redirecting to data table...</p>
      </div>
    </div>
  )

  // ── Render a calculated cell ──────────────────────────────────────────────────
  function renderCalcCell(rowIdx: number, field: keyof FormState) {
    const def = CALC_DEFS[field]
    if (!def) return null
    const isManual   = colOverrides.has(field)
    const val        = rows[rowIdx][field]
    const modified   = def.formulaKey ? isModified(def.formulaKey) : false
    const cellActive = activeCell?.rowIdx === rowIdx && activeCell?.letter === def.letter

    const onCellClick = () => setActiveCell({ rowIdx, letter: def.letter, label: def.label, field, formulaKey: def.formulaKey, formulaStr: def.formulaStr })

    if (isManual) {
      return (
        <td key={field} style={{ ...iCell, background: '#fff7ed', border: '1px solid #fdba74', position: 'relative', ...(cellActive ? { boxShadow: 'inset 0 0 0 2px #2563eb' } : {}) }}>
          <span style={{ position: 'absolute', top: 2, right: 2, fontSize: '0.52rem', background: '#f97316', color: 'white', borderRadius: 2, padding: '0 2px', fontWeight: 700, lineHeight: 1.4, zIndex: 2, pointerEvents: 'none' }}>M</span>
          <input type="number" value={val}
            onChange={e => updateRow(rowIdx, field, e.target.value)}
            onFocus={onCellClick}
            onKeyDown={noEnter}
            style={{ ...cInput, textAlign: 'right', color: '#c2410c', fontWeight: 600 }}
          />
        </td>
      )
    }

    return (
      <td key={field} onClick={onCellClick}
        style={{ ...iCell, background: modified ? '#dbeafe' : '#fffbeb', cursor: 'pointer',
          textAlign: 'right', padding: '0 10px', fontWeight: 600,
          color: modified ? '#1d4ed8' : '#78350f', fontVariantNumeric: 'tabular-nums',
          ...(cellActive ? { boxShadow: 'inset 0 0 0 2px #2563eb' } : {}) }}>
        {fmtNum(val, !!def.currency)}
      </td>
    )
  }

  // ── Render a data row ─────────────────────────────────────────────────────────
  function renderDataRow(rowIdx: number) {
    const row     = rows[rowIdx]
    const prov    = PROVINCES_BY_REGION[row.region] ?? []
    const isValid = isRowValid(row)
    const filled  = countUserFilled(row)
    const opacity = filled === 0 && rowIdx >= 2 ? 0.5 : 1
    const isDeped = row.funded_by === 'DepEd'
    const isDup   = isDuplicate(row, existingRecords, params.id) || isDuplicateInForm(row, rowIdx, rows)

    const hc = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      updateRow(rowIdx, e.target.name as keyof FormState, e.target.value)
    const fc = (letter: string, field: keyof FormState) => () =>
      setActiveCell({ rowIdx, letter, label: letter, field })

    return (
      <tr key={rowIdx} style={{ opacity }}>
        {/* Row # */}
        <td title={isDup ? "Warning: Duplicate row detected" : ""} style={{ ...rnTd, ...sRn, background: isDup ? '#fef2f2' : (isValid ? '#f0fdf4' : '#f1f5f9'), color: isDup ? '#ef4444' : (isValid ? '#16a34a' : '#94a3b8'), fontWeight: isValid || isDup ? 800 : 600 }}>
          {isDup ? <AlertCircle size={14} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> : (isValid ? '✓' : rowIdx + 1)}
        </td>

        {/* A: Year */}
        <td style={{ ...iCell, ...sA, ...activeBorder(rowIdx, 'A') }}>
          <select name="year" style={cSelect} value={row.year} onChange={hc} onFocus={fc('A', 'year')}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </td>

        {/* B: Funded By */}
        <td style={{ ...iCell, ...sB, ...activeBorder(rowIdx, 'B') }}>
          <select name="funded_by" style={cSelect} value={row.funded_by} onChange={hc} onFocus={fc('B', 'funded_by')}>
            <option value="">— Select —</option>
            <option value="DepEd">DepEd</option>
            <option value="DSWD">DSWD</option>
            <option value="LDS">LDS</option>
          </select>
        </td>

        {/* C: Region */}
        <td style={{ ...iCell, ...sC, ...activeBorder(rowIdx, 'C') }}>
          <select name="region" style={cSelect} value={row.region} onChange={hc} onFocus={fc('C', 'region')}>
            <option value="">— Select —</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </td>

        {/* D: Center */}
        <td style={{ ...iCell, ...sD, borderRight: dividerBorder, background: (!isSuperAdmin && !!profile?.center) ? '#f1f5f9' : 'white', ...activeBorder(rowIdx, 'D') }}>
          <select name="center" style={cSelect} value={row.center} onChange={hc} onFocus={fc('D', 'center')} disabled={!isSuperAdmin && !!profile?.center}>
            <option value="">— Select —</option>
            {PCC_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </td>

        {/* E: Province */}
        <td style={{ ...iCell, width: 180, ...activeBorder(rowIdx, 'E') }}>
          {prov.length > 0 ? (
            <select name="province" style={cSelect} value={row.province} onChange={hc} onFocus={fc('E', 'province')} title={row.province}>
              <option value="">— Select —</option>
              {prov.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <input name="province" style={cInput} placeholder="Province" value={row.province} onChange={hc} onFocus={fc('E', 'province')} onKeyDown={noEnter} title={row.province} />
          )}
        </td>

        {/* F: Division */}
        <td style={{ ...iCell, width: 180, ...activeBorder(rowIdx, 'F') }}>
          <input name="division" style={cInput} placeholder={isDeped ? "SDO Name *" : "SDO Name (Optional)"} value={row.division} onChange={hc} onFocus={fc('F', 'division')} onKeyDown={noEnter} title={row.division} />
        </td>

        {/* G: Municipality */}
        <td style={{ ...iCell, width: 180, ...activeBorder(rowIdx, 'G') }}>
          <input name="municipality" style={cInput} placeholder="Municipality" value={row.municipality} onChange={hc} onFocus={fc('G', 'municipality')} onKeyDown={noEnter} title={row.municipality} />
        </td>

        {/* H: School */}
        <td style={{ ...iCell, width: 240, ...activeBorder(rowIdx, 'H') }}>
          <input name="elementary_school" style={cInput} placeholder={isDeped ? "School name *" : "School name (Optional)"} value={row.elementary_school} onChange={hc} onFocus={fc('H', 'elementary_school')} onKeyDown={noEnter} title={row.elementary_school} />
        </td>

        {/* I-N: Calc */}
        {(['milk_packs','total_volume_requirements','raw_milk_liters','whole_milk_kg','skimmed_milk_kg','sugar'] as const).map(f => renderCalcCell(rowIdx, f))}

        {/* O: Feeding Days */}
        <td style={{ ...kCell, width: 118, ...activeBorder(rowIdx, 'O') }}>
          <select name="feeding_days" style={{ ...cSelect, fontWeight: 700, color: 'var(--navy)' }} value={row.feeding_days} onChange={hc} onFocus={fc('O', 'feeding_days')}>
            <option value="">— Select —</option>
            {FEEDING_DAYS_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </td>

        {/* P: Batch */}
        <td style={{ ...iCell, width: 100, ...activeBorder(rowIdx, 'P') }}>
          <select name="batch" style={cSelect} value={row.batch} onChange={hc} onFocus={fc('P', 'batch')}>
            <option value="">— Select —</option>
            {BATCH_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </td>

        {/* Q: Beneficiaries */}
        <td style={{ ...kCell, width: 120, ...activeBorder(rowIdx, 'Q') }}>
          <input type="number" name="beneficiaries" style={{ ...cInput, fontWeight: 700, color: 'var(--navy)', textAlign: 'right' }} placeholder="e.g. 42" min="1" value={row.beneficiaries} onChange={hc} onFocus={fc('Q', 'beneficiaries')} onKeyDown={noEnter} />
        </td>

        {/* R: Milk Type */}
        <td style={{ ...iCell, width: 150, ...activeBorder(rowIdx, 'R') }}>
          <select name="milk_type" style={cSelect} value={row.milk_type} onChange={hc} onFocus={fc('R', 'milk_type')} title={row.milk_type}>
            <option value="PM">PM – Pasteurized</option>
            <option value="SM">SM – Sterilized</option>
            <option value="SMP">SMP – Skim Powder</option>
            <option value="Karabao">Karabao</option>
          </select>
        </td>

        {/* S: Price */}
        <td style={{ ...kCell, width: 112, ...activeBorder(rowIdx, 'S') }}>
          <input type="number" name="price" style={{ ...cInput, fontWeight: 700, color: 'var(--navy)', textAlign: 'right' }} placeholder="0.00" step="0.01" min="0" value={row.price} onChange={hc} onFocus={fc('S', 'price')} onKeyDown={noEnter} />
        </td>

        {/* T: Supplier */}
        <td style={{ ...iCell, width: 600, ...activeBorder(rowIdx, 'T') }}>
          <select name="supplier_id" style={cSelect} value={row.supplier_id} onChange={hc} onFocus={fc('T', 'supplier_id')} title={row.supplier_id}>
            <option value="">— Select —</option>
            {cooperatives.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </td>

        {/* U: Milk Cost (calc) */}
        {renderCalcCell(rowIdx, 'milk_cost')}

        {/* V: Service Fee */}
        <td style={{ ...iCell, width: 128, ...activeBorder(rowIdx, 'V') }}>
          <input type="number" name="service_fee" style={{ ...cInput, textAlign: 'right' }} placeholder="0.00" step="0.01" min="0" value={row.service_fee} onChange={hc} onFocus={fc('V', 'service_fee')} onKeyDown={noEnter} />
        </td>

        {/* W: Total Funds (calc) */}
        {renderCalcCell(rowIdx, 'total_funds_transferred')}

        {/* X: Procurement */}
        <td style={{ ...iCell, width: 200, ...activeBorder(rowIdx, 'X') }}>
          <select name="mode_of_procurement" style={cSelect} value={row.mode_of_procurement} onChange={hc} onFocus={fc('X', 'mode_of_procurement')} title={row.mode_of_procurement}>
            <option value="">— Select —</option>
            {MODES_OF_PROCUREMENT.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </td>

        {/* Y-AC: Dates */}
        {(['moa_signing','fund_transfer','date_started','date_completed','liquidation'] as const).map((field, idx) => {
          const ltr = ['Y','Z','AA','AB','AC'][idx]
          return (
            <td key={field} style={{ ...iCell, width: 138, ...activeBorder(rowIdx, ltr) }}>
              <input type="date" name={field} style={{ ...cInput, cursor: 'pointer', fontSize: '0.79rem' }} value={row[field]} onChange={hc} onFocus={fc(ltr, field)} onKeyDown={noEnter} />
            </td>
          )
        })}
      </tr>
    )
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h1 className="page-title">Edit Record</h1>
          <p className="page-subtitle">
            Fill all columns per row simultaneously ·
            <span style={{ color: '#d97706' }}> Yellow</span> = auto-calculated (click to edit formula) ·
            <span style={{ color: '#ea580c' }}> Orange M</span> = manual override (per column) ·
            New row added when 2+ cells filled
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {formulasSaved && <span style={{ fontSize: '0.78rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={13} /> Formulas saved</span>}
          <button type="button" onClick={() => router.back()} className="btn btn-outline"><X size={16} /> Cancel</button>
          <button form="xls-form" type="submit" className="btn btn-gold" disabled={loading} style={{ padding: '0.55rem 1.5rem' }}>
            <Save size={16} />
            {loading ? 'Saving...' : validRowCount > 0 ? `Save ${validRowCount} Record${validRowCount !== 1 ? 's' : ''}` : 'Save Records'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fee2e2', color: '#b91c1c', padding: '0.6rem 1rem', borderRadius: 8, marginBottom: '0.75rem', fontSize: '0.875rem' }}>
          <AlertCircle size={15} /> {error}
          <button type="button" onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* Spreadsheet */}
      <form id="xls-form" onSubmit={handleSubmit}>
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', whiteSpace: 'nowrap' }}>
              <thead>
                {/* Column letters */}
                <tr>
                  <th style={{ ...lTh, ...sRn, zIndex: 14 }} />
                  <th style={{ ...lTh, ...sA,  zIndex: 14 }}>A</th>
                  <th style={{ ...lTh, ...sB,  zIndex: 14 }}>B</th>
                  <th style={{ ...lTh, ...sC,  zIndex: 14 }}>C</th>
                  <th style={{ ...lTh, ...sD,  zIndex: 14, borderRight: dividerBorder }}>D</th>
                  <th style={{ ...lTh, width: 180, minWidth: 180 }}>E</th>
                  <th style={{ ...lTh, width: 180, minWidth: 180 }}>F</th>
                  <th style={{ ...lTh, width: 180, minWidth: 180 }}>G</th>
                  <th style={{ ...lTh, width: 240, minWidth: 240 }}>H</th>
                  <th style={{ ...cTh, width: 115, minWidth: 115 }}>I</th>
                  <th style={{ ...cTh, width: 130, minWidth: 130 }}>J</th>
                  <th style={{ ...cTh, width: 125, minWidth: 125 }}>K</th>
                  <th style={{ ...cTh, width: 128, minWidth: 128 }}>L</th>
                  <th style={{ ...cTh, width: 128, minWidth: 128 }}>M</th>
                  <th style={{ ...cTh, width: 115, minWidth: 115 }}>N</th>
                  <th style={{ ...lTh, width: 118, minWidth: 118 }}>O</th>
                  <th style={{ ...lTh, width: 100, minWidth: 100 }}>P</th>
                  <th style={{ ...lTh, width: 120, minWidth: 120 }}>Q</th>
                  <th style={{ ...lTh, width: 150, minWidth: 150 }}>R</th>
                  <th style={{ ...lTh, width: 112, minWidth: 112 }}>S</th>
                  <th style={{ ...lTh, width: 600, minWidth: 600 }}>T</th>
                  <th style={{ ...cTh, width: 132, minWidth: 132 }}>U</th>
                  <th style={{ ...lTh, width: 128, minWidth: 128 }}>V</th>
                  <th style={{ ...cTh, width: 140, minWidth: 140 }}>W</th>
                  <th style={{ ...lTh, width: 200, minWidth: 200 }}>X</th>
                  <th style={{ ...lTh, width: 138, minWidth: 138 }}>Y</th>
                  <th style={{ ...lTh, width: 138, minWidth: 138 }}>Z</th>
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>AA</th>
                  <th style={{ ...lTh, width: 140, minWidth: 140 }}>AB</th>
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>AC</th>
                </tr>
                {/* Column names */}
                <tr>
                  <td style={{ ...rnTd, ...sRn, zIndex: 14, height: 36 }} />
                  <td style={{ ...nTd, ...sA, zIndex: 14 }}>Year</td>
                  <td style={{ ...nTd, ...sB, zIndex: 14 }}>Funded By</td>
                  <td style={{ ...nTd, ...sC, zIndex: 14 }}>Region</td>
                  <td style={{ ...nTd, ...sD, zIndex: 14, borderRight: dividerBorder }}>Center</td>
                  <td style={nTd}>Province</td>
                  <td style={nTd}>Division / SDO</td>
                  <td style={nTd}>Municipality</td>
                  <td style={nTd}>Elementary School</td>
                  {renderFormulaHeader('Milk Packs', 'milk_packs', '= Q × O')}
                  {renderFormulaHeader('Total Vol. Req (L)', 'total_volume_requirements', '= I ×', 'total_volume_factor')}
                  {renderFormulaHeader('Raw Milk (L)', 'raw_milk_liters', '= J ×', 'raw_milk_factor')}
                  {renderFormulaHeader('Whole Milk (kg)', 'whole_milk_kg', '= K ×', 'whole_milk_factor')}
                  {renderFormulaHeader('Skimmed Milk (kg)', 'skimmed_milk_kg', '= K ×', 'skim_milk_factor')}
                  {renderFormulaHeader('Sugar (kg)', 'sugar', '= J ×', 'sugar_factor')}
                  <td style={{ ...nTd, fontWeight: 700 }}>Feeding Days *</td>
                  <td style={nTd}>Batch</td>
                  <td style={{ ...nTd, fontWeight: 700 }}>Beneficiaries *</td>
                  <td style={nTd}>Milk Type</td>
                  <td style={{ ...nTd, fontWeight: 700 }}>Price ₱ *</td>
                  <td style={nTd}>Supplier / Cooperative</td>
                  {renderFormulaHeader('Milk Cost ₱', 'milk_cost', '= I × S')}
                  <td style={nTd}>Service Fee ₱</td>
                  {renderFormulaHeader('Total Funds ₱', 'total_funds_transferred', '= U + V')}
                  <td style={nTd}>Procurement Mode</td>
                  <td style={nTd}>MOA Signing</td>
                  <td style={nTd}>Fund Transfer</td>
                  <td style={nTd}>Date Started</td>
                  <td style={nTd}>Date Completed</td>
                  <td style={nTd}>Liquidation</td>
                </tr>
              </thead>
              <tbody>
                {rows.map((_, i) => renderDataRow(i))}
              </tbody>
            </table>
          </div>

          {/* Bottom legend */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.72rem', color: '#64748b', gap: '1rem', flexWrap: 'wrap' as const }}>
            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' as const }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 11, height: 11, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 2, display: 'inline-block' }} /> Key inputs (Q, O, S)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 11, height: 11, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 2, display: 'inline-block' }} /> Auto-calculated — click to edit formula (applies to whole column)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 11, height: 11, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 2, display: 'inline-block' }} /><span style={{ fontSize: '0.58rem', background: '#f97316', color: 'white', borderRadius: 2, padding: '0 2px', fontWeight: 700 }}>M</span> Manual (formula off for column)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 11, height: 11, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 2, display: 'inline-block' }} /> Custom factor (modified)</span>
            </div>
            <span style={{ fontWeight: 600, color: '#475569', flexShrink: 0 }}>{rows.length} rows · {validRowCount} ready to save</span>
          </div>
        </div>
      </form>
    </div>
  )
}
