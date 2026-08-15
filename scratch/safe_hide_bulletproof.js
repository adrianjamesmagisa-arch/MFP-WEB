const fs = require('fs');

function fixPage(file, isBulk) {
  let code = fs.readFileSync(file, 'utf8');
  // normalize CRLF to LF just in case
  code = code.replace(/\r\n/g, '\n');

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

  if (code.includes(oldCalcDefs)) {
    code = code.replace(oldCalcDefs, newCalcDefs);
  } else {
    console.log("oldCalcDefs not found in " + file);
  }

  // 2. Hide sA and sD
  let sARegex = /const sA:\s*React\.CSSProperties = \{[^}]+\}/;
  let sDRegex = /const sD:\s*React\.CSSProperties = \{[^}]+\}/;
  code = code.replace(sARegex, "const sA:  React.CSSProperties = { display: 'none' }");
  code = code.replace(sDRegex, "const sD:  React.CSSProperties = { display: 'none' }");

  // 3. Shift the left offsets of sticky columns
  // For new/page.tsx: sB (was 121, now 36), sC (was 256, now 171)
  // For bulk-edit/page.tsx: sB (was 66, now 36), sC (was 151, now 121), sE...
  if (isBulk) {
    // We must shift EVERYTHING after A by -30 (since A is 30px width).
    // And shift EVERYTHING after D by -60 (since D is 60px width, total -90).
    // Wait, let's just parse the widths and recalculate the left offsets!
    const widths = {
      sRn: 36, sA: 30, sB: 85, sC: 135, sD: 60, sE: 110, sF: 110, sG: 110, sH: 140
    };
    const visible = ['sRn', 'sB', 'sC', 'sE', 'sF', 'sG', 'sH'];
    let currentLeft = 0;
    for (const key of visible) {
      if (key !== 'sRn') {
        const regex = new RegExp(`const ${key}:\\\\s*React\\\\.CSSProperties = \\\\{ position: 'sticky', left: \\\\d+`);
        code = code.replace(regex, `const ${key}:  React.CSSProperties = { position: 'sticky', left: ${currentLeft}`);
      }
      currentLeft += widths[key];
    }
    // Also remove right border from sH, put it on sC (since D is hidden, C is the last before non-sticky? No, E,F,G,H are sticky too!)
    // Wait, in bulk-edit, H has borderRight: dividerBorder. That's fine, H is still visible.
  } else {
    // new/page.tsx
    code = code.replace(/const sB:\s*React\.CSSProperties = \{ position: 'sticky', left: 121/, "const sB:  React.CSSProperties = { position: 'sticky', left: 36");
    code = code.replace(/const sC:\s*React\.CSSProperties = \{ position: 'sticky', left: 256/, "const sC:  React.CSSProperties = { position: 'sticky', left: 171");
    // borderRight is already handled in the styles for sC
    // Wait, in new/page.tsx, C doesn't have borderRight in its CSS, it's added in the <th> element inline.
    // D had borderRight in the <th> inline. We need to move it to C.
    code = code.replace(/<th style=\{\{ \.\.\.lTh, \.\.\.sC,  zIndex: 14 \}\}>C<\/th>/, `<th style={{ ...lTh, ...sC,  zIndex: 14, borderRight: dividerBorder }}>C</th>`);
    code = code.replace(/<th style=\{\{ \.\.\.lTh, \.\.\.sD,  zIndex: 14, borderRight: dividerBorder \}\}>D<\/th>/, `<th style={{ ...lTh, ...sD,  zIndex: 14 }}>D</th>`);
  }

  // 4. Sequentially rewrite the letters in the header
  const theadStart = code.indexOf('<thead>');
  const theadEnd = code.indexOf('</thead>');
  if (theadStart !== -1 && theadEnd !== -1) {
    let thead = code.substring(theadStart, theadEnd);
    let letterIndex = 0;
    
    thead = thead.replace(/<th(.*?)>([A-Z]+)<\/th>/g, (match, attrs, letter) => {
      if (attrs.includes('sA') || attrs.includes('sD')) {
        return `<th${attrs}>X</th>`; // We hide these, so letter doesn't matter
      } else {
        // Generate sequential letter (A, B, C... Z, AA, AB, AC)
        let currentLetter = '';
        let n = letterIndex;
        while (n >= 0) {
          currentLetter = String.fromCharCode((n % 26) + 65) + currentLetter;
          n = Math.floor(n / 26) - 1;
        }
        letterIndex++;
        return `<th${attrs}>${currentLetter}</th>`;
      }
    });

    code = code.substring(0, theadStart) + thead + code.substring(theadEnd);
  }

  // 5. Update the renderFormulaHeader labels
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

fixPage('src/app/(app)/data/new/page.tsx', false);
fixPage('src/app/(app)/data/bulk-edit/page.tsx', true);
console.log('done safeHide');
