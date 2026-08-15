const fs = require('fs');

function safeHide(file) {
  let code = fs.readFileSync(file, 'utf8');

  // 1. Update CALC_DEFS
  const oldCalcDefs = `const CALC_DEFS: Record<string, CalcDef> = {
  milk_packs:                { letter: 'I', label: 'Milk Packs',        formulaStr: '= Beneficiaries × Feeding Days' },
  total_volume_requirements: { letter: 'J', label: 'Total Vol. Req',    formulaKey: 'total_volume_factor', formulaStr: '= Milk Packs × [FACTOR]' },
  raw_milk_liters:           { letter: 'K', label: 'Raw Milk (L)',      formulaKey: 'raw_milk_factor',     formulaStr: '= Total Vol. Req × [FACTOR]' },
  whole_milk_kg:             { letter: 'L', label: 'Whole Milk (kg)',   formulaKey: 'whole_milk_factor',   formulaStr: '= Raw Milk × [FACTOR]' },
  skimmed_milk_kg:           { letter: 'M', label: 'Skimmed Milk (kg)', formulaKey: 'skim_milk_factor',    formulaStr: '= Raw Milk × [FACTOR]' },
  sugar:                     { letter: 'N', label: 'Sugar (kg)',         formulaKey: 'sugar_factor',       formulaStr: '= Total Vol. Req × [FACTOR]' },
  milk_cost:                 { letter: 'U', label: 'Milk Cost',          formulaStr: '= Milk Packs × Price', currency: true },
  total_funds_transferred:   { letter: 'W', label: 'Total Funds',       formulaStr: '= Milk Cost + Service Fee', currency: true },
}`;

  const newCalcDefs = `const CALC_DEFS: Record<string, CalcDef> = {
  milk_packs:                { letter: 'G', label: 'Milk Packs',        formulaStr: '= O × M' },
  total_volume_requirements: { letter: 'H', label: 'Total Vol. Req',    formulaKey: 'total_volume_factor', formulaStr: '= G × [FACTOR]' },
  raw_milk_liters:           { letter: 'I', label: 'Raw Milk (L)',      formulaKey: 'raw_milk_factor',     formulaStr: '= H × [FACTOR]' },
  whole_milk_kg:             { letter: 'J', label: 'Whole Milk (kg)',   formulaKey: 'whole_milk_factor',   formulaStr: '= I × [FACTOR]' },
  skimmed_milk_kg:           { letter: 'K', label: 'Skimmed Milk (kg)', formulaKey: 'skim_milk_factor',    formulaStr: '= I × [FACTOR]' },
  sugar:                     { letter: 'L', label: 'Sugar (kg)',         formulaKey: 'sugar_factor',       formulaStr: '= H × [FACTOR]' },
  milk_cost:                 { letter: 'S', label: 'Milk Cost',          formulaStr: '= G × Q', currency: true },
  total_funds_transferred:   { letter: 'U', label: 'Total Funds',       formulaStr: '= S + T', currency: true },
}`;

  code = code.replace(oldCalcDefs, newCalcDefs);

  // 2. Update STICKY to hide sA and sD
  const oldSticky = `const sRn: React.CSSProperties = { position: 'sticky', left: 0,   zIndex: 6, width: 36,  minWidth: 36,  maxWidth: 36 }
const sA:  React.CSSProperties = { position: 'sticky', left: 36,  zIndex: 6, width: 85,  minWidth: 85,  maxWidth: 85 }
const sB:  React.CSSProperties = { position: 'sticky', left: 121, zIndex: 6, width: 135, minWidth: 135, maxWidth: 135 }
const sC:  React.CSSProperties = { position: 'sticky', left: 256, zIndex: 6, width: 110, minWidth: 110, maxWidth: 110 }
const sD:  React.CSSProperties = { position: 'sticky', left: 366, zIndex: 6, width: 160, minWidth: 160, maxWidth: 160, boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }`;

  const newSticky = `const sRn: React.CSSProperties = { position: 'sticky', left: 0,   zIndex: 6, width: 36,  minWidth: 36,  maxWidth: 36 }
const sA:  React.CSSProperties = { display: 'none' }
const sB:  React.CSSProperties = { position: 'sticky', left: 36, zIndex: 6, width: 135, minWidth: 135, maxWidth: 135 }
const sC:  React.CSSProperties = { position: 'sticky', left: 171, zIndex: 6, width: 110, minWidth: 110, maxWidth: 110, boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }
const sD:  React.CSSProperties = { display: 'none' }`;
  code = code.replace(oldSticky, newSticky);

  // 3. Update the letters in the header
  const oldHeader = `<th style={{ ...lTh, ...sA,  zIndex: 14 }}>A</th>
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
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>AC</th>`;

  const newHeader = `<th style={{ ...lTh, ...sA,  zIndex: 14 }}>X</th>
                  <th style={{ ...lTh, ...sB,  zIndex: 14 }}>A</th>
                  <th style={{ ...lTh, ...sC,  zIndex: 14, borderRight: dividerBorder }}>B</th>
                  <th style={{ ...lTh, ...sD,  zIndex: 14 }}>X</th>
                  <th style={{ ...lTh, width: 180, minWidth: 180 }}>C</th>
                  <th style={{ ...lTh, width: 180, minWidth: 180 }}>D</th>
                  <th style={{ ...lTh, width: 180, minWidth: 180 }}>E</th>
                  <th style={{ ...lTh, width: 240, minWidth: 240 }}>F</th>
                  <th style={{ ...cTh, width: 115, minWidth: 115 }}>G</th>
                  <th style={{ ...cTh, width: 130, minWidth: 130 }}>H</th>
                  <th style={{ ...cTh, width: 125, minWidth: 125 }}>I</th>
                  <th style={{ ...cTh, width: 128, minWidth: 128 }}>J</th>
                  <th style={{ ...cTh, width: 128, minWidth: 128 }}>K</th>
                  <th style={{ ...cTh, width: 115, minWidth: 115 }}>L</th>
                  <th style={{ ...lTh, width: 118, minWidth: 118 }}>M</th>
                  <th style={{ ...lTh, width: 100, minWidth: 100 }}>N</th>
                  <th style={{ ...lTh, width: 120, minWidth: 120 }}>O</th>
                  <th style={{ ...lTh, width: 150, minWidth: 150 }}>P</th>
                  <th style={{ ...lTh, width: 112, minWidth: 112 }}>Q</th>
                  <th style={{ ...lTh, width: 600, minWidth: 600 }}>R</th>
                  <th style={{ ...cTh, width: 132, minWidth: 132 }}>S</th>
                  <th style={{ ...lTh, width: 128, minWidth: 128 }}>T</th>
                  <th style={{ ...cTh, width: 140, minWidth: 140 }}>U</th>
                  <th style={{ ...lTh, width: 200, minWidth: 200 }}>V</th>
                  <th style={{ ...lTh, width: 138, minWidth: 138 }}>W</th>
                  <th style={{ ...lTh, width: 138, minWidth: 138 }}>X</th>
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>Y</th>
                  <th style={{ ...lTh, width: 140, minWidth: 140 }}>Z</th>
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>AA</th>`;
  code = code.replace(oldHeader, newHeader);

  // 4. Update the renderFormulaHeader labels
  const rf = [
    [/\{renderFormulaHeader\('Milk Packs', 'milk_packs', '.*?\'\)\}/g, "{renderFormulaHeader('Milk Packs', 'milk_packs', '= O × M')}"],
    [/\{renderFormulaHeader\('Total Vol\. Req \(L\)', 'total_volume_requirements', '.*?×', 'total_volume_factor'\)\}/g, "{renderFormulaHeader('Total Vol. Req (L)', 'total_volume_requirements', '= G ×', 'total_volume_factor')}"],
    [/\{renderFormulaHeader\('Raw Milk \(L\)', 'raw_milk_liters', '.*?×', 'raw_milk_factor'\)\}/g, "{renderFormulaHeader('Raw Milk (L)', 'raw_milk_liters', '= H ×', 'raw_milk_factor')}"],
    [/\{renderFormulaHeader\('Whole Milk \(kg\)', 'whole_milk_kg', '.*?×', 'whole_milk_factor'\)\}/g, "{renderFormulaHeader('Whole Milk (kg)', 'whole_milk_kg', '= I ×', 'whole_milk_factor')}"],
    [/\{renderFormulaHeader\('Skimmed Milk \(kg\)', 'skimmed_milk_kg', '.*?×', 'skim_milk_factor'\)\}/g, "{renderFormulaHeader('Skimmed Milk (kg)', 'skimmed_milk_kg', '= I ×', 'skim_milk_factor')}"],
    [/\{renderFormulaHeader\('Sugar \(kg\)', 'sugar', '.*?×', 'sugar_factor'\)\}/g, "{renderFormulaHeader('Sugar (kg)', 'sugar', '= H ×', 'sugar_factor')}"],
    [/\{renderFormulaHeader\('Milk Cost ₱', 'milk_cost', '.*?'\)\}/g, "{renderFormulaHeader('Milk Cost ₱', 'milk_cost', '= G × Q')}"],
    [/\{renderFormulaHeader\('Total Funds ₱', 'total_funds_transferred', '.*?'\)\}/g, "{renderFormulaHeader('Total Funds ₱', 'total_funds_transferred', '= S + T')}"]
  ];
  for (const [r, p] of rf) { code = code.replace(r, p); }

  fs.writeFileSync(file, code);
}

safeHide('src/app/(app)/data/new/page.tsx');
safeHide('src/app/(app)/data/bulk-edit/page.tsx');
console.log('done safeHide');
