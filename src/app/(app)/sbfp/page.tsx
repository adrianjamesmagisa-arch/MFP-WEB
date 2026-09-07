import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_SCHOOL_YEAR } from '@/lib/sbfp-year'
import { sbfpEncoderHomePath } from '@/lib/center-aliases'

export default async function SbfpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,center')
      .eq('id', user.id)
      .single()
    if (profile?.role === 'encoder') {
      redirect(sbfpEncoderHomePath(profile.center, DEFAULT_SCHOOL_YEAR))
    }
  }
  redirect(`/sbfp/summary?sy=${DEFAULT_SCHOOL_YEAR}`)
}
