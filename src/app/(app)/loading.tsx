import { Spinner } from '@/components/loading/Spinner'

export default function AppLoading() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        gap: '1rem',
        color: 'var(--gray-600)',
      }}
    >
      <Spinner size={32} label="Loading page" />
      <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading…</p>
    </div>
  )
}
