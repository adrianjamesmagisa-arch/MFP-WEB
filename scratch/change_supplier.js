const fs = require('fs');
let code = fs.readFileSync('src/app/(app)/data/new/page.tsx', 'utf8');

// 1. Replace the <select> for supplier_id with an <input> and <datalist>
// Old code:
// <select name="supplier_id" style={cSelect} value={row.supplier_id} onChange={hc} onFocus={fc('T', 'supplier_id')} title={row.supplier_id}>
//   <option value="">— Select —</option>
//   {cooperatives.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
// </select>

code = code.replace(
  /<select name="supplier_id" style=\{cSelect\} value=\{row\.supplier_id\} onChange=\{hc\} onFocus=\{fc\('T', 'supplier_id'\)\} title=\{row\.supplier_id\}>\s*<option value="">— Select —<\/option>\s*\{cooperatives\.map\(c => <option key=\{c\.id\} value=\{c\.id\}>\{c\.name\}<\/option>\)\}\s*<\/select>/,
  `<input list={"suppliers-" + rowIdx} name="supplier_id" style={cInput} placeholder="Type to search..." value={row.supplier_id} onChange={hc} onFocus={fc('T', 'supplier_id')} title={row.supplier_id} onKeyDown={noEnter} />
          <datalist id={"suppliers-" + rowIdx}>
            {cooperatives.map(c => <option key={c.id} value={c.name} />)}
          </datalist>`
);

// 2. In handleSubmit, convert the supplier name to ID before inserting
// Old code:
// supplier_id: f.supplier_id || null,
// We want to replace it with a lookup.
// We can use cooperatives.find(c => c.name === f.supplier_id)?.id || null

code = code.replace(
  /supplier_id: f\.supplier_id \|\| null,/,
  `supplier_id: cooperatives.find(c => c.name === f.supplier_id)?.id || null,`
);

fs.writeFileSync('src/app/(app)/data/new/page.tsx', code);
console.log('done modifying new/page.tsx');

// We should do exactly the same for bulk-edit/page.tsx !
let codeBulk = fs.readFileSync('src/app/(app)/data/bulk-edit/page.tsx', 'utf8');

codeBulk = codeBulk.replace(
  /<select name="supplier_id" style=\{cSelect\} value=\{row\.supplier_id\} onChange=\{hc\} onFocus=\{fc\('T', 'supplier_id'\)\} title=\{row\.supplier_id\}\s*disabled=\{!isSuperAdmin && !!profile\?.center\}>\s*<option value="">— Select —<\/option>\s*\{cooperatives\.map\(c => <option key=\{c\.id\} value=\{c\.id\}>\{c\.name\}<\/option>\)\}\s*<\/select>/,
  `<input list={"suppliers-" + rowIdx} name="supplier_id" style={cInput} placeholder="Type to search..." value={row.supplier_id} onChange={hc} onFocus={fc('T', 'supplier_id')} title={row.supplier_id} onKeyDown={noEnter} disabled={!isSuperAdmin && !!profile?.center} />
          <datalist id={"suppliers-" + rowIdx}>
            {cooperatives.map(c => <option key={c.id} value={c.name} />)}
          </datalist>`
);

// Note: bulk edit might not have `disabled={!isSuperAdmin && !!profile?.center}` on supplier, wait! Supplier is NOT restricted by center. Only the "Center" column is restricted! Let me double check if I used it safely.
// I'll make the regex more permissive for bulk edit.
codeBulk = codeBulk.replace(
  /<select name="supplier_id"[^>]*>\s*<option value="">— Select —<\/option>\s*\{cooperatives\.map\(c => <option key=\{c\.id\} value=\{c\.id\}>\{c\.name\}<\/option>\)\}\s*<\/select>/,
  `<input list={"suppliers-" + rowIdx} name="supplier_id" style={cInput} placeholder="Type to search..." value={row.supplier_id || ''} onChange={hc} onFocus={fc('T', 'supplier_id')} title={row.supplier_id || ''} onKeyDown={noEnter} />
          <datalist id={"suppliers-" + rowIdx}>
            {cooperatives.map(c => <option key={c.id} value={c.name} />)}
          </datalist>`
);

codeBulk = codeBulk.replace(
  /supplier_id: f\.supplier_id \|\| null,/,
  `supplier_id: cooperatives.find(c => c.name === f.supplier_id)?.id || f.supplier_id || null,` // Fallback to f.supplier_id just in case they already had an ID string loaded from DB
);

fs.writeFileSync('src/app/(app)/data/bulk-edit/page.tsx', codeBulk);
console.log('done modifying bulk-edit/page.tsx');
