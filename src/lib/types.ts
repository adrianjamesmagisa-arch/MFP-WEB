export type FundedBy = 'DepEd' | 'DSWD' | 'LDS'
export type MilkType = 'PM' | 'SMP' | 'SM' | 'Karabao'
export type UserRole = 'super_admin' | 'encoder' | 'viewer'

export interface MfpRecord {
  id: string
  year: number
  funded_by: FundedBy
  region: string
  center: string
  province: string
  division: string
  municipality: string
  elementary_school: string
  milk_packs: number
  total_volume_requirements: number
  raw_milk_liters: number
  whole_milk_kg: number
  skimmed_milk_kg: number
  sugar: number
  feeding_days: number
  batch: string
  beneficiaries: number
  milk_type: MilkType
  price: number
  supplier_id: string
  milk_cost: number
  service_fee: number
  total_funds_transferred: number
  mode_of_procurement: string
  moa_signing: string | null
  fund_transfer: string | null
  date_started: string | null
  date_completed: string | null
  liquidation: string | null
  target_milk_packs_to_deliver: number
  total_milk_packs_delivered: number
  /** Linked SBFP drop-off school row when masterlist was synced from SBFP. */
  source_dropoff_id?: string | null
  created_by: string
  created_at: string
  updated_at: string
  cooperatives?: Cooperative
}

export interface SbfpDropoffPoint {
  id: string
  year: number
  center: string
  sbfp_data_id: string | null
  sdo: string
  dropoff_name: string
  beneficiaries: number
  /** Encoder-entered feeding days → milk packs = beneficiaries × days. */
  feeding_days?: number | null
  district: string | null
  municipality: string | null
  province: string | null
  region: string | null
  remarks: string | null
  include_in_masterlist: boolean
  created_at: string
  updated_at: string
}

export type ProcurementStatus = 'For Preparation' | 'Ongoing (For Award)' | 'Awarded (For Delivery)' | 'Awarded (Ongoing Delivery)' | 'Ongoing' | 'Completed' | 'Not Started'

export interface SbfpRecord {
  id: string
  year: number
  region: string
  sdo: string
  procurement_status: ProcurementStatus
  packs_to_deliver: number
  milk_type: string
  delivery_schedule: string
  packs_delivered: number
  /** Packs delivered per calendar month (increment, not running total). Keys "1".."12". */
  monthly_packs_delivered?: Record<string, number>
  /** Raw milk price ₱/L per calendar month. Keys "1".."12". */
  raw_milk_prices?: Record<string, number>
  /** Cumulative “Delivered as of” snapshots. Encoder-chosen dates. */
  delivery_snapshots?: Array<{ date?: string; packs?: number | null }>
  /** Active month key for Raw ₱/L / Income on this SDO. "8".."12". */
  raw_milk_month?: string | null
  center: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface SbfpMonitoringRecord {
  id: string
  year: number
  center: string
  sdo: string
  status: string
  target_packs: number
  del_aug18: number
  del_aug31: number
  del_sep30: number
  del_oct31: number
  latest_delivered: number
  accomplishment_pct: number
  amount: number
  mode_of_procurement: string | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface Cooperative {
  id: string
  name: string
  short_name: string
  region: string
  is_active: boolean
  created_at: string
}

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  center: string
  email: string
  created_at: string
}

export const PCC_CENTERS = [
  'MMSU', 'CSU', 'CMU', 'DMMMSU', 'LCSF',
  'CLSU', 'MLPC', 'UPLB', 'USF', 'USM',
  'VSU', 'WVSU', 'NHQGP (NIZ)'
]

export const REGIONS = [
  'CAR', 'I', 'II', 'III', 'IVA', 'IVB', 'V',
  'NCR', 'VI', 'VII', 'NIR', 'VIII', 'IX', 'X',
  'XI', 'XII', 'CARAGA', 'BARMM'
]

export const MODES_OF_PROCUREMENT = [
  'Bayanihan Act', 'NP-CP', 'NP-SS', 'NP-EC',
  'NP-EC/NP-CP', 'NP-CP/SVP', 'NP-Sagip Saka'
]
