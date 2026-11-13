/** Shared column IDs, labels and supported operations for table and server analysis. */
export const MFP_ANALYSIS_COLUMNS = [
  { id: 'funded_by', letter: 'B', label: 'Funded By', group: 'funded_by' },
  { id: 'region', letter: 'C', label: 'Region', group: 'region' },
  { id: 'center', letter: 'D', label: 'Center', group: 'center' },
  { id: 'province', letter: 'E', label: 'Province', group: 'province' },
  { id: 'division', letter: 'F', label: 'Division', group: 'division' },
  { id: 'municipality', letter: 'G', label: 'Municipality', group: 'municipality' },
  { id: 'elementary_school', letter: 'H', label: 'Participating Schools', metric: 'schools' },
  { id: 'milk_packs', letter: 'I', label: 'Milk Packs', metric: 'milk_packs' },
  { id: 'total_volume_requirements', letter: 'J', label: 'Total Volume Requirements (L)', metric: 'total_volume_requirements' },
  { id: 'raw_milk_liters', letter: 'K', label: 'Raw Milk (L)', metric: 'raw_milk_liters' },
  { id: 'whole_milk_kg', letter: 'L', label: 'Whole Milk (kg)', metric: 'whole_milk_kg' },
  { id: 'skimmed_milk_kg', letter: 'M', label: 'Skimmed Milk (kg)', metric: 'skimmed_milk_kg' },
  { id: 'sugar', letter: 'N', label: 'Sugar (kg)', metric: 'sugar' },
  { id: 'beneficiaries', letter: 'Q', label: 'Beneficiaries', metric: 'beneficiaries' },
  { id: 'milk_type', letter: 'R', label: 'Milk Type', group: 'milk_type' },
  { id: 'supplier_id', letter: 'T', label: 'Supplier', group: 'cooperative' },
  { id: 'milk_cost', letter: 'U', label: 'Milk Cost (PHP)', metric: 'milk_cost' },
  { id: 'service_fee', letter: 'V', label: 'Shipping / Service Fee (PHP)', metric: 'service_fee' },
  { id: 'total_funds_transferred', letter: 'W', label: 'Total Funds (PHP)', metric: 'total_funds_transferred' },
  { id: 'target_milk_packs_to_deliver', letter: 'AD', label: 'Associated Contract Target Packs', metric: 'target' },
  { id: 'total_milk_packs_delivered', letter: 'AE', label: 'Associated Contract Delivered Packs', metric: 'delivered' },
] as const

export type MfpAnalysisColumn = typeof MFP_ANALYSIS_COLUMNS[number]
export type MfpAnalysisColumnId = MfpAnalysisColumn['id']
export const ALL_MFP_ANALYSIS_COLUMNS = MFP_ANALYSIS_COLUMNS.map(column => column.id)
export function isMfpAnalysisColumnId(value: unknown): value is MfpAnalysisColumnId {
  return MFP_ANALYSIS_COLUMNS.some(column => column.id === value)
}
export function analysisColumnLabel(id: MfpAnalysisColumnId) {
  const column = MFP_ANALYSIS_COLUMNS.find(item => item.id === id)!
  return `${column.letter} — ${column.label}`
}
