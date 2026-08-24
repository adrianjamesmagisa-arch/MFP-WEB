import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { SbfpDataFilters } from '@/components/SbfpDataFilters'
import { SbfpDataTable } from '@/components/SbfpDataTable'
import { REGIONS, PCC_CENTERS } from '@/lib/types'

export default async function CenterSbfpMasterlist({
  params,
  searchParams
}: {
  params: Promise<{ center: string }>
  searchParams: Promise<{
    year?: string; region?: string; sdo?: string; procurement_status?: string; search?: string;
  }>
}) {
  const { center } = await params
  const decodedCenter = decodeURIComponent(center)
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const sParams = await searchParams
  let query = supabase
    .from('sbfp_data')
    .select('*')
    .eq('center', decodedCenter)
    .order('year', { ascending: false })
    .order('region', { ascending: true })
    .order('sdo', { ascending: true })
    .limit(300)

  // Handle Search parameter
  if (sParams.search) {
    query = query.or(`region.ilike.%${sParams.search}%,sdo.ilike.%${sParams.search}%`)
  }

  // Handle specific filter categories
  if (sParams.year) query = query.eq('year', Number(sParams.year))
  if (sParams.region) query = query.eq('region', sParams.region)
  if (sParams.sdo) query = query.eq('sdo', sParams.sdo)
  if (sParams.procurement_status) query = query.eq('procurement_status', sParams.procurement_status)

  const { data: records, error } = await query
  
  if (error) {
    console.error('Error fetching sbfp_data:', error)
  }

  // Fetch unique filter options for dynamic fields
  let filterQuery = supabase.from('sbfp_data').select('sdo').eq('center', decodedCenter).limit(5000)
  const { data: allData } = await filterQuery

  const getUnique = (key: string) => 
    Array.from(new Set(allData?.map(d => d[key as keyof typeof d]).filter(Boolean) as string[])).sort()

  const filterOptions = {
    year: ['2024', '2025', '2026', '2027'],
    region: REGIONS,
    sdo: getUnique('sdo'),
    procurement_status: ['For Preparation', 'Ongoing (For Award)', 'Awarded (For Delivery)', 'Awarded (Ongoing Delivery)', 'Ongoing', 'Completed', 'Not Started'],
    center: PCC_CENTERS,
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{decodedCenter} SBFP Masterlist</h1>
          <p className="text-muted-foreground mt-1">
            Manage SBFP Monitoring data for this center
          </p>
        </div>
        
        {profile?.role !== 'viewer' && (
          <div className="flex gap-2">
            <Link 
              href={`/centers/${center}/sbfp-masterlist/new`}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Record
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 w-full">
        <SbfpDataFilters filterOptions={filterOptions} />
      </div>
      
      <div className="w-full">
        <SbfpDataTable records={records || []} userRole={profile?.role} />
      </div>
    </div>
  )
}
