const fs = require('fs');

function rewriteBody(file) {
  let code = fs.readFileSync(file, 'utf8');
  
  // 1. Remove Year cell
  // new/page.tsx:
  let yearChunk = `        {/* A: Year */}
        <td style={{ ...iCell, ...sA, ...activeBorder(rowIdx, 'A') }}>
          <select name="year" style={cSelect} value={row.year} onChange={hc} onFocus={fc('A', 'year')}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </td>

        {/* B: Funded By */}
        <td style={{ ...iCell, ...sB, ...activeBorder(rowIdx, 'B') }}>
          <select name="funded_by" style={cSelect}`;
  let yearChunkRepl = `        {/* A: Funded By */}
        <td style={{ ...iCell, ...sA, ...activeBorder(rowIdx, 'A') }}>
          <select name="funded_by" style={cSelect}`;
  code = code.replace(yearChunk, yearChunkRepl);

  // bulk-edit/page.tsx:
  let beYearChunk = `        {/* A: Year */}
        <td style={{ ...iCell, ...sA, ...activeBorder(rowIdx, 'A') }}>
          <select className="nodrag" style={cSelect} value={row.year} onChange={hc} onFocus={fc('A', 'year')}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </td>

        {/* B: Funded By */}
        <td style={{ ...iCell, ...sB, ...activeBorder(rowIdx, 'B') }}>
          <select className="nodrag" style={cSelect}`;
  let beYearChunkRepl = `        {/* A: Funded By */}
        <td style={{ ...iCell, ...sA, ...activeBorder(rowIdx, 'A') }}>
          <select className="nodrag" style={cSelect}`;
  code = code.replace(beYearChunk, beYearChunkRepl);

  // 2. Change Region to B
  code = code.replace(`        {/* C: Region */}
        <td style={{ ...iCell, ...sC, ...activeBorder(rowIdx, 'C') }}>`, `        {/* B: Region */}
        <td style={{ ...iCell, ...sB, ...activeBorder(rowIdx, 'B') }}>`);

  // 3. Remove Center cell, shift Province to C
  let centerChunk = `        {/* D: Center */}
        <td style={{ ...iCell, ...sD, borderRight: dividerBorder, background: (!isSuperAdmin && !!profile?.center) ? '#f1f5f9' : 'white', ...activeBorder(rowIdx, 'D') }}>
          <select name="center" style={cSelect} value={row.center} onChange={hc} onFocus={fc('D', 'center')} disabled={!isSuperAdmin && !!profile?.center}>
            <option value="">— Select —</option>
            {PCC_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </td>

        {/* E: Province */}
        <td style={{ ...iCell, width: 180, ...activeBorder(rowIdx, 'E') }}>`;
  let centerChunkRepl = `        {/* C: Province */}
        <td style={{ ...iCell, ...sC, borderRight: dividerBorder, ...activeBorder(rowIdx, 'C') }}>`;
  code = code.replace(centerChunk, centerChunkRepl);

  let beCenterChunk = `        {/* D: Center */}
        <td style={{ ...iCell, ...sD, borderRight: dividerBorder, background: (!isSuperAdmin && !!profile?.center) ? '#f1f5f9' : 'white', ...activeBorder(rowIdx, 'D') }}>
          <select className="nodrag" name="center" style={cSelect} value={row.center} onChange={hc} onFocus={fc('D', 'center')} disabled={!isSuperAdmin && !!profile?.center}>
            <option value="">— Select —</option>
            {PCC_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </td>

        {/* E: Province */}
        <td style={{ ...iCell, width: 180, ...activeBorder(rowIdx, 'E') }}>`;
  let beCenterChunkRepl = `        {/* C: Province */}
        <td style={{ ...iCell, ...sC, borderRight: dividerBorder, ...activeBorder(rowIdx, 'C') }}>`;
  code = code.replace(beCenterChunk, beCenterChunkRepl);

  // Now we need to shift all the remaining columns (F->D, G->E, H->F, I..N->G..L, O->M, P->N, Q->O, R->P, S->Q, T->R, U->S, V->T, W->U, X->V, Y..AC->W..AA)
  // Let's just do a series of exact replacements for the comments and fc/activeBorder calls
  const shifts = [
    ['F', 'D', 'Division'],
    ['G', 'E', 'Municipality'],
    ['H', 'F', 'School'],
    ['O', 'M', 'Feeding Days'],
    ['P', 'N', 'Batch'],
    ['Q', 'O', 'Beneficiaries'],
    ['R', 'P', 'Milk Type'],
    ['S', 'Q', 'Price'],
    ['T', 'R', 'Supplier'],
    ['V', 'T', 'Service Fee'],
    ['X', 'V', 'Procurement']
  ];
  for (let [oldL, newL, label] of shifts) {
    code = code.replace(
      new RegExp(`\\{/\\* ${oldL}: ${label} \\*/\\}\\s*<td style=\\{\\{ (\\.\\.\\.iCell|\\.\\.\\.kCell), width: \\d+, \\.\\.\\.activeBorder\\(rowIdx, '${oldL}'\\) \\}\\}>`, 'g'),
      (match, cellStyle) => match.replace(`${oldL}: ${label}`, `${newL}: ${label}`).replace(`activeBorder(rowIdx, '${oldL}')`, `activeBorder(rowIdx, '${newL}')`)
    );
  }

  // Replace fc calls
  const fcShifts = [
    ['B', 'funded_by'], ['C', 'region'], ['E', 'province'], // Before shift
    ['F', 'division'], ['G', 'municipality'], ['H', 'elementary_school'],
    ['O', 'feeding_days'], ['P', 'batch'], ['Q', 'beneficiaries'],
    ['R', 'milk_type'], ['S', 'price'], ['T', 'supplier_id'],
    ['V', 'service_fee'], ['X', 'mode_of_procurement']
  ];
  const newFcMap = {
    'funded_by': 'A', 'region': 'B', 'province': 'C',
    'division': 'D', 'municipality': 'E', 'elementary_school': 'F',
    'feeding_days': 'M', 'batch': 'N', 'beneficiaries': 'O',
    'milk_type': 'P', 'price': 'Q', 'supplier_id': 'R',
    'service_fee': 'T', 'mode_of_procurement': 'V'
  };
  for (let [oldL, field] of fcShifts) {
    code = code.replace(new RegExp(`fc\\('${oldL}', '${field}'\\)`, 'g'), `fc('${newFcMap[field]}', '${field}')`);
  }

  // Update Calc Cell comments
  code = code.replace('{/* I-N: Calc */}', '{/* G-L: Calc */}');
  code = code.replace('{/* U: Milk Cost (calc) */}', '{/* S: Milk Cost (calc) */}');
  code = code.replace('{/* W: Total Funds (calc) */}', '{/* U: Total Funds (calc) */}');
  code = code.replace('{/* Y-AC: Dates */}', '{/* W-AA: Dates */}');
  code = code.replace(`fc('Y', 'moa_signing')`, `fc('W', 'moa_signing')`);
  code = code.replace(`fc('Z', 'fund_transfer')`, `fc('X', 'fund_transfer')`);
  code = code.replace(`fc('AA', 'date_started')`, `fc('Y', 'date_started')`);
  code = code.replace(`fc('AB', 'date_completed')`, `fc('Z', 'date_completed')`);
  code = code.replace(`fc('AC', 'liquidation')`, `fc('AA', 'liquidation')`);
  
  // Date borders
  code = code.replace(`activeBorder(rowIdx, 'Y')`, `activeBorder(rowIdx, 'W')`);
  code = code.replace(`activeBorder(rowIdx, 'Z')`, `activeBorder(rowIdx, 'X')`);
  code = code.replace(`activeBorder(rowIdx, 'AA')`, `activeBorder(rowIdx, 'Y')`);
  code = code.replace(`activeBorder(rowIdx, 'AB')`, `activeBorder(rowIdx, 'Z')`);
  code = code.replace(`activeBorder(rowIdx, 'AC')`, `activeBorder(rowIdx, 'AA')`);

  fs.writeFileSync(file, code);
}

rewriteBody('src/app/(app)/data/new/page.tsx');
rewriteBody('src/app/(app)/data/bulk-edit/page.tsx');
console.log('done body rewrite');
