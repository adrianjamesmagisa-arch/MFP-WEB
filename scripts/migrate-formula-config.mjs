/**
 * Migration: Add formula_config JSONB column to profiles
 * Run: node scripts/migrate-formula-config.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://eeihpwwpfxoyjmhxsxwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWhwd3dwZnhveWptaHhzeHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ5NTM1OCwiZXhwIjoyMTAyMDcxMzU4fQ.RZreq0TiBRTQVhBmyK4pkRZspNgoB_kMIn-JZG05TLw'
)

// First, check if column already exists by trying to read it
const { data: testData, error: testErr } = await supabase
  .from('profiles')
  .select('formula_config')
  .limit(1)

if (testErr) {
  if (testErr.message.includes('formula_config')) {
    console.log('Column does not exist yet — need to add it via Supabase Dashboard SQL editor.')
    console.log('\nPlease run this SQL in your Supabase Dashboard > SQL Editor:')
    console.log(`
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS formula_config JSONB DEFAULT '{}'::jsonb;
    `.trim())
  } else {
    console.error('Unexpected error:', testErr.message)
  }
} else {
  console.log('✅ Column formula_config already exists on profiles table!')
  console.log('Sample data:', JSON.stringify(testData?.[0]))
}
