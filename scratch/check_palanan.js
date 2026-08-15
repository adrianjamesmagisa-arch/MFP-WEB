const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://eeihpwwpfxoyjmhxsxwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWhwd3dwZnhveWptaHhzeHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ5NTM1OCwiZXhwIjoyMTAyMDcxMzU4fQ.RZreq0TiBRTQVhBmyK4pkRZspNgoB_kMIn-JZG05TLw'
);

(async () => {
  const { data, error } = await supabase.from('mfp_data').select('id, center, municipality, milk_packs, updated_at').eq('municipality', 'PALANAN').limit(5);
  console.log(data);
})();
