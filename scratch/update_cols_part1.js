const fs = require('fs');

function processFile(file) {
  let code = fs.readFileSync(file, 'utf8');

  // Update CALC_DEFS
  code = code.replace(
    /const CALC_DEFS: Record<string, CalcDef> = \{[\s\S]*?\}/,
    `const CALC_DEFS: Record<string, CalcDef> = {
  milk_packs:                { letter: 'G', label: 'Milk Packs',        formulaStr: '= O × M' },
  total_volume_requirements: { letter: 'H', label: 'Total Vol. Req',    formulaKey: 'total_volume_factor', formulaStr: '= G × [FACTOR]' },
  raw_milk_liters:           { letter: 'I', label: 'Raw Milk (L)',      formulaKey: 'raw_milk_factor',     formulaStr: '= H × [FACTOR]' },
  whole_milk_kg:             { letter: 'J', label: 'Whole Milk (kg)',   formulaKey: 'whole_milk_factor',   formulaStr: '= I × [FACTOR]' },
  skimmed_milk_kg:           { letter: 'K', label: 'Skimmed Milk (kg)', formulaKey: 'skim_milk_factor',    formulaStr: '= I × [FACTOR]' },
  sugar:                     { letter: 'L', label: 'Sugar (kg)',         formulaKey: 'sugar_factor',       formulaStr: '= H × [FACTOR]' },
  milk_cost:                 { letter: 'S', label: 'Milk Cost',          formulaStr: '= G × Q', currency: true },
  total_funds_transferred:   { letter: 'U', label: 'Total Funds',       formulaStr: '= S + T', currency: true },
}`
  );

  // Update sticky definitions
  // Original: sA: Year, sB: Funded By, sC: Region, sD: Center
  // New: sA: Funded By, sB: Region, sC: Province
  const oldSticky = /const sRn:[\s\S]*?const dividerBorder = '2px solid #94a3b8'/;
  const newSticky = `const sRn: React.CSSProperties = { position: 'sticky', left: 0,   zIndex: 6, width: 36,  minWidth: 36,  maxWidth: 36 }
const sA:  React.CSSProperties = { position: 'sticky', left: 36,  zIndex: 6, width: 135, minWidth: 135, maxWidth: 135 }
const sB:  React.CSSProperties = { position: 'sticky', left: 171, zIndex: 6, width: 110, minWidth: 110, maxWidth: 110 }
const sC:  React.CSSProperties = { position: 'sticky', left: 281, zIndex: 6, width: 160, minWidth: 160, maxWidth: 160, boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }
const dividerBorder = '2px solid #94a3b8'`;
  code = code.replace(oldSticky, newSticky);

  // Update renderFormulaHeader calls in thead
  const renderFormulaChanges = [
    [/\{renderFormulaHeader\('Milk Packs', 'milk_packs', '.*?\'\)\}/g, "{renderFormulaHeader('Milk Packs', 'milk_packs', '= O × M')}"],
    [/\{renderFormulaHeader\('Total Vol\. Req \(L\)', 'total_volume_requirements', '.*?×', 'total_volume_factor'\)\}/g, "{renderFormulaHeader('Total Vol. Req (L)', 'total_volume_requirements', '= G ×', 'total_volume_factor')}"],
    [/\{renderFormulaHeader\('Raw Milk \(L\)', 'raw_milk_liters', '.*?×', 'raw_milk_factor'\)\}/g, "{renderFormulaHeader('Raw Milk (L)', 'raw_milk_liters', '= H ×', 'raw_milk_factor')}"],
    [/\{renderFormulaHeader\('Whole Milk \(kg\)', 'whole_milk_kg', '.*?×', 'whole_milk_factor'\)\}/g, "{renderFormulaHeader('Whole Milk (kg)', 'whole_milk_kg', '= I ×', 'whole_milk_factor')}"],
    [/\{renderFormulaHeader\('Skimmed Milk \(kg\)', 'skimmed_milk_kg', '.*?×', 'skim_milk_factor'\)\}/g, "{renderFormulaHeader('Skimmed Milk (kg)', 'skimmed_milk_kg', '= I ×', 'skim_milk_factor')}"],
    [/\{renderFormulaHeader\('Sugar \(kg\)', 'sugar', '.*?×', 'sugar_factor'\)\}/g, "{renderFormulaHeader('Sugar (kg)', 'sugar', '= H ×', 'sugar_factor')}"],
    [/\{renderFormulaHeader\('Milk Cost ₱', 'milk_cost', '.*?'\)\}/g, "{renderFormulaHeader('Milk Cost ₱', 'milk_cost', '= G × Q')}"],
    [/\{renderFormulaHeader\('Total Funds ₱', 'total_funds_transferred', '.*?'\)\}/g, "{renderFormulaHeader('Total Funds ₱', 'total_funds_transferred', '= S + T')}"]
  ];
  for (const [regex, rep] of renderFormulaChanges) {
    code = code.replace(regex, rep);
  }

  // Rewrite the entire table structure to drop Year and Center!
  // I will just use regex to remove Year and Center th/td from thead and tbody.
  
  // Actually, rewriting the whole header block and body block with a script is complex and risky with regex.
  // Let me replace it manually with replace_file_content or multi_replace.
  
  fs.writeFileSync(file + '.part1.js', code);
}

processFile('src/app/(app)/data/new/page.tsx');
processFile('src/app/(app)/data/bulk-edit/page.tsx');
console.log('done part 1');
