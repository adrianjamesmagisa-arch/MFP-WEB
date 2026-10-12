import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { AppShell } from '@/components/AppShell'
import { getCurrentUser } from '@/lib/auth-session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getCurrentUser()

  if (!user) redirect('/login')

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
