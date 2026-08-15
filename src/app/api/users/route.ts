import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { email, password, full_name, role, center } = body

    // 1. Create user in auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    const newUserId = authData.user.id

    // 2. Insert into profiles
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: newUserId,
      email,
      full_name,
      role,
      center: center || null,
    })

    if (profileError) {
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, user: authData.user })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
