const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://eeihpwwpfxoyjmhxsxwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWhwd3dwZnhveWptaHhzeHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ5NTM1OCwiZXhwIjoyMTAyMDcxMzU4fQ.RZreq0TiBRTQVhBmyK4pkRZspNgoB_kMIn-JZG05TLw'
);

(async () => {
  const { data: records } = await supabase.from('mfp_data').select('*').eq('municipality', 'PALANAN').limit(1);
  if (!records || records.length === 0) { console.log('not found'); return; }
  const record = records[0];
  const updateData = { milk_packs: 99999 };
  const { data, error } = await supabase.from('mfp_data').update(updateData).eq('id', record.id).select();
  console.log('Update result:', data, error);
})();
