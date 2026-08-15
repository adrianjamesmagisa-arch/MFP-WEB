const fs = require('fs');

function addStickiesToNew() {
  const file = 'src/app/(app)/data/new/page.tsx';
  let code = fs.readFileSync(file, 'utf8');

  // 1. Add definitions for sE, sF, sG, sH after sD
  const sDDef = "const sD:  React.CSSProperties = { display: 'none' }";
  const newStickies = `
const sE:  React.CSSProperties = { position: 'sticky', left: 281, zIndex: 6, width: 180, minWidth: 180, maxWidth: 180 }
const sF:  React.CSSProperties = { position: 'sticky', left: 461, zIndex: 6, width: 180, minWidth: 180, maxWidth: 180 }
const sG:  React.CSSProperties = { position: 'sticky', left: 641, zIndex: 6, width: 180, minWidth: 180, maxWidth: 180 }
const sH:  React.CSSProperties = { position: 'sticky', left: 821, zIndex: 6, width: 240, minWidth: 240, maxWidth: 240, boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }`;

  if (!code.includes('const sE:')) {
    code = code.replace(sDDef, sDDef + newStickies);
  }

  // 2. Remove the dividerBorder from sC header and put it on sH
  // Actually, wait, sC is no longer the last sticky one.
  // We need to carefully replace the header elements for C, D, E, F
  
  // Header replacements
  code = code.replace(
    /<th style=\{\{ \.\.\.lTh, \.\.\.sC,  zIndex: 14, borderRight: dividerBorder \}\}>B<\/th>/,
    `<th style={{ ...lTh, ...sC,  zIndex: 14 }}>B</th>`
  );
  code = code.replace(
    /<th style=\{\{ \.\.\.lTh, width: 180, minWidth: 180 \}\}>C<\/th>/,
    `<th style={{ ...lTh, ...sE, zIndex: 14 }}>C</th>`
  );
  code = code.replace(
    /<th style=\{\{ \.\.\.lTh, width: 180, minWidth: 180 \}\}>D<\/th>/,
    `<th style={{ ...lTh, ...sF, zIndex: 14 }}>D</th>`
  );
  code = code.replace(
    /<th style=\{\{ \.\.\.lTh, width: 180, minWidth: 180 \}\}>E<\/th>/,
    `<th style={{ ...lTh, ...sG, zIndex: 14 }}>E</th>`
  );
  code = code.replace(
    /<th style=\{\{ \.\.\.lTh, width: 240, minWidth: 240 \}\}>F<\/th>/,
    `<th style={{ ...lTh, ...sH, zIndex: 14, borderRight: dividerBorder }}>F</th>`
  );

  // 3. Body replacements
  // Previously they were like:
  // <td style={iCell}><input ... value={r.province} /></td>
  // But wait, they might have `style={{...iCell}}` or `style={iCell}`. Let's use string replace on the row components.
  // Actually, wait, the user's `new/page.tsx` uses <select> and <input> for these.
  // C: Province (input)
  code = code.replace(
    /<td style=\{iCell\}>\s*<input[^>]+value=\{r\.province\}/,
    `<td style={{...iCell, ...sE}}>\n                      <input type="text" style={cInput} value={r.province}`
  );
  // D: Division (input)
  code = code.replace(
    /<td style=\{iCell\}>\s*<input[^>]+value=\{r\.division\}/,
    `<td style={{...iCell, ...sF}}>\n                      <input type="text" style={cInput} value={r.division}`
  );
  // E: Municipality (input)
  code = code.replace(
    /<td style=\{iCell\}>\s*<input[^>]+value=\{r\.municipality\}/,
    `<td style={{...iCell, ...sG}}>\n                      <input type="text" style={cInput} value={r.municipality}`
  );
  // F: Elementary School (input)
  // And it needs borderRight
  code = code.replace(
    /<td style=\{iCell\}>\s*<input[^>]+value=\{r\.elementary_school\}/,
    `<td style={{...iCell, ...sH, borderRight: dividerBorder}}>\n                      <input type="text" style={cInput} value={r.elementary_school}`
  );

  // We also need to remove borderRight from Region (sC) in the body
  code = code.replace(
    /<td style=\{\{ \.\.\.iCell, \.\.\.sC, borderRight: dividerBorder \}\}>/,
    `<td style={{ ...iCell, ...sC }}>`
  );

  fs.writeFileSync(file, code);
}

addStickiesToNew();
console.log('done addStickiesToNew');
