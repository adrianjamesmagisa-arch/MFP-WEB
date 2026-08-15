const fs = require('fs');

function processFile(file) {
  let lines = fs.readFileSync(file, 'utf8').split('\n');
  let newLines = [];
  let i = 0;
  
  while (i < lines.length) {
    let line = lines[i];

    // 1. UPDATE CALC_DEFS
    if (line.includes(`milk_packs:                { letter: 'I', label: 'Milk Packs',        formulaStr: '= Beneficiaries × Feeding Days' }`)) {
      newLines.push(`  milk_packs:                { letter: 'G', label: 'Milk Packs',        formulaStr: '= O × M' },`); i++; continue;
    }
    if (line.includes(`total_volume_requirements: { letter: 'J', label: 'Total Vol. Req',    formulaKey: 'total_volume_factor', formulaStr: '= Milk Packs × [FACTOR]' }`)) {
      newLines.push(`  total_volume_requirements: { letter: 'H', label: 'Total Vol. Req',    formulaKey: 'total_volume_factor', formulaStr: '= G × [FACTOR]' },`); i++; continue;
    }
    if (line.includes(`raw_milk_liters:           { letter: 'K', label: 'Raw Milk (L)',      formulaKey: 'raw_milk_factor',     formulaStr: '= Total Vol. Req × [FACTOR]' }`)) {
      newLines.push(`  raw_milk_liters:           { letter: 'I', label: 'Raw Milk (L)',      formulaKey: 'raw_milk_factor',     formulaStr: '= H × [FACTOR]' },`); i++; continue;
    }
    if (line.includes(`whole_milk_kg:             { letter: 'L', label: 'Whole Milk (kg)',   formulaKey: 'whole_milk_factor',   formulaStr: '= Raw Milk × [FACTOR]' }`)) {
      newLines.push(`  whole_milk_kg:             { letter: 'J', label: 'Whole Milk (kg)',   formulaKey: 'whole_milk_factor',   formulaStr: '= I × [FACTOR]' },`); i++; continue;
    }
    if (line.includes(`skimmed_milk_kg:           { letter: 'M', label: 'Skimmed Milk (kg)', formulaKey: 'skim_milk_factor',    formulaStr: '= Raw Milk × [FACTOR]' }`)) {
      newLines.push(`  skimmed_milk_kg:           { letter: 'K', label: 'Skimmed Milk (kg)', formulaKey: 'skim_milk_factor',    formulaStr: '= I × [FACTOR]' },`); i++; continue;
    }
    if (line.includes(`sugar:                     { letter: 'N', label: 'Sugar (kg)',         formulaKey: 'sugar_factor',       formulaStr: '= Total Vol. Req × [FACTOR]' }`)) {
      newLines.push(`  sugar:                     { letter: 'L', label: 'Sugar (kg)',         formulaKey: 'sugar_factor',       formulaStr: '= H × [FACTOR]' },`); i++; continue;
    }
    if (line.includes(`milk_cost:                 { letter: 'U', label: 'Milk Cost',          formulaStr: '= Milk Packs × Price', currency: true }`)) {
      newLines.push(`  milk_cost:                 { letter: 'S', label: 'Milk Cost',          formulaStr: '= G × Q', currency: true },`); i++; continue;
    }
    if (line.includes(`total_funds_transferred:   { letter: 'W', label: 'Total Funds',       formulaStr: '= Milk Cost + Service Fee', currency: true }`)) {
      newLines.push(`  total_funds_transferred:   { letter: 'U', label: 'Total Funds',       formulaStr: '= S + T', currency: true },`); i++; continue;
    }

    // 2. UPDATE STICKY
    if (line.includes(`const sA:  React.CSSProperties = { position: 'sticky', left: 36,  zIndex: 6, width: 85,  minWidth: 85,  maxWidth: 85 }`)) {
      newLines.push(`const sA:  React.CSSProperties = { position: 'sticky', left: 36,  zIndex: 6, width: 135, minWidth: 135, maxWidth: 135 }`); i++; continue;
    }
    if (line.includes(`const sB:  React.CSSProperties = { position: 'sticky', left: 121, zIndex: 6, width: 135, minWidth: 135, maxWidth: 135 }`)) {
      newLines.push(`const sB:  React.CSSProperties = { position: 'sticky', left: 171, zIndex: 6, width: 110, minWidth: 110, maxWidth: 110 }`); i++; continue;
    }
    if (line.includes(`const sC:  React.CSSProperties = { position: 'sticky', left: 256, zIndex: 6, width: 110, minWidth: 110, maxWidth: 110 }`)) {
      newLines.push(`const sC:  React.CSSProperties = { position: 'sticky', left: 281, zIndex: 6, width: 160, minWidth: 160, maxWidth: 160, boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }`); i++; continue;
    }
    if (line.includes(`const sD:  React.CSSProperties = { position: 'sticky', left: 366, zIndex: 6, width: 160, minWidth: 160, maxWidth: 160, boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }`)) {
      i++; continue; // DROP sD completely!
    }

    // 3. THEAD
    if (line.includes(`<thead>`)) {
      newLines.push(`              <thead>
                {/* Column letters */}
                <tr>
                  <th style={{ ...lTh, ...sRn, zIndex: 14 }} />
                  <th style={{ ...lTh, ...sA,  zIndex: 14 }}>A</th>
                  <th style={{ ...lTh, ...sB,  zIndex: 14 }}>B</th>
                  <th style={{ ...lTh, ...sC,  zIndex: 14, borderRight: dividerBorder }}>C</th>
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
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>AA</th>
                </tr>
                {/* Column names */}
                <tr>
                  <td style={{ ...rnTd, ...sRn, zIndex: 14, height: 36 }} />
                  <td style={{ ...nTd, ...sA, zIndex: 14 }}>Funded By</td>
                  <td style={{ ...nTd, ...sB, zIndex: 14 }}>Region</td>
                  <td style={{ ...nTd, ...sC, zIndex: 14, borderRight: dividerBorder }}>Province</td>
                  <td style={nTd}>Division / SDO</td>
                  <td style={nTd}>Municipality</td>
                  <td style={nTd}>Elementary School</td>
                  {renderFormulaHeader('Milk Packs', 'milk_packs', '= O × M')}
                  {renderFormulaHeader('Total Vol. Req (L)', 'total_volume_requirements', '= G ×', 'total_volume_factor')}
                  {renderFormulaHeader('Raw Milk (L)', 'raw_milk_liters', '= H ×', 'raw_milk_factor')}
                  {renderFormulaHeader('Whole Milk (kg)', 'whole_milk_kg', '= I ×', 'whole_milk_factor')}
                  {renderFormulaHeader('Skimmed Milk (kg)', 'skimmed_milk_kg', '= I ×', 'skim_milk_factor')}
                  {renderFormulaHeader('Sugar (kg)', 'sugar', '= H ×', 'sugar_factor')}
                  <td style={{ ...nTd, fontWeight: 700 }}>Feeding Days *</td>
                  <td style={nTd}>Batch</td>
                  <td style={{ ...nTd, fontWeight: 700 }}>Beneficiaries *</td>
                  <td style={nTd}>Milk Type</td>
                  <td style={{ ...nTd, fontWeight: 700 }}>Price ₱ *</td>
                  <td style={nTd}>Supplier / Cooperative</td>
                  {renderFormulaHeader('Milk Cost ₱', 'milk_cost', '= G × Q')}
                  <td style={nTd}>Service Fee ₱</td>
                  {renderFormulaHeader('Total Funds ₱', 'total_funds_transferred', '= S + T')}
                  <td style={nTd}>Procurement Mode</td>
                  <td style={nTd}>MOA Signing</td>
                  <td style={nTd}>Fund Transfer</td>
                  <td style={nTd}>Date Started</td>
                  <td style={nTd}>Date Completed</td>
                  <td style={nTd}>Liquidation</td>
                </tr>
              </thead>`);
      
      while (!lines[i].includes(`</thead>`)) i++;
      i++; continue;
    }

    // 4. TBODY Year Block -> REMOVE
    if (line.includes(`{/* A: Year */}`)) {
      while (!lines[i].includes(`{/* B: Funded By */}`)) i++;
    }

    // 5. TBODY Funded By Block -> Make it A
    if (line.includes(`{/* B: Funded By */}`)) {
      newLines.push(`        {/* A: Funded By */}`); i++; continue;
    }
    if (line.includes(`activeBorder(rowIdx, 'B')`) && line.includes(`funded_by`)) {
      newLines.push(line.replace(`...sB`, `...sA`).replace(`'B'`, `'A'`)); i++; continue;
    }
    if (line.includes(`fc('B', 'funded_by')`)) {
      newLines.push(line.replace(`'B'`, `'A'`)); i++; continue;
    }

    // 6. TBODY Region Block -> Make it B
    if (line.includes(`{/* C: Region */}`)) {
      newLines.push(`        {/* B: Region */}`); i++; continue;
    }
    if (line.includes(`activeBorder(rowIdx, 'C')`) && line.includes(`region`)) {
      newLines.push(line.replace(`...sC`, `...sB`).replace(`'C'`, `'B'`)); i++; continue;
    }
    if (line.includes(`fc('C', 'region')`)) {
      newLines.push(line.replace(`'C'`, `'B'`)); i++; continue;
    }

    // 7. TBODY Center Block -> REMOVE
    if (line.includes(`{/* D: Center */}`)) {
      while (!lines[i].includes(`{/* E: Province */}`)) i++;
    }

    // 8. TBODY Province Block -> Make it C
    if (line.includes(`{/* E: Province */}`)) {
      newLines.push(`        {/* C: Province */}`); i++; continue;
    }
    if (line.includes(`activeBorder(rowIdx, 'E')`) && line.includes(`width: 180`)) {
      newLines.push(line.replace(`width: 180`, `...sC, borderRight: dividerBorder`).replace(`'E'`, `'C'`)); i++; continue;
    }
    if (line.includes(`fc('E', 'province')`)) {
      newLines.push(line.replace(`'E'`, `'C'`)); i++; continue;
    }

    // 9. Shifts
    const shiftMatches = [
      { oldL: 'F', newL: 'D', comment: 'Division' },
      { oldL: 'G', newL: 'E', comment: 'Municipality' },
      { oldL: 'H', newL: 'F', comment: 'School' },
      { oldL: 'O', newL: 'M', comment: 'Feeding Days' },
      { oldL: 'P', newL: 'N', comment: 'Batch' },
      { oldL: 'Q', newL: 'O', comment: 'Beneficiaries' },
      { oldL: 'R', newL: 'P', comment: 'Milk Type' },
      { oldL: 'S', newL: 'Q', comment: 'Price' },
      { oldL: 'T', newL: 'R', comment: 'Supplier' },
      { oldL: 'V', newL: 'T', comment: 'Service Fee' },
      { oldL: 'X', newL: 'V', comment: 'Procurement' },
    ];
    let matchedShift = false;
    for (const shift of shiftMatches) {
      if (line.includes(`{/* ${shift.oldL}: ${shift.comment} */}`)) {
        newLines.push(line.replace(`${shift.oldL}:`, `${shift.newL}:`)); matchedShift = true; break;
      }
      if (line.includes(`activeBorder(rowIdx, '${shift.oldL}')`)) {
        newLines.push(line.replace(`'${shift.oldL}'`, `'${shift.newL}'`)); matchedShift = true; break;
      }
      if (line.includes(`fc('${shift.oldL}'`)) {
        newLines.push(line.replace(`'${shift.oldL}'`, `'${shift.newL}'`)); matchedShift = true; break;
      }
    }
    if (matchedShift) { i++; continue; }

    // Calc comments
    if (line.includes(`{/* I-N: Calc */}`)) { newLines.push(`        {/* G-L: Calc */}`); i++; continue; }
    if (line.includes(`{/* U: Milk Cost (calc) */}`)) { newLines.push(`        {/* S: Milk Cost (calc) */}`); i++; continue; }
    if (line.includes(`{/* W: Total Funds (calc) */}`)) { newLines.push(`        {/* U: Total Funds (calc) */}`); i++; continue; }
    if (line.includes(`{/* Y-AC: Dates */}`)) { newLines.push(`        {/* W-AA: Dates */}`); i++; continue; }

    // Dates
    const datesShifts = [
      { oldL: 'Y', newL: 'W', field: 'moa_signing' },
      { oldL: 'Z', newL: 'X', field: 'fund_transfer' },
      { oldL: 'AA', newL: 'Y', field: 'date_started' },
      { oldL: 'AB', newL: 'Z', field: 'date_completed' },
      { oldL: 'AC', newL: 'AA', field: 'liquidation' }
    ];
    let matchedDate = false;
    for (const shift of datesShifts) {
      if (line.includes(`fc('${shift.oldL}'`)) {
        newLines.push(line.replace(`'${shift.oldL}'`, `'${shift.newL}'`)); matchedDate = true; break;
      }
      if (line.includes(`activeBorder(rowIdx, '${shift.oldL}')`)) {
        newLines.push(line.replace(`'${shift.oldL}'`, `'${shift.newL}'`)); matchedDate = true; break;
      }
    }
    if (matchedDate) { i++; continue; }

    newLines.push(line);
    i++;
  }

  fs.writeFileSync(file, newLines.join('\n'));
}

processFile('src/app/(app)/data/new/page.tsx');
processFile('src/app/(app)/data/bulk-edit/page.tsx');
console.log('done node rewrite 3.0');
