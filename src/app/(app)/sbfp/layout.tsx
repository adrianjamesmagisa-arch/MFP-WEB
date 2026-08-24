import { SbfpSubSidebar } from '@/components/SbfpSubSidebar'

export default function SbfpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <SbfpSubSidebar />
      <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {children}
      </main>
    </div>
  )
}
