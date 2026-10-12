import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
import { loadDashboardStats } from '@/lib/dashboard-stats'
import { getCurrentUser } from '@/lib/auth-session'

export default async function DashboardPage(props: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>
}) {
  const searchParams = await props.searchParams
  const { user, profile } = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const isEncoder = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : searchParams.center
  const year = searchParams.year ? parseInt(searchParams.year, 10) : undefined
  const month = searchParams.month ? parseInt(searchParams.month, 10) : undefined

  const stats = await loadDashboardStats(supabase, {
    year: Number.isFinite(year) ? year : undefined,
    month: Number.isFinite(month) && month! >= 1 && month! <= 12 ? month : undefined,
    center: centerFilter || undefined,
  })

  return (
    <DashboardOverview
      stats={stats}
      userName={profile?.full_name ?? user.email ?? 'User'}
      userRole={profile?.role ?? undefined}
      userCenter={profile?.center ?? undefined}
      centerFilter={centerFilter || undefined}
      isEncoder={isEncoder}
    />
  )
}
