import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { canEditDropoffFinance, DROPOFF_MONEY_FIELDS, parseDropoffAmount } from '@/lib/sbfp-dropoff-finance'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('id' in body) || !('field' in body) ||
    !('value' in body) || !('expectedValue' in body) ||
    typeof body.id !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.id) ||
    !DROPOFF_MONEY_FIELDS.some(field => field === body.field)) {
    return NextResponse.json({ error: 'Invalid school financial update.' }, { status: 400 })
  }
  const field = String(body.field)
  const amount = parseDropoffAmount(body.value)
  const expected = parseDropoffAmount(body.expectedValue)
  if (amount.error || expected.error) {
    return NextResponse.json({ error: amount.error || expected.error }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role,center').eq('id', user.id).single()
  if (profileError || !profile || !['super_admin', 'encoder'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { data: source, error: loadError } = await supabaseAdmin
    .from('sbfp_dropoff_points').select('*').eq('id', body.id).maybeSingle()
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
  if (!source) return NextResponse.json({ error: 'School not found.' }, { status: 404 })
  if (!canEditDropoffFinance(profile, source.center)) {
    return NextResponse.json({ error: 'You can only edit schools for your assigned center.' }, { status: 403 })
  }
  if (!(field in source) || !('contract_unit_price' in source)) {
    return NextResponse.json({ error: 'Automatic school financial migration is not available yet.' }, { status: 503 })
  }
  if (amount.value == null && source[field] != null) {
    return NextResponse.json({ error: 'Enter 0 to remove an amount that was already encoded.' }, { status: 400 })
  }
  // The migration's trigger updates an existing linked MFP row in this same transaction.
  // Compare the previous field value so another encoder's change cannot be silently overwritten.
  let query = supabaseAdmin.from('sbfp_dropoff_points')
    .update({ [field]: amount.value, updated_at: new Date().toISOString() })
    .eq('id', body.id).eq('center', source.center).eq('year', source.year)
  query = expected.value == null ? query.is(field, null) : query.eq(field, expected.value)
  const { data: saved, error: saveError } = await query.select('*').maybeSingle()
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })
  if (!saved) return NextResponse.json({ error: 'This school changed since you loaded it. Refresh and try again.' }, { status: 409 })
  const { data: mirror, error: mirrorError } = await supabaseAdmin.from('mfp_data')
    .select('id').eq('source_dropoff_id', saved.id).maybeSingle()
  const warning = saved.include_in_masterlist === false ? null : mirrorError
    ? 'School amounts were saved, but the MFP link could not be verified. Refresh MFP Data to check it.'
    : !mirror ? 'School amounts were saved, but this school has no linked MFP Data record. Its available SBFP values remain visible in the 2026 DepEd list; no MFP record was created by this financial save.' : null
  return NextResponse.json({ dropoff: saved, warning })
}
