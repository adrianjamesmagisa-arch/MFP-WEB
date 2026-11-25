'use client'

const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>()

/**
 * Debounced fire-and-forget capture of today's Asia/Manila SBFP status snapshot.
 * Runs in the background so encoder edits never fail or slow down.
 */
export function triggerSbfpStatusSnapshotCapture(year: number | null | undefined): void {
  if (typeof window === 'undefined') return
  const y = Number(year)
  if (!Number.isInteger(y) || y < 2020) return

  const prev = pendingTimers.get(y)
  if (prev) clearTimeout(prev)

  const timer = setTimeout(() => {
    pendingTimers.delete(y)
    void fetch('/api/sbfp/status-snapshots/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: y }),
    }).catch(() => {})
  }, 600)

  pendingTimers.set(y, timer)
}
