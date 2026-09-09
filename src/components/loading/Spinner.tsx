'use client'

import clsx from 'clsx'

export function Spinner({
  size = 16,
  className,
  label,
}: {
  size?: number
  className?: string
  label?: string
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label || 'Loading'}
      className={clsx('inline-block shrink-0 animate-spin rounded-full border-2 border-[var(--gold)] border-t-transparent', className)}
      style={{ width: size, height: size }}
    />
  )
}
