import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sbfpEncoderHomePath } from '@/lib/center-aliases'
import { SbfpCenterSelector } from '@/components/SbfpCenterSelector'

export default async function SbfpPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,center')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'encoder') {
    redirect(sbfpEncoderHomePath(profile.center))
  }

  return <SbfpCenterSelector />
}
