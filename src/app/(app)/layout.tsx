import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        userRole={profile?.role ?? 'viewer'}
        userCenter={profile?.center ?? ''}
        userName={profile?.full_name ?? user.email ?? ''}
      />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--gray-50)' }}>
        <div style={{ padding: '2rem' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
