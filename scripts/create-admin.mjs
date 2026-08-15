import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://eeihpwwpfxoyjmhxsxwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWhwd3dwZnhveWptaHhzeHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ5NTM1OCwiZXhwIjoyMTAyMDcxMzU4fQ.RZreq0TiBRTQVhBmyK4pkRZspNgoB_kMIn-JZG05TLw' // Service Role Key
)

async function main() {
  console.log('Creating admin user...')
  
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'admin@pcc.da.gov.ph',
    password: 'PCC@admin2026!',
    email_confirm: true,
    user_metadata: {
      full_name: 'System Administrator'
    }
  })

  if (error) {
    console.error('Error creating user:', error.message)
    process.exit(1)
  }

  console.log('User created successfully:', data.user.id)
  
  console.log('Updating user role to super_admin...')
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', data.user.id)

  if (profileError) {
    console.error('Error updating profile:', profileError.message)
    process.exit(1)
  }

  console.log('Role updated successfully!')
}

main()
