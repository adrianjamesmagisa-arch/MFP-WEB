import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { AppShell } from '@/components/AppShell'

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
    <AppShell
      sidebar={
        <Sidebar
          userRole={profile?.role ?? 'viewer'}
          userCenter={profile?.center ?? ''}
          userName={profile?.full_name ?? user.email ?? ''}
        />
      }
    >
      {children}
    </AppShell>
  )
}
