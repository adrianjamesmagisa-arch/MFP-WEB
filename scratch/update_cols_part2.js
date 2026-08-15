const fs = require('fs');

function processPart2(filename) {
  let code = fs.readFileSync(filename + '.part1.js', 'utf8');

  // Replace the column letters row
  const lettersRegex = /<th style=\{\{ \.\.\.lTh, \.\.\.sA,  zIndex: 14 \}\}>A<\/th>[\s\S]*?<th style=\{\{ \.\.\.lTh, \.\.\.sC,  zIndex: 14 \}\}>C<\/th>[\s\S]*?<th style=\{\{ \.\.\.lTh, \.\.\.sD,  zIndex: 14, borderRight: dividerBorder \}\}>D<\/th>[\s\S]*?<th style=\{\{ \.\.\.lTh, width: 135, minWidth: 135 \}\}>AC<\/th>/;
  
  const newLetters = `<th style={{ ...lTh, ...sA,  zIndex: 14 }}>A</th>
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
                  <th style={{ ...lTh, width: 135, minWidth: 135 }}>AA</th>`;
                  
  code = code.replace(lettersRegex, newLetters);

  // Replace the column names row
  const namesRegex = /<td style=\{\{ \.\.\.nTd, \.\.\.sA, zIndex: 14 \}\}>Year<\/td>\s*<td style=\{\{ \.\.\.nTd, \.\.\.sB, zIndex: 14 \}\}>Funded By<\/td>\s*<td style=\{\{ \.\.\.nTd, \.\.\.sC, zIndex: 14 \}\}>Region<\/td>\s*<td style=\{\{ \.\.\.nTd, \.\.\.sD, zIndex: 14, borderRight: dividerBorder \}\}>Center<\/td>/;
  const newNames = `<td style={{ ...nTd, ...sA, zIndex: 14 }}>Funded By</td>
                  <td style={{ ...nTd, ...sB, zIndex: 14 }}>Region</td>
                  <td style={{ ...nTd, ...sC, zIndex: 14, borderRight: dividerBorder }}>Province</td>`;
  code = code.replace(namesRegex, newNames);
  
  // Province td was manually in there, we need to remove the extra one!
  // It looks like: <td style={nTd}>Province</td>
  code = code.replace('<td style={nTd}>Province</td>\n', '');

  // Now the tbody cells!
  // In `new/page.tsx`: <td style={{ ...iCell, ...sA, zIndex: 5 }}>...Year...</td>
  // In `bulk-edit/page.tsx`, it's the same.
  const bodyRegexYear = /<td style=\{\{ \.\.\.iCell, \.\.\.sA, zIndex: 5 \}\}>\s*<select\s+className="nodrag"\s+style=\{cSelect\}\s+value=\{row\.year\}[\s\S]*?<\/select>\s*<\/td>/;
  code = code.replace(bodyRegexYear, '');

  const bodyRegexFundedBy = /<td style=\{\{ \.\.\.iCell, \.\.\.sB, zIndex: 5 \}\}>/g;
  code = code.replace(bodyRegexFundedBy, '<td style={{ ...iCell, ...sA, zIndex: 5 }}>');

  const bodyRegexRegion = /<td style=\{\{ \.\.\.iCell, \.\.\.sC, zIndex: 5 \}\}>/g;
  code = code.replace(bodyRegexRegion, '<td style={{ ...iCell, ...sB, zIndex: 5 }}>');

  const bodyRegexCenter = /<td style=\{\{ \.\.\.iCell, \.\.\.sD, zIndex: 5, borderRight: dividerBorder \}\}>\s*<select\s+className="nodrag"\s+style=\{cSelect\}\s+value=\{row\.center\}[\s\S]*?<\/select>\s*<\/td>/;
  code = code.replace(bodyRegexCenter, '');

  const bodyRegexProvince = /<td style=\{iCell\}>\s*<select\s+className="nodrag"\s+style=\{cSelect\}\s+value=\{row\.province\}/;
  code = code.replace(bodyRegexProvince, '<td style={{ ...iCell, ...sC, zIndex: 5, borderRight: dividerBorder }}>\n                  <select className="nodrag" style={cSelect} value={row.province}');

  // Save the final file!
  fs.writeFileSync(filename, code);
}

processPart2('src/app/(app)/data/new/page.tsx');
processPart2('src/app/(app)/data/bulk-edit/page.tsx');
console.log('done part 2');
