'use client'

import { Download } from 'lucide-react'

const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: 'year', label: 'Year' },
  { key: 'funded_by', label: 'Funded By' },
  { key: 'region', label: 'Region' },
  { key: 'center', label: 'Center' },
  { key: 'province', label: 'Province' },
  { key: 'division', label: 'Division' },
  { key: 'municipality', label: 'Municipality' },
  { key: 'elementary_school', label: 'Elementary School' },
  { key: 'milk_packs', label: 'Milk Packs' },
  { key: 'total_volume_requirements', label: 'Total Vol. Req (L)' },
  { key: 'raw_milk_liters', label: 'Raw Milk (L)' },
  { key: 'whole_milk_kg', label: 'Whole Milk (kg)' },
  { key: 'skimmed_milk_kg', label: 'Skimmed Milk (kg)' },
  { key: 'sugar', label: 'Sugar (kg)' },
  { key: 'feeding_days', label: 'Feeding Days' },
  { key: 'batch', label: 'Batch' },
  { key: 'beneficiaries', label: 'Beneficiaries' },
  { key: 'milk_type', label: 'Milk Type' },
  { key: 'price', label: 'Price' },
  { key: 'milk_cost', label: 'Milk Cost' },
  { key: 'service_fee', label: 'Service Fee' },
  { key: 'total_funds_transferred', label: 'Total Funds' },
  { key: 'mode_of_procurement', label: 'Mode of Procurement' },
  { key: 'moa_signing', label: 'MOA Signing' },
  { key: 'fund_transfer', label: 'Fund Transfer' },
  { key: 'date_started', label: 'Date Started' },
  { key: 'date_completed', label: 'Date Completed' },
  { key: 'liquidation', label: 'Liquidation' },
  { key: 'target_milk_packs_to_deliver', label: 'Target Milk Packs' },
  { key: 'total_milk_packs_delivered', label: 'Milk Packs Delivered' },
  { key: 'supplier_name', label: 'Supplier' },
]

function cellValue(row: Record<string, unknown>, key: string): string {
  if (key === 'supplier_name') {
    const coop = row.cooperatives as { name?: string } | null | undefined
    const name = coop?.name || row.supplier_id
    return name == null ? '' : String(name)
  }
  const v = row[key]
  if (v == null) return ''
  return String(v)
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function ExportMfpCsvButton({
  records,
  centerLabel,
  yearLabel,
}: {
  records: Record<string, unknown>[]
  centerLabel?: string | null
  yearLabel?: string | number | null
}) {
  const onExport = () => {
    if (!records.length) {
      alert('No records to export for the current filters.')
      return
    }

    const header = EXPORT_COLUMNS.map(c => escapeCsv(c.label)).join(',')
    const lines = records.map(row =>
      EXPORT_COLUMNS.map(c => escapeCsv(cellValue(row, c.key))).join(','),
    )
    const csv = '\uFEFF' + [header, ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dateStr = new Date().toISOString().slice(0, 10)
    const centerPart = centerLabel ? `_${String(centerLabel).replace(/[^\w.-]+/g, '_')}` : ''
    const yearPart = yearLabel != null && yearLabel !== '' ? `_Y${yearLabel}` : ''
    a.href = url
    a.download = `mfp_data${centerPart}${yearPart}_${dateStr}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <button type="button" className="btn btn-gold" onClick={onExport} disabled={!records.length}>
      <Download size={16} /> Export as .CSV
    </button>
  )
}
