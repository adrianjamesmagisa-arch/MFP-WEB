import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Clock3,
  FilePlus2,
  PencilLine,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  groupActivityByDay,
  loadCenterActivityLog,
  type CenterActivityEvent,
} from '@/lib/center-activity'

function ActionIcon({ action }: { action: CenterActivityEvent['action'] }) {
  if (action === 'created') return <FilePlus2 size={16} color="#059669" />
  if (action === 'deleted') return <Trash2 size={16} color="#dc2626" />
  return <PencilLine size={16} color="#4f46e5" />
}

function actionTone(action: CenterActivityEvent['action']) {
  if (action === 'created') return { bg: '#ecfdf5', border: '#a7f3d0', label: 'Created' }
  if (action === 'deleted') return { bg: '#fef2f2', border: '#fecaca', label: 'Deleted' }
  return { bg: '#eef2ff', border: '#c7d2fe', label: 'Edited' }
}

export default async function CenterDetailPage({ params }: { params: Promise<{ center: string }> }) {
  const { center } = await params
  const decodedCenter = decodeURIComponent(center)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  if (profile?.role === 'encoder') {
    redirect('/dashboard')
  }

  const { events, logReady } = await loadCenterActivityLog(supabase, decodedCenter, { limit: 500 })
  const groups = groupActivityByDay(events)

  return (
    <div>
      <div className="page-header">
        <div>
          <Link
            href="/centers"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: '#64748b',
              textDecoration: 'none',
              fontSize: '0.8rem',
              marginBottom: '0.5rem',
            }}
          >
            <ChevronLeft size={14} /> Back to Centers
          </Link>
          <h1 className="page-title">{decodedCenter} activity</h1>
          <p className="page-subtitle">
            Track when this center created or edited records · {events.length} event
            {events.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href={`/data?center=${encodeURIComponent(decodedCenter)}`}
          className="btn btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ExternalLink size={15} />
          Open MFP Data
        </Link>
      </div>

      {!logReady && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 10,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            fontSize: '0.82rem',
          }}
        >
          Detailed actor logging is not enabled on the database yet. Showing create/update times from
          existing records. Apply migration{' '}
          <code>20260916100000_mfp_center_activity.sql</code> in Supabase for named editor history.
        </div>
      )}

      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Clock3 size={16} color="#64748b" />
          <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>Activity log</strong>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            Newest first · relative times
          </span>
        </div>

        {groups.length === 0 ? (
          <div style={{ padding: '2.5rem 1.25rem', textAlign: 'center', color: '#94a3b8' }}>
            No create or edit activity found for this center yet.
          </div>
        ) : (
          <div>
            {groups.map(group => (
              <section key={group.key}>
                <div
                  style={{
                    padding: '0.55rem 1.25rem',
                    background: '#f1f5f9',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: '#475569',
                  }}
                >
                  {group.label}
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {group.events.map(event => {
                    const tone = actionTone(event.action)
                    const when = new Date(event.at)
                    return (
                      <li
                        key={event.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'auto 1fr auto',
                          gap: '0.85rem',
                          alignItems: 'start',
                          padding: '0.9rem 1.25rem',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background: tone.bg,
                            border: `1px solid ${tone.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 2,
                          }}
                        >
                          <ActionIcon action={event.action} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                color: '#334155',
                                background: tone.bg,
                                border: `1px solid ${tone.border}`,
                                borderRadius: 999,
                                padding: '0.1rem 0.5rem',
                              }}
                            >
                              {tone.label}
                            </span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>
                              {event.summary}
                            </span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: '0.78rem', color: '#64748b' }}>
                            {event.actorName ? (
                              <>
                                by <strong style={{ color: '#334155' }}>{event.actorName}</strong>
                                {event.detail ? ` · ${event.detail}` : ''}
                              </>
                            ) : event.detail ? (
                              event.detail
                            ) : (
                              'Center activity'
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 110 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#312e81' }}>
                            {Number.isNaN(when.getTime())
                              ? '—'
                              : formatDistanceToNow(when, { addSuffix: true })}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
                            {Number.isNaN(when.getTime()) ? '' : format(when, 'MMM d, yyyy · h:mm a')}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
