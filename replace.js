const fs = require('fs');

const dataPage = fs.readFileSync('src/app/(app)/data/page.tsx', 'utf-8');
const masterlistPage = fs.readFileSync('src/app/(app)/centers/[center]/masterlist/page.tsx', 'utf-8');

const tableStart = '<table className="data-table"';
const tableEnd = '</table>';

const dataTableStart = dataPage.indexOf(tableStart);
const dataTableEnd = dataPage.indexOf(tableEnd, dataTableStart) + tableEnd.length;

const masterlistTableStart = masterlistPage.indexOf(tableStart);
const masterlistTableEnd = masterlistPage.indexOf(tableEnd, masterlistTableStart) + tableEnd.length;

if (dataTableStart > -1 && masterlistTableStart > -1) {
  const newTable = dataPage.substring(dataTableStart, dataTableEnd);
  const newMasterlistPage = masterlistPage.substring(0, masterlistTableStart) + newTable + masterlistPage.substring(masterlistTableEnd);
  fs.writeFileSync('src/app/(app)/centers/[center]/masterlist/page.tsx', newMasterlistPage);
  console.log('Replaced table successfully!');
} else {
  console.log('Failed to find tags');
}
