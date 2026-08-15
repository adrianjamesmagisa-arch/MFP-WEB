const fs = require('fs');

let code = fs.readFileSync('src/app/(app)/data/bulk-edit/page.tsx', 'utf8');

// Replace the two separate fetching blocks with a Promise.all
// Old code:
//     supabase.from('mfp_data').select('*').in('id', ids).then(({ data, error }) => {
//       console.log("supabase returned:", data, error)
//       if (data && data.length > 0) {
// ...
//     })
//     supabase.from('cooperatives').select('id, name, short_name, region, is_active, created_at').order('name')
//       .then(({ data }) => setCoop(data ?? []))

const oldFetchBlock = `    supabase.from('mfp_data').select('*').in('id', ids).then(({ data, error }) => {
      console.log("supabase returned:", data, error)
      if (data && data.length > 0) {
        setRows(data.map(d => ({
          id: d.id,
          year: String(d.year || ''), funded_by: d.funded_by || '',
          region: d.region || '', center: d.center || '',
          province: d.province || '', division: d.division || '',
          municipality: d.municipality || '', elementary_school: d.elementary_school || '',
          feeding_days: String(d.feeding_days || ''), batch: d.batch || '',
          beneficiaries: String(d.beneficiaries || ''), milk_type: d.milk_type || '',
          price: d.price ? String(d.price) : '', supplier_id: d.supplier_id || '',
          milk_packs: String(d.milk_packs || ''), total_volume_requirements: String(d.total_volume_requirements || ''),
          raw_milk_liters: String(d.raw_milk_liters || ''), whole_milk_kg: String(d.whole_milk_kg || ''),
          skimmed_milk_kg: String(d.skimmed_milk_kg || ''), sugar: String(d.sugar || ''),
          milk_cost: d.milk_cost ? String(d.milk_cost) : '',
          service_fee: d.service_fee !== null ? String(d.service_fee) : '0',
          total_funds_transferred: d.total_funds_transferred ? String(d.total_funds_transferred) : '',
          mode_of_procurement: d.mode_of_procurement || '',
          moa_signing: d.moa_signing || '', fund_transfer: d.fund_transfer || '',
          date_started: d.date_started || '', date_completed: d.date_completed || '',
          liquidation: d.liquidation || ''
        })))
      }
    })
    supabase.from('cooperatives').select('id, name, short_name, region, is_active, created_at').order('name')
      .then(({ data }) => setCoop(data ?? []))`;

const newFetchBlock = `    Promise.all([
      supabase.from('mfp_data').select('*').in('id', ids),
      supabase.from('cooperatives').select('id, name, short_name, region, is_active, created_at').order('name')
    ]).then(([mfpRes, coopRes]) => {
      console.log("supabase returned:", mfpRes.data, mfpRes.error)
      const coops = coopRes.data ?? [];
      setCoop(coops);
      if (mfpRes.data && mfpRes.data.length > 0) {
        setRows(mfpRes.data.map(d => {
          const supplierName = coops.find(c => c.id === d.supplier_id)?.name || d.supplier_id || '';
          return {
            id: d.id,
            year: String(d.year || ''), funded_by: d.funded_by || '',
            region: d.region || '', center: d.center || '',
            province: d.province || '', division: d.division || '',
            municipality: d.municipality || '', elementary_school: d.elementary_school || '',
            feeding_days: String(d.feeding_days || ''), batch: d.batch || '',
            beneficiaries: String(d.beneficiaries || ''), milk_type: d.milk_type || '',
            price: d.price ? String(d.price) : '', supplier_id: supplierName,
            milk_packs: String(d.milk_packs || ''), total_volume_requirements: String(d.total_volume_requirements || ''),
            raw_milk_liters: String(d.raw_milk_liters || ''), whole_milk_kg: String(d.whole_milk_kg || ''),
            skimmed_milk_kg: String(d.skimmed_milk_kg || ''), sugar: String(d.sugar || ''),
            milk_cost: d.milk_cost ? String(d.milk_cost) : '',
            service_fee: d.service_fee !== null ? String(d.service_fee) : '0',
            total_funds_transferred: d.total_funds_transferred ? String(d.total_funds_transferred) : '',
            mode_of_procurement: d.mode_of_procurement || '',
            moa_signing: d.moa_signing || '', fund_transfer: d.fund_transfer || '',
            date_started: d.date_started || '', date_completed: d.date_completed || '',
            liquidation: d.liquidation || ''
          };
        }))
      }
    })`;

if (code.includes('supplier_id: d.supplier_id || \'\',')) {
    code = code.replace(oldFetchBlock, newFetchBlock);
    fs.writeFileSync('src/app/(app)/data/bulk-edit/page.tsx', code);
    console.log('done modifying bulk-edit/page.tsx');
} else {
    console.log('Did not find the expected block to replace in bulk-edit');
}
