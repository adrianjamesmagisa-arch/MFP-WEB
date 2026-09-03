import { redirect } from 'next/navigation'
import { DEFAULT_SCHOOL_YEAR } from '@/lib/sbfp-year'

export default function SbfpPage() {
  redirect(`/sbfp/summary?sy=${DEFAULT_SCHOOL_YEAR}`)
}
