import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import xlsx from 'xlsx'

// Use the Service Role Key so it bypasses RLS policies for bulk insert
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function parseNumber(val, isInteger = false) {
  if (!val) return 0
  if (typeof val === 'number') return isInteger ? Math.round(val) : val
  const parsed = parseFloat(val.toString().replace(/,/g, '').trim())
  if (isNaN(parsed)) return 0
  return isInteger ? Math.round(parsed) : parsed
}

function parseDate(val) {
  if (!val) return null
  // xlsx returns Excel serial numbers for dates in CSV (e.g. 44096 for Sep 22, 2020)
  if (typeof val === 'number') {
    // Excel epoch starts Jan 1 1900; JS epoch starts Jan 1 1970 (25569 days apart)
    const jsDate = new Date((val - 25569) * 86400 * 1000)
    if (isNaN(jsDate.getTime())) return null
    return jsDate.toISOString().split('T')[0]
  }
  // If xlsx returns an actual JS Date object (when cellDates: true)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    return val.toISOString().split('T')[0]
  }
  // Plain string like "September 22, 2020"
  const date = new Date(val)
  if (isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

async function main() {
  console.log("Loading CSV file...")
  const filePath = 'C:/PCC/Data processing/csv data/DA-PCC National Milk Feeding Program - MFP Data.csv'
  
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath)
    process.exit(1)
  }

  // cellDates: true → xlsx returns JS Date objects instead of serial numbers
  const workbook = xlsx.readFile(filePath, { cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName])

  
  console.log(`Parsed ${data.length} rows.`)

  // Step 1: Extract unique suppliers
  console.log("Extracting and inserting cooperatives/suppliers...")
  const supplierNames = new Set(data.map(row => row['Supplier']).filter(Boolean))
  
  const supplierMap = {} // name -> id
  
  // Insert or get suppliers
  for (const name of Array.from(supplierNames)) {
    // Check if exists
    let { data: existing } = await supabase.from('cooperatives').select('id, name').eq('name', name).single()
    
    if (!existing) {
      const { data: newCoop, error } = await supabase.from('cooperatives').insert({ name }).select('id, name').single()
      if (error) {
        console.error("Error creating cooperative:", name, error.message)
        continue
      }
      existing = newCoop
    }
    supplierMap[name] = existing.id
  }
  
  console.log(`Linked ${Object.keys(supplierMap).length} cooperatives.`)

  // Step 2: Prepare MFP data
  console.log("Cleaning up previous partial import...")
  await supabase.from('mfp_data').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const mfpRecords = data.map((row) => {
    let fundedBy = row['Funded By']
    if (fundedBy === 'DepEd-SBFP') fundedBy = 'DepEd' // Normalize based on ENUM
    if (fundedBy === 'DSWD-SFP') fundedBy = 'DSWD'
    if (fundedBy === 'LGU') fundedBy = 'LDS' // LGU maps to Local Funds

    let milkType = row['Milk Type']
    if (milkType === 'P. Milk') milkType = 'PM' // normalize
    if (milkType === 'KARABUN') milkType = 'Karabao'

    return {
      year: parseNumber(row['Year'], true),
      funded_by: fundedBy,
      region: row['Region']?.toString() || null,
      center: row['Center']?.toString() || null,
      province: row['Province']?.toString() || null,
      division: row['Division']?.toString() || null,
      municipality: row['Municipality']?.toString() || null,
      elementary_school: row['Elementary School']?.toString() || null,
      
      milk_packs: parseNumber(row['Milk Packs'], true),
      total_volume_requirements: parseNumber(row['Total Volume Requirements ']), 
      raw_milk_liters: parseNumber(row['Raw Milk Used in Liters']),
      whole_milk_kg: parseNumber(row['Whole Milk (kg)']),
      skimmed_milk_kg: parseNumber(row['Skimmed Milk (kg)']),
      sugar: parseNumber(row['Sugar']),
      
      feeding_days: parseNumber(row['Feeding Days'], true),
      batch: row['Batch']?.toString() || null,
      beneficiaries: parseNumber(row['Beneficiaries'], true),
      milk_type: milkType || null,
      price: parseNumber(row['Price']),
      
      supplier_id: row['Supplier'] ? supplierMap[row['Supplier']] : null,
      
      milk_cost: parseNumber(row['Milk Cost']),
      service_fee: parseNumber(row['Service Fee/ Admin Cost']),
      total_funds_transferred: parseNumber(row['Total Funds Transferred']),
      
      mode_of_procurement: row['Mode of Procurement']?.toString() || null,
      
      moa_signing: parseDate(row['MOA Signing']),
      fund_transfer: parseDate(row['Fund Transfer']),
      date_started: parseDate(row['Date Started']),
      date_completed: parseDate(row['Date Completed']),
      liquidation: parseDate(row['Liquidation']),
    }
  })

  // Step 3: Insert in chunks (batching for performance)
  console.log("Inserting data into Supabase (in chunks of 100)...")
  
  const chunkSize = 100
  let inserted = 0
  
  for (let i = 0; i < mfpRecords.length; i += chunkSize) {
    const chunk = mfpRecords.slice(i, i + chunkSize)
    const { error } = await supabase.from('mfp_data').insert(chunk)
    
    if (error) {
      console.error(`Error inserting chunk ${i} - ${i + chunk.length}:`, error.message)
      // We don't abort, just log and continue to save as much as possible
    } else {
      inserted += chunk.length
      process.stdout.write(`\rInserted ${inserted}/${mfpRecords.length} records...`)
    }
  }

  console.log("\nDone! Data migration complete.")
}

main().catch(console.error)
