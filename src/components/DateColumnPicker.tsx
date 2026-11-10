'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toDateInputValue } from '@/lib/sbfp-raw-milk'
import styles from './DateColumnPicker.module.css'

interface DateColumnPickerProps {
  title: string
  children: ReactNode
  existingDates: readonly string[]
  onConfirm: (date: string) => void | Promise<void>
  initialDate?: string
  confirmLabel?: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

export function DateColumnPicker({ children, disabled, className, style, ...dialogProps }: DateColumnPickerProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <>
    <button ref={trigger} type="button" className={className} style={style} disabled={disabled} onClick={() => setOpen(true)}>{children}</button>
    {open && createPortal(<DateColumnDialog {...dialogProps} onClose={close} />, document.body)}
  </>
}

function DateColumnDialog({ title, existingDates, onConfirm, initialDate = '', confirmLabel = 'Add date', onClose }: Omit<DateColumnPickerProps, 'children'> & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const id = useId()
  const [draft, setDraft] = useState(initialDate)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const close = () => { dialog.current?.close(); onClose() }

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    input.current?.focus()
    return () => { element?.close() }
  }, [])

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft) || toDateInputValue(draft) !== draft) {
      setError('Choose a valid date.')
      return
    }
    if (draft !== initialDate && existingDates.some(date => toDateInputValue(date) === draft)) {
      setError('A column for this date already exists. Choose another date.')
      return
    }
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      await onConfirm(draft)
      close()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this date. Try again.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onCancel={event => {
    event.preventDefault()
    if (!inFlight.current) close()
  }}>
    <form onSubmit={confirm}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-help`}>Choose a date, then select {confirmLabel.toLowerCase()} to confirm. Browsing the calendar does not save a date.</p>
      <label htmlFor={`${id}-date`}>Date</label>
      <input ref={input} id={`${id}-date`} type="date" value={draft} required disabled={saving}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} aria-invalid={!!error}
        onChange={event => { setDraft(event.target.value); setError('') }} />
      {error && <p id={`${id}-error`} role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className="btn btn-outline" disabled={saving} onClick={close}>Cancel</button>
        <button type="submit" className="btn btn-gold" disabled={!draft || saving}>{saving ? 'Saving…' : confirmLabel}</button>
      </div>
    </form>
  </dialog>
}
