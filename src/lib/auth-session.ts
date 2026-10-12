import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  role: 'super_admin' | 'admin' | 'encoder' | 'viewer' | string
  center?: string | null
  full_name?: string | null
  email?: string | null
  [key: string]: any
}

export interface CurrentUserSession {
  user: User | null
  profile: UserProfile | null
}

/**
 * Memoized per HTTP request via React 19 `cache()`.
 * Multiple calls across AppLayout, nested layouts, and Page components
 * will only execute 1 single network round-trip to Supabase Auth & Profiles.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUserSession> => {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { user: null, profile: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  return {
    user,
    profile: (profile as UserProfile) || null,
  }
})
