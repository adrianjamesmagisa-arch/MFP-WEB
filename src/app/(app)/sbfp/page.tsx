import { redirect } from 'next/navigation'
import { sbfpEncoderHomePath } from '@/lib/center-aliases'
import { SbfpCenterSelector } from '@/components/SbfpCenterSelector'
import { getCurrentUser } from '@/lib/auth-session'

export default async function SbfpPage() {
  const { user, profile } = await getCurrentUser()
  if (!user) redirect('/login')

  if (profile?.role === 'encoder') {
    redirect(sbfpEncoderHomePath(profile.center))
  }

  return <SbfpCenterSelector />
}
