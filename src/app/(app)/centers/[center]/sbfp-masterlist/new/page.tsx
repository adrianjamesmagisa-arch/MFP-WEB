'use client'

import { useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { REGIONS } from '@/lib/types'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewCenterSbfpDataPage({ params }: { params: Promise<{ center: string }> }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const resolvedParams = use(params)
  const decodedCenter = decodeURIComponent(resolvedParams.center)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    
    const formData = new FormData(e.currentTarget)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const record = {
        year: parseInt(formData.get('year') as string),
        region: formData.get('region') as string,
        sdo: formData.get('sdo') as string,
        procurement_status: formData.get('procurement_status') as string,
        packs_to_deliver: parseInt(formData.get('packs_to_deliver') as string) || 0,
        milk_type: formData.get('milk_type') as string,
        delivery_schedule: formData.get('delivery_schedule') as string,
        packs_delivered: parseInt(formData.get('packs_delivered') as string) || 0,
        center: decodedCenter,
        created_by: user?.id
      }

      const { error } = await supabase.from('sbfp_data').insert([record])
      if (error) throw error
      
      router.push(`/centers/${resolvedParams.center}/sbfp-masterlist`)
      router.refresh()
    } catch (error) {
      console.error('Error adding record:', error)
      alert('Failed to add record. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/centers/${resolvedParams.center}/sbfp-masterlist`} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add SBFP Record ({decodedCenter})</h1>
          <p className="text-muted-foreground text-sm">Enter details for the SBFP Monitoring</p>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Year</label>
              <input name="year" type="number" required defaultValue={currentYear} className="w-full p-2 border rounded bg-background" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Region</label>
              <select name="region" required className="w-full p-2 border rounded bg-background">
                <option value="">Select Region</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Schools Division Office (SDO)</label>
              <input name="sdo" type="text" required placeholder="e.g. Science City of Muñoz" className="w-full p-2 border rounded bg-background" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Procurement Status</label>
              <select name="procurement_status" required className="w-full p-2 border rounded bg-background">
                <option value="">Select Status</option>
                <option value="Not Started">Not Started</option>
                <option value="For Preparation">For Preparation</option>
                <option value="Ongoing (For Award)">Ongoing (For Award)</option>
                <option value="Awarded (For Delivery)">Awarded (For Delivery)</option>
                <option value="Awarded (Ongoing Delivery)">Awarded (Ongoing Delivery)</option>
                <option value="Ongoing">Ongoing</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Milk Type</label>
              <select name="milk_type" required className="w-full p-2 border rounded bg-background">
                <option value="">Select Type</option>
                <option value="Pasteurized">Pasteurized</option>
                <option value="Sterilized">Sterilized</option>
                <option value="Commercial">Commercial</option>
                <option value="SM">SM</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Expected Schedule of Delivery</label>
              <input name="delivery_schedule" type="text" required placeholder="e.g. August to November 2026" className="w-full p-2 border rounded bg-background" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">No. of Milk Packs to be Delivered</label>
              <input name="packs_to_deliver" type="number" required defaultValue={0} min={0} className="w-full p-2 border rounded bg-background" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">No. of Milk Packs Delivered</label>
              <input name="packs_delivered" type="number" required defaultValue={0} min={0} className="w-full p-2 border rounded bg-background" />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-4 border-t">
            <Link href={`/centers/${resolvedParams.center}/sbfp-masterlist`} className="px-4 py-2 border rounded hover:bg-muted font-medium">
              Cancel
            </Link>
            <button 
              type="submit" 
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
