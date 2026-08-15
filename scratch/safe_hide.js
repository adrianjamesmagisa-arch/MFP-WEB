const fs = require('fs');

function safeHide(file) {
  let code = fs.readFileSync(file, 'utf8');

  // 1. Update CALC_DEFS
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
  const headerRegex = /<th style=\{\{ \.\.\.lTh, \.\.\.sA,  zIndex: 14 \}\}>A<\/th>[\s\S]*?<th style=\{\{ \.\.\.lTh, width: 135, minWidth: 135 \}\}>AC<\/th>/;
  const newHeader = `<th style={{ ...lTh, ...sA,  zIndex: 14 }}>X</th>
                  <th style={{ ...lTh, ...sB,  zIndex: 14 }}>A</th>
                  <th style={{ ...lTh, ...sC,  zIndex: 14, borderRight: dividerBorder }}>B</th>
                  <th style={{ ...lTh, ...sD,  zIndex: 14 }}>X</th>
                  <th style={{ ...lTh, width: 180, minWidth: 180 }}>C</th>
                  <th style={{ ...lTh, width: 180, minWidth: 180 }}>D</th>
                  <th style={{ ...lTh, width: 240, minWidth: 240 }}>E</th>
                  <th style={{ ...cTh, width: 115, minWidth: 115 }}>F</th>
                  <th style={{ ...cTh, width: 130, minWidth: 130 }}>G</th>
                  <th style={{ ...cTh, width: 125, minWidth: 125 }}>H</th>
                  <th style={{ ...cTh, width: 128, minWidth: 128 }}>I</th>
                  <th style={{ ...cTh, width: 128, minWidth: 128 }}>J</th>
                  <th style={{ ...cTh, width: 115, minWidth: 115 }}>K</th>
                  <th style={{ ...lTh, width: 118, minWidth: 118 }}>L</th>
                  <th style={{ ...lTh, width: 100, minWidth: 100 }}>M</th>
                  <th style={{ ...lTh, width: 120, minWidth: 120 }}>N</th>
                  <th style={{ ...lTh, width: 150, minWidth: 150 }}>O</th>
                  <th style={{ ...lTh, width: 112, minWidth: 112 }}>P</th>
                  <th style={{ ...lTh, width: 600, minWidth: 600 }}>Q</th>
                  <th style={{ ...cTh, width: 132, minWidth: 132 }}>R</th>
                  <th style={{ ...lTh, width: 128, minWidth: 128 }}>S</th>
                  <th style={{ ...cTh, width: 140, minWidth: 140 }}>T</th>
                  <th style={{ ...lTh, width: 200, minWidth: 200 }}>U</th>
                  <th style={{ ...lTh, width: 138, minWidth: 138 }}>V</th>
                  <th style={{ ...lTh, width: 138, minWidth: 138 }}>W</th>
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>X</th>
                  <th style={{ ...lTh, width: 140, minWidth: 140 }}>Y</th>
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>Z</th>`;
  code = code.replace(headerRegex, newHeader);

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
