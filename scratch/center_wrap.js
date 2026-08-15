const fs = require('fs');

function centerStyles(file) {
  let code = fs.readFileSync(file, 'utf8');

  // Change nTd from whiteSpace: 'nowrap' to whiteSpace: 'normal', and add textAlign: 'center'
  // Currently:
  // const nTd: React.CSSProperties = {
  //   background: '#f8fafc', color: '#1e293b', fontWeight: 600, fontSize: '0.73rem',
  //   padding: '4px 8px', border: '1px solid #e2e8f0', height: 36,
  //   verticalAlign: 'middle', whiteSpace: 'nowrap', boxSizing: 'border-box',
  // }
  
  code = code.replace(/whiteSpace: 'nowrap'/g, "whiteSpace: 'normal', textAlign: 'center'");

  // Note: For cInput, whiteSpace: 'normal' might not work on <input> but it's fine. We need to add textAlign: 'center'
  // Currently:
  // const cInput: React.CSSProperties = {
  //   display: 'block', width: '100%', height: ROW_H,
  //   border: 'none', outline: 'none',
  //   padding: '0 8px', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif',
  //   background: 'transparent', color: '#1e293b', boxSizing: 'border-box' as const,
  //   verticalAlign: 'middle', whiteSpace: 'normal', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis'
  // }
  
  // Actually, replacing whiteSpace: 'nowrap' with whiteSpace: 'normal', textAlign: 'center' will hit cInput too, which is perfect!

  fs.writeFileSync(file, code);
}

centerStyles('src/app/(app)/data/new/page.tsx');
centerStyles('src/app/(app)/data/bulk-edit/page.tsx');
console.log('done centerStyles');
