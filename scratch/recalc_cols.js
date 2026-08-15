const fs = require('fs');

const cols = [
  // { name: 'Year', key: 'year' }, // Removed
  { name: 'Funded By', key: 'funded_by' },
  { name: 'Region', key: 'region' },
  // { name: 'Center', key: 'center' }, // Removed
  { name: 'Province', key: 'province' },
  { name: 'Division / SDO', key: 'division' },
  { name: 'Municipality', key: 'municipality' },
  { name: 'Elementary School', key: 'elementary_school' },
  { name: 'Milk Packs', key: 'milk_packs', calc: true },
  { name: 'Total Vol. Req (L)', key: 'total_volume_requirements', calc: true },
  { name: 'Raw Milk (L)', key: 'raw_milk_liters', calc: true },
  { name: 'Whole Milk (kg)', key: 'whole_milk_kg', calc: true },
  { name: 'Skimmed Milk (kg)', key: 'skimmed_milk_kg', calc: true },
  { name: 'Sugar (kg)', key: 'sugar', calc: true },
  { name: 'Feeding Days *', key: 'feeding_days' },
  { name: 'Batch', key: 'batch' },
  { name: 'Beneficiaries *', key: 'beneficiaries' },
  { name: 'Milk Type', key: 'milk_type' },
  { name: 'Price ₱ *', key: 'price' },
  { name: 'Supplier / Cooperative', key: 'supplier_id' },
  { name: 'Milk Cost ₱', key: 'milk_cost', calc: true },
  { name: 'Service Fee ₱', key: 'service_fee' },
  { name: 'Total Funds ₱', key: 'total_funds_transferred', calc: true },
  { name: 'Procurement Mode', key: 'mode_of_procurement' },
  { name: 'MOA Signing', key: 'moa_signing' },
  { name: 'Fund Transfer', key: 'fund_transfer' },
  { name: 'Date Started', key: 'date_started' },
  { name: 'Date Completed', key: 'date_completed' },
  { name: 'Liquidation', key: 'liquidation' }
];

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
letters.push('AA', 'AB', 'AC', 'AD', 'AE'); // just in case

let map = {};
cols.forEach((col, idx) => {
  map[col.key] = letters[idx];
});

console.log('Mapping:');
console.log('Beneficiaries:', map['beneficiaries']);
console.log('Feeding Days:', map['feeding_days']);
console.log('Milk Packs:', map['milk_packs']);
console.log('Price:', map['price']);
console.log('Total Vol. Req:', map['total_volume_requirements']);
console.log('Raw Milk:', map['raw_milk_liters']);

// I will now generate the replace content for the files
