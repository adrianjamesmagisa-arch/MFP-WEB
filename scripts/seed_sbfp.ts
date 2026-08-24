import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';
import * as path from 'path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(path.resolve(__dirname, '../'));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FILE = 'c:\\PCC\\SIDEBARS\\sbfp\\SBFP FY 2026_Monitoring.xlsx';

// Map Excel date serial numbers to ISO date strings
function excelDateToISO(serial: any): string | null {
  if (!serial || typeof serial !== 'number') return null;
  const date = xlsx.SSF.parse_date_code(serial);
  if (!date) return null;
  return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
}

const CENTER_SHEETS: Record<string, string> = {
  'UPLB': 'UPLB', 'DMMMSU': 'DMMMSU', 'CSU': 'CSU', 'MMSU': 'MMSU',
  'CLSU': 'CLSU', 'LCSF': 'LCSF', 'WVSU': 'WVSU', 'USF': 'USF',
  'VSU': 'VSU', 'MLPC': 'MLPC', 'CMU': 'CMU', 'USM': 'USM'
};

async function seedSummary(wb: xlsx.WorkBook) {
  console.log('\n=== Seeding sbfp_summary ===');
  const sheet = wb.Sheets['SUMMARY TARGET MILK PROD'];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || row[0] === 'Total') continue;
    records.push({
      year: 2026,
      center: row[0],
      jan_dec_target_milk_volume: row[1] || 0,
      target_milk_packs: row[2] || 0,
      equivalent_volume: row[3] || 0,
      shortage_surplus: row[4] || 0,
      pct_covered: row[5] || 0,
      jul_dec_projected_volume: row[6] || 0,
      milk_packs_can_produce: row[7] || 0,
      shortage_surplus_packs: row[8] || 0,
    });
  }
  console.log(`Found ${records.length} summary rows`);
  const { error } = await supabase.from('sbfp_summary').upsert(records, { onConflict: 'year,center' });
  if (error) console.error('Error:', error.message);
  else console.log('✓ sbfp_summary seeded');
}

async function seedBudget(wb: xlsx.WorkBook) {
  console.log('\n=== Seeding sbfp_budget ===');
  const sheet = wb.Sheets['BUDGET BREAKDOWN'];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || row[0] === 'TOTAL') continue;
    records.push({
      year: 2026,
      center: row[0],
      milk_supplies: row[1] || 0,
      office_professional: row[2] || 0,
      traveling_expenses: row[3] || 0,
      office_supplies: row[4] || 0,
      training_expenses: row[5] || 0,
      furniture_fixtures: row[6] || 0,
      total: row[7] || 0,
    });
  }
  console.log(`Found ${records.length} budget rows`);
  const { error } = await supabase.from('sbfp_budget').upsert(records, { onConflict: 'year,center' });
  if (error) console.error('Error:', error.message);
  else console.log('✓ sbfp_budget seeded');
}

async function seedActivities(wb: xlsx.WorkBook) {
  console.log('\n=== Seeding sbfp_activities ===');
  const sheet = wb.Sheets['STATUS OF ACTIVITIES'];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // Delete old records first
  await supabase.from('sbfp_activities').delete().eq('year', 2026);

  const records = [];
  let order = 0;
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const remarks = typeof row[2] === 'number' ? excelDateToISO(row[2]) : row[2];
    records.push({
      year: 2026,
      activity: row[0],
      status: row[1] || 'Not Started',
      remarks: remarks || null,
      sort_order: order++,
    });
  }
  console.log(`Found ${records.length} activity rows`);
  const { error } = await supabase.from('sbfp_activities').insert(records);
  if (error) console.error('Error:', error.message);
  else console.log('✓ sbfp_activities seeded');
}

async function seedCenterData(wb: xlsx.WorkBook) {
  console.log('\n=== Seeding sbfp_data (center sheets) ===');

  // Clear existing data first
  await supabase.from('sbfp_data').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const allRecords: any[] = [];

  // Process each center sheet
  for (const [sheetName, centerCode] of Object.entries(CENTER_SHEETS)) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) { console.log(`  ⚠ Sheet ${sheetName} not found, skipping`); continue; }

    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    // Find header row (contains 'STATUS')
    let headerRow = -1;
    for (let i = 0; i < Math.min(15, data.length); i++) {
      if (data[i][0] === 'STATUS') { headerRow = i; break; }
    }
    if (headerRow === -1) { console.log(`  ⚠ No header in ${sheetName}`); continue; }

    // Detect snapshot column headers (cols 15+)
    const headerCols = data[headerRow] as string[];
    const snapshots: Array<{ colIndex: number; label: string }> = [];
    for (let c = 15; c < headerCols.length; c++) {
      if (headerCols[c] && String(headerCols[c]).includes('Packs Delivered as of')) {
        snapshots.push({ colIndex: c, label: String(headerCols[c]).replace('Total no. of Packs Delivered as of ', '').trim() });
      }
    }

    let count = 0;
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] || !row[1]) continue;
      const status = String(row[0]).trim();
      const sdo = String(row[1]).trim();
      if (!status || !sdo) continue;

      // Build delivery snapshots
      const deliverySnapshots = snapshots.map(s => ({
        date: s.label,
        packs: Number(row[s.colIndex]) || 0
      })).filter(s => s.packs > 0);

      const record: any = {
        year: 2026,
        center: centerCode,
        region: '', // Will need to map from OVERALL
        sdo,
        procurement_status: status,
        amount: Number(row[2]) || 0,
        mode_of_procurement: row[3] || null,
        pr_date_received: excelDateToISO(row[4]),
        pr_number: row[5] ? String(row[5]) : null,
        ors_date: excelDateToISO(row[6]),
        po_number: row[7] ? String(row[7]) : null,
        remarks: row[8] || null,
        batch: row[9] ? String(row[9]) : null,
        beneficiaries_pm: Number(row[10]) || 0,
        contract_amount: Number(row[11]) || 0,
        delivery_start: excelDateToISO(row[12]) || (typeof row[12] === 'string' ? null : null),
        delivery_end: excelDateToISO(row[13]),
        packs_to_deliver: Number(row[14]) || 0,
        packs_delivered: deliverySnapshots.length > 0 ? deliverySnapshots[deliverySnapshots.length - 1].packs : 0,
        delivery_snapshots: deliverySnapshots,
        milk_type: 'Pasteurized',
        delivery_schedule: typeof row[12] === 'string' ? row[12] : null,
      };

      // Try to infer region from SDO name
      record.region = '';

      allRecords.push(record);
      count++;
    }
    console.log(`  ${sheetName}: ${count} rows`);
  }

  // Also process NHQ sheet
  const nhqSheet = wb.Sheets['NHQ PROCUREMENT ACTIVITIES'];
  if (nhqSheet) {
    const data = xlsx.utils.sheet_to_json(nhqSheet, { header: 1 }) as any[][];
    let headerRow = -1;
    for (let i = 0; i < 15; i++) {
      if (data[i] && data[i][0] === 'STATUS') { headerRow = i; break; }
    }
    if (headerRow !== -1) {
      let count = 0;
      for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0] || !row[1]) continue;
        const snapshots: any[] = [];
        for (let c = 14; c <= 17; c++) {
          if (Number(row[c]) > 0) {
            snapshots.push({ date: `Col${c}`, packs: Number(row[c]) });
          }
        }
        allRecords.push({
          year: 2026,
          center: 'NHQ',
          region: '',
          sdo: String(row[1]).trim(),
          procurement_status: String(row[0]).trim(),
          amount: Number(row[2]) || 0,
          mode_of_procurement: row[3] || null,
          pr_date_received: excelDateToISO(row[4]),
          pr_number: row[5] ? String(row[5]) : null,
          po_number: row[6] ? String(row[6]) : null,
          remarks: row[7] || null,
          batch: row[8] ? String(row[8]) : null,
          beneficiaries_pm: Number(row[9]) || 0,
          contract_amount: Number(row[10]) || 0,
          packs_to_deliver: Number(row[13]) || 0,
          packs_delivered: snapshots.length > 0 ? snapshots[snapshots.length - 1].packs : 0,
          delivery_snapshots: snapshots,
          milk_type: 'Pasteurized',
          delivery_schedule: null,
        });
        count++;
      }
      console.log(`  NHQ: ${count} rows`);
    }
  }

  // Now map regions from OVERALL sheet
  const overallSheet = wb.Sheets['OVERALL'];
  const overallData = xlsx.utils.sheet_to_json(overallSheet, { header: 1 }) as any[][];
  const regionMap: Record<string, string> = {};
  for (let i = 2; i < overallData.length; i++) {
    const row = overallData[i];
    if (row[1] && row[2]) {
      regionMap[String(row[2]).toLowerCase().trim()] = String(row[1]).trim();
    }
  }

  // Apply region from map
  for (const rec of allRecords) {
    const sdoKey = rec.sdo.toLowerCase().replace(/ -(pm|sm|smp|cm)$/i, '').trim();
    rec.region = regionMap[sdoKey] || regionMap[rec.sdo.toLowerCase().trim()] || '';
  }

  console.log(`\nTotal records to insert: ${allRecords.length}`);

  // Insert in batches
  const BATCH = 100;
  for (let i = 0; i < allRecords.length; i += BATCH) {
    const batch = allRecords.slice(i, i + BATCH);
    const { error } = await supabase.from('sbfp_data').insert(batch);
    if (error) console.error(`Batch ${i}-${i+BATCH} error:`, error.message);
    else process.stdout.write('.');
  }
  console.log('\n✓ sbfp_data seeded');
}

async function main() {
  console.log('Reading Excel file:', FILE);
  const wb = xlsx.readFile(FILE);

  await seedSummary(wb);
  await seedBudget(wb);
  await seedActivities(wb);
  await seedCenterData(wb);

  console.log('\n✅ All done!');
}

main().catch(console.error);
