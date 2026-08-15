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
  created_by: string
  created_at: string
  updated_at: string
  cooperatives?: Cooperative
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
