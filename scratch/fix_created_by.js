const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://eeihpwwpfxoyjmhxsxwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWhwd3dwZnhveWptaHhzeHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ5NTM1OCwiZXhwIjoyMTAyMDcxMzU4fQ.RZreq0TiBRTQVhBmyK4pkRZspNgoB_kMIn-JZG05TLw'
);

(async () => {
  console.log('Fetching encoders...');
  const { data: encoders, error: err1 } = await supabase.from('profiles').select('id, center').eq('role', 'encoder');
  if (err1) { console.error('Error fetching encoders:', err1); return; }
  
  console.log(`Found ${encoders.length} encoders. Updating mfp_data...`);
  
  for (const encoder of encoders) {
    if (!encoder.center) continue;
    const { data, error } = await supabase
      .from('mfp_data')
      .update({ created_by: encoder.id })
      .eq('center', encoder.center)
      .is('created_by', null);
      
    if (error) {
      console.error(`Error updating center ${encoder.center}:`, error);
    } else {
      console.log(`Updated center ${encoder.center} to have created_by = ${encoder.id}`);
    }
  }
  
  console.log('Done!');
})();
