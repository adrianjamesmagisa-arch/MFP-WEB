'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { Spinner } from '@/components/loading/Spinner'

type TaskEntry = { message: string; blocking: boolean }

type AsyncFeedbackContextValue = {
  isNavigating: boolean
  isBlocking: boolean
  pendingCount: number
  statusMessage: string | null
  runAsync: <T>(message: string, fn: () => Promise<T>, opts?: { blocking?: boolean }) => Promise<T>
  beginTask: (id: string, message?: string, opts?: { blocking?: boolean }) => void
  endTask: (id: string) => void
}

const AsyncFeedbackContext = createContext<AsyncFeedbackContextValue | null>(null)

export function useAsyncFeedback() {
  const ctx = useContext(AsyncFeedbackContext)
  if (!ctx) {
    throw new Error('useAsyncFeedback must be used within AsyncFeedbackProvider')
  }
  return ctx
}

/** Safe when provider is optional (e.g. login page). */
export function useAsyncFeedbackOptional() {
  return useContext(AsyncFeedbackContext)
}

function GlobalLoadingBar({ active }: { active: boolean }) {
  return (
    <div
      className="global-loading-bar"
      data-active={active ? 'true' : 'false'}
      aria-hidden={!active}
    />
  )
}

function LoadingModal({ show, message }: { show: boolean; message: string | null }) {
  if (!show) return null
  return (
    <div
      className="async-loading-modal"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      aria-labelledby="async-loading-title"
      aria-describedby="async-loading-msg"
    >
      <div className="async-loading-modal__card">
        <div className="async-loading-modal__spinner">
          <Spinner size={52} label="Please wait" />
        </div>
        <p id="async-loading-title" className="async-loading-modal__title">
          Please wait
        </p>
        <p id="async-loading-msg" className="async-loading-modal__message">
          {message || 'The system is working…'}
        </p>
        <p className="async-loading-modal__hint">Do not click again until this finishes.</p>
      </div>
    </div>
  )
}

export function AsyncFeedbackProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [isNavigating, setIsNavigating] = useState(false)
  const [tasks, setTasks] = useState<Record<string, TaskEntry>>({})
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevPathRef = useRef(pathname)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!anchor || anchor.getAttribute('target') === '_blank') return
      const href = anchor.getAttribute('href')
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:') || href.startsWith('http')) return
      const pathOnly = href.split('?')[0]
      if (pathOnly === pathname && !href.includes('?')) return
      setIsNavigating(true)
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
      navTimeoutRef.current = setTimeout(() => setIsNavigating(false), 15000)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pathname])

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname
      setIsNavigating(false)
      if (navTimeoutRef.current) {
        clearTimeout(navTimeoutRef.current)
        navTimeoutRef.current = null
      }
    }
  }, [pathname])

  const beginTask = useCallback(
    (id: string, message = 'Working…', opts?: { blocking?: boolean }) => {
      setTasks(prev => ({
        ...prev,
        [id]: { message, blocking: opts?.blocking ?? false },
      }))
    },
    [],
  )

  const endTask = useCallback((id: string) => {
    setTasks(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const runAsync = useCallback(
    async <T,>(message: string, fn: () => Promise<T>, opts?: { blocking?: boolean }) => {
      const id = `task-${Math.random().toString(36).slice(2)}`
      beginTask(id, message, opts)
      try {
        return await fn()
      } finally {
        endTask(id)
      }
    },
    [beginTask, endTask],
  )

  const taskList = useMemo(() => Object.values(tasks), [tasks])
  const pendingCount = taskList.length
  const blockingTasks = taskList.filter(t => t.blocking)
  const isBlocking = blockingTasks.length > 0
  // Full-screen modal only for navigation + explicit blocking work (delete, create year, …).
  // Quiet cell saves must not interrupt encoders.
  const modalActive = isNavigating || isBlocking
  const statusMessage = isBlocking
    ? blockingTasks[blockingTasks.length - 1].message
    : isNavigating
      ? 'Loading page…'
      : null
  // Top bar only for blocking / navigation — quiet cell saves stay invisible
  const barActive = modalActive

  const value = useMemo(
    () => ({
      isNavigating,
      isBlocking,
      pendingCount,
      statusMessage,
      runAsync,
      beginTask,
      endTask,
    }),
    [isNavigating, isBlocking, pendingCount, statusMessage, runAsync, beginTask, endTask],
  )

  return (
    <AsyncFeedbackContext.Provider value={value}>
      <GlobalLoadingBar active={barActive} />
      {children}
      <LoadingModal show={modalActive} message={statusMessage} />
    </AsyncFeedbackContext.Provider>
  )
}

/** Wrap async handlers with automatic task tracking (non-blocking by default). */
export function useAsyncTask(defaultMessage = 'Saving…') {
  const { beginTask, endTask } = useAsyncFeedback()
  const baseId = useId()

  return useCallback(
    async <T,>(
      fn: () => Promise<T>,
      message = defaultMessage,
      opts?: { blocking?: boolean },
    ): Promise<T> => {
      const id = `${baseId}-${Math.random().toString(36).slice(2)}`
      beginTask(id, message, opts)
      try {
        return await fn()
      } finally {
        endTask(id)
      }
    },
    [baseId, beginTask, endTask, defaultMessage],
  )
}

export function AppMainWithLoading({
  children,
  style,
}: {
  children: ReactNode
  style?: React.CSSProperties
}) {
  const ctx = useAsyncFeedbackOptional()
  const busy = ctx ? ctx.isNavigating || ctx.isBlocking : false

  return (
    <main
      style={style}
      aria-busy={busy}
      className={ctx?.isNavigating ? 'app-main-navigating' : undefined}
    >
      {children}
    </main>
  )
}
