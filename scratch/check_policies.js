const https = require('node:https');
const projectRef = 'eeihpwwpfxoyjmhxsxwe';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWhwd3dwZnhveWptaHhzeHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ5NTM1OCwiZXhwIjoyMTAyMDcxMzU4fQ.RZreq0TiBRTQVhBmyK4pkRZspNgoB_kMIn-JZG05TLw';
const sql = "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'mfp_data'";
const body = JSON.stringify({ query: sql });
const options = {
  hostname: 'api.supabase.com',
  path: `/v1/projects/${projectRef}/database/query`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Length': Buffer.byteLength(body)
  }
};
const req = https.request(options, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log('Policies:', d));
});
req.on('error', e => console.error('Error:', e.message));
req.write(body);
req.end();
